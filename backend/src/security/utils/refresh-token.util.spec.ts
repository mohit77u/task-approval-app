import { generateRefreshToken, hashRefreshToken } from './refresh-token.util';

describe('refresh token util', () => {
  it('generates unique, high-entropy tokens whose hash matches hashRefreshToken', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a.token).not.toEqual(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43); // 32 bytes, base64url
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(a.token)).toBe(a.hash);
  });

  it('never stores the raw token in its hash', () => {
    const { token, hash } = generateRefreshToken();
    expect(hash).not.toContain(token);
  });
});
