import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import {
  DataSource,
  EntityManager,
  IsNull,
  LessThan,
  Repository,
} from 'typeorm';
import { Env } from '../../config/env.validation';
import { RefreshToken } from '../../database/entities';
import {
  generateRefreshToken,
  hashRefreshToken,
} from '../security/refresh-token.util';

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

export type RotationResult =
  | { kind: 'rotated'; userId: number; token: string }
  | { kind: 'grace'; userId: number }
  | { kind: 'reuse' }
  | { kind: 'invalid' };

/** How long a just-rotated token is still honoured, so two tabs refreshing at once do not look like token theft. */
export const REFRESH_GRACE_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const REVOKED_RETENTION_MS = 7 * DAY_MS;

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Starts a new token family for a fresh login and tidies the user's stale rows. */
  async issueForLogin(userId: number, meta: ClientMeta): Promise<string> {
    await this.prune(userId);
    const { token } = await this.create(
      this.dataSource.manager,
      userId,
      randomUUID(),
      meta,
    );
    return token;
  }

  /**
   * Exchanges a refresh token for its successor. Runs in one transaction with a row lock so concurrent refreshes with the
   * same token are serialised. The reuse branch commits its revocation and only then reports failure; throwing inside the
   * transaction would roll the revocation back.
   */
  async rotate(presented: string, meta: ClientMeta): Promise<RotationResult> {
    const hash = hashRefreshToken(presented);

    return this.dataSource.transaction(async (em): Promise<RotationResult> => {
      const repo = em.getRepository(RefreshToken);
      const row = await repo.findOne({
        where: { tokenHash: hash },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();

      if (!row || row.expiresAt <= now) return { kind: 'invalid' };

      if (row.revokedAt) {
        const rotatedRecently =
          row.replacedById !== null &&
          now.getTime() - row.revokedAt.getTime() <= REFRESH_GRACE_MS;
        if (
          rotatedRecently &&
          (await this.isSessionAlive(repo, row.replacedById))
        ) {
          return { kind: 'grace', userId: row.userId };
        }
        await repo.update(
          { familyId: row.familyId, revokedAt: IsNull() },
          { revokedAt: now },
        );
        return { kind: 'reuse' };
      }

      const next = await this.create(em, row.userId, row.familyId, meta);
      await repo.update(row.id, {
        revokedAt: now,
        replacedById: next.entity.id,
      });
      return { kind: 'rotated', userId: row.userId, token: next.token };
    });
  }

  /**
   * The grace window only exists for two tabs refreshing together. It must not outlive the session: after logout, a
   * password reset or a reuse alarm the newest token of the chain is revoked, and an older token must not mint access.
   * Walks the rotation chain to its newest token and checks that one is still usable.
   */
  private async isSessionAlive(
    repo: Repository<RefreshToken>,
    successorId: number | null,
  ): Promise<boolean> {
    let currentId = successorId;
    for (let hops = 0; currentId !== null && hops < 10; hops += 1) {
      const token = await repo.findOne({ where: { id: currentId } });
      if (!token) return false;
      if (!token.revokedAt) return token.expiresAt > new Date();
      currentId = token.replacedById;
    }
    return false;
  }

  /** Logout: kills the presented token's whole family so no sibling token can resurrect the session. */
  async revokeFamilyOf(presented: string): Promise<void> {
    const repo = this.dataSource.getRepository(RefreshToken);
    const row = await repo.findOne({
      where: { tokenHash: hashRefreshToken(presented) },
    });
    if (!row) return;
    await repo.update(
      { familyId: row.familyId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  private async create(
    em: EntityManager,
    userId: number,
    familyId: string,
    meta: ClientMeta,
  ): Promise<{ token: string; entity: RefreshToken }> {
    const { token, hash } = generateRefreshToken();
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const repo = em.getRepository(RefreshToken);
    const entity = await repo.save(
      repo.create({
        userId,
        familyId,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + ttlDays * DAY_MS),
        revokedAt: null,
        replacedById: null,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
        ip: meta.ip?.slice(0, 64) ?? null,
      }),
    );
    return { token, entity };
  }

  /** Deletes expired rows and rows revoked long ago. Recently revoked rows stay so reuse detection keeps working. */
  private async prune(userId: number): Promise<void> {
    const now = Date.now();
    await this.dataSource.getRepository(RefreshToken).delete([
      { userId, expiresAt: LessThan(new Date(now)) },
      { userId, revokedAt: LessThan(new Date(now - REVOKED_RETENTION_MS)) },
    ]);
  }
}
