import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { RefreshToken } from '../src/modules/auth/entities/refresh-token.entity';
import { hashRefreshToken } from '../src/modules/security/utils/refresh-token.util';
import { ADMIN, loginAgent, PRIYA, userIdOf } from './helpers/auth';
import { cookieValue, setCookies } from './helpers/cookies';
import { createTestApp, TestContext } from './helpers/test-app';

describe('auth', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer());

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());

  describe('login', () => {
    it('sets httpOnly access and refresh cookies and returns the user without any token in the body', async () => {
      const res = await http().post('/api/auth/login').send(ADMIN).expect(200);

      expect(res.body.user).toMatchObject({
        email: ADMIN.email,
        role: { code: 'ADMIN' },
      });
      expect(JSON.stringify(res.body)).not.toMatch(/token|hash|password/i);

      const cookies = setCookies(res);
      const access = cookies.find((c) => c.startsWith('access_token='))!;
      const refresh = cookies.find((c) => c.startsWith('refresh_token='))!;
      for (const cookie of [access, refresh]) {
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Max-Age=31536000');
      }
      expect(access).toContain('Path=/api;');
      expect(refresh).toContain('Path=/api/auth');
    });

    it('stores only a hash of the refresh token', async () => {
      const res = await http().post('/api/auth/login').send(ADMIN).expect(200);
      const raw = cookieValue(res, 'refresh_token')!;
      const row = await ctx.dataSource
        .getRepository(RefreshToken)
        .findOneByOrFail({ tokenHash: hashRefreshToken(raw) });
      expect(row.tokenHash).not.toBe(raw);
      expect(row.revokedAt).toBeNull();
    });

    it('answers a wrong password and an unknown email identically', async () => {
      const wrongPassword = await http()
        .post('/api/auth/login')
        .send({ email: ADMIN.email, password: 'Wrong@12345' })
        .expect(401);
      const unknownEmail = await http()
        .post('/api/auth/login')
        .send({ email: 'ghost@taskapp.dev', password: 'Wrong@12345' })
        .expect(401);

      expect(unknownEmail.body.code).toBe(wrongPassword.body.code);
      expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
      expect(wrongPassword.body.message).not.toMatch(
        /exist|found|password is/i,
      );
    });

    it('treats the email case-insensitively', async () => {
      await http()
        .post('/api/auth/login')
        .send({ email: '  ADMIN@TaskApp.dev ', password: ADMIN.password })
        .expect(200);
    });

    it('validates the payload with the standard 422 shape', async () => {
      const res = await http()
        .post('/api/auth/login')
        .send({ email: 'not-an-email' })
        .expect(422);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(
        res.body.details.map((d: { field: string }) => d.field).sort(),
      ).toEqual(['email', 'password']);
    });
  });

  describe('session', () => {
    it('rejects /me without a session', async () => {
      const res = await http().get('/api/auth/me').expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('returns the current user for a valid session', async () => {
      const agent = await loginAgent(ctx.app, PRIYA);
      const res = await agent.get('/api/auth/me').expect(200);
      expect(res.body).toMatchObject({
        email: PRIYA.email,
        role: { code: 'EMPLOYEE' },
      });
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('reports an expired access token as TOKEN_EXPIRED', async () => {
      const jwt = ctx.app.get(JwtService, { strict: false });
      const id = await userIdOf(ctx.dataSource, ADMIN.email);
      const expired = await jwt.signAsync(
        { sub: id, role: 'ADMIN' },
        { secret: process.env.JWT_ACCESS_SECRET, expiresIn: -10 },
      );

      const res = await http()
        .get('/api/auth/me')
        .set('Cookie', [`access_token=${expired}`])
        .expect(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('refresh rotation', () => {
    async function loginRaw(): Promise<string> {
      const res = await http().post('/api/auth/login').send(PRIYA).expect(200);
      return cookieValue(res, 'refresh_token')!;
    }
    const refreshWith = (token: string) =>
      http()
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${token}`]);

    it('issues a new access and refresh token and rotates the stored row', async () => {
      const first = await loginRaw();
      const res = await refreshWith(first).expect(200);

      const second = cookieValue(res, 'refresh_token')!;
      expect(second).toBeDefined();
      expect(second).not.toBe(first);
      expect(cookieValue(res, 'access_token')).toBeDefined();

      const repo = ctx.dataSource.getRepository(RefreshToken);
      const oldRow = await repo.findOneByOrFail({
        tokenHash: hashRefreshToken(first),
      });
      const newRow = await repo.findOneByOrFail({
        tokenHash: hashRefreshToken(second),
      });
      expect(oldRow.revokedAt).not.toBeNull();
      expect(oldRow.replacedById).toBe(newRow.id);
      expect(newRow.familyId).toBe(oldRow.familyId);
    });

    it('accepts a just-rotated token inside the grace window without rotating again (two tabs refreshing together)', async () => {
      const first = await loginRaw();
      await refreshWith(first).expect(200);

      const replay = await refreshWith(first).expect(200);
      expect(cookieValue(replay, 'access_token')).toBeDefined();
      expect(cookieValue(replay, 'refresh_token')).toBeUndefined();
    });

    it('revokes the whole family when a rotated token is replayed after the grace window', async () => {
      const first = await loginRaw();
      const rotated = await refreshWith(first).expect(200);
      const second = cookieValue(rotated, 'refresh_token')!;

      await ctx.dataSource.query(
        'UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ?',
        [new Date(Date.now() - 60_000), hashRefreshToken(first)],
      );

      const replay = await refreshWith(first).expect(401);
      expect(replay.body.code).toBe('UNAUTHENTICATED');
      // The refresh cookie is cleared so the client does not keep retrying.
      expect(
        setCookies(replay).some((c) => c.startsWith('refresh_token=;')),
      ).toBe(true);

      // The legitimate descendant is revoked too: the user must sign in again.
      await refreshWith(second).expect(401);
    });

    it('does not honour a rotated token inside the grace window once the session was logged out', async () => {
      const first = await loginRaw();
      const rotated = await refreshWith(first).expect(200);
      const second = cookieValue(rotated, 'refresh_token')!;

      await http()
        .post('/api/auth/logout')
        .set('Cookie', [`refresh_token=${second}`])
        .expect(204);

      // Replaying the older token a moment later must not mint a fresh access token for a logged-out session.
      await refreshWith(first).expect(401);
    });

    it('rejects a missing, unknown or expired refresh token', async () => {
      await http().post('/api/auth/refresh').expect(401);
      await refreshWith('definitely-not-a-real-token').expect(401);

      const token = await loginRaw();
      await ctx.dataSource.query(
        'UPDATE refresh_tokens SET expires_at = ? WHERE token_hash = ?',
        [new Date(Date.now() - 1000), hashRefreshToken(token)],
      );
      await refreshWith(token).expect(401);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token, clears both cookies and ends the refresh ability', async () => {
      const res = await http().post('/api/auth/login').send(PRIYA).expect(200);
      const refreshToken = cookieValue(res, 'refresh_token')!;
      const accessToken = cookieValue(res, 'access_token')!;

      const out = await http()
        .post('/api/auth/logout')
        .set('Cookie', [
          `refresh_token=${refreshToken}`,
          `access_token=${accessToken}`,
        ])
        .expect(204);
      const cleared = setCookies(out);
      expect(cleared.some((c) => c.startsWith('access_token=;'))).toBe(true);
      expect(cleared.some((c) => c.startsWith('refresh_token=;'))).toBe(true);

      await http()
        .post('/api/auth/refresh')
        .set('Cookie', [`refresh_token=${refreshToken}`])
        .expect(401);
    });

    it('works even when the access token has already expired', async () => {
      await http().post('/api/auth/logout').expect(204);
    });
  });
});
