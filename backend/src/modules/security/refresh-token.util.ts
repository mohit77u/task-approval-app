import { createHash, randomBytes } from 'node:crypto';

/**
 * Refresh tokens are opaque random values, not JWTs: nothing in them needs to be readable by the client, and a random
 * value can be revoked and rotated purely server-side. SHA-256 (not bcrypt) is correct here because the input already
 * has 256 bits of entropy, so there is nothing to brute force and lookups stay fast.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}
