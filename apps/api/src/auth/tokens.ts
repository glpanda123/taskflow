/**
 * The two kinds of token.
 *
 * Access token: a signed JWT, valid 15 minutes, kept in the browser's memory and sent
 * as `Authorization: Bearer …`. Any API instance can check it alone (no database
 * lookup), which is what keeps the API stateless behind a load balancer.
 *
 * Refresh token: a long random string, valid 30 days, stored in an httpOnly cookie.
 * The database keeps only its SHA-256 hash, so a leaked database can't be used to
 * log in as anyone.
 */
import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return new TextEncoder().encode(value);
}

/** `ttlSeconds` is only overridden by tests (a negative value makes an expired token). */
export async function signAccessToken(userId: string, ttlSeconds = ACCESS_TOKEN_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(secret());
}

/** Returns the user id, or null if the token is malformed, tampered with or expired. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
