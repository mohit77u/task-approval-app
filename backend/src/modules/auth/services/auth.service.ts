import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { isRoleCode } from '../../../common/enums/role-code.enum';
import { AppException } from '../../../common/errors/app.exception';
import { User } from '../../users/entities/user.entity';
import { PasswordService } from '../../security/services/password.service';
import { TokenService } from '../../security/services/token.service';
import { toUserSummary, UserSummary } from '../../users/mappers/user.mapper';
import { ClientMeta, RefreshTokenService } from './refresh-token.service';

export interface LoginResult {
  user: UserSummary;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  /** Absent when the presented token was inside the grace window: the first response already delivered the new one. */
  refreshToken?: string;
}

const SESSION_ENDED = 'Session expired. Please sign in again.';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async login(
    email: string,
    password: string,
    meta: ClientMeta,
  ): Promise<LoginResult> {
    const user = await this.users.findOne({
      where: { email, deletedAt: IsNull() },
    });
    // Same work and same error whether the email exists or not, so neither message nor timing enumerates accounts.
    const valid = user
      ? await this.passwords.verify(password, user.passwordHash)
      : (await this.passwords.verifyDummy(password), false);
    if (!user || !valid)
      throw AppException.unauthenticated('Invalid email or password');

    return {
      user: toUserSummary(user),
      accessToken: await this.signAccessFor(user),
      refreshToken: await this.refreshTokens.issueForLogin(user.id, meta),
    };
  }

  async refresh(
    presented: string | undefined,
    meta: ClientMeta,
  ): Promise<RefreshResult> {
    if (!presented) throw AppException.unauthenticated(SESSION_ENDED);

    const result = await this.refreshTokens.rotate(presented, meta);
    if (result.kind === 'invalid' || result.kind === 'reuse')
      throw AppException.unauthenticated(SESSION_ENDED);

    const user = await this.users.findOne({
      where: { id: result.userId, deletedAt: IsNull() },
    });
    if (!user) throw AppException.unauthenticated(SESSION_ENDED);

    return {
      accessToken: await this.signAccessFor(user),
      refreshToken: result.kind === 'rotated' ? result.token : undefined,
    };
  }

  async logout(presented: string | undefined): Promise<void> {
    if (presented) await this.refreshTokens.revokeFamilyOf(presented);
  }

  async me(userId: number): Promise<UserSummary> {
    const user = await this.users.findOne({
      where: { id: userId, deletedAt: IsNull() },
    });
    if (!user) throw AppException.unauthenticated();
    return toUserSummary(user);
  }

  private signAccessFor(user: User): Promise<string> {
    if (!isRoleCode(user.role.code)) throw AppException.unauthenticated();
    return this.tokens.signAccessToken({ id: user.id, role: user.role.code });
  }
}
