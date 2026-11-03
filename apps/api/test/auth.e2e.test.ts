/**
 * Auth, end to end: real HTTP requests against the Nest app and a real Postgres.
 * Each `it` reads as a rule from the contract (openapi.yaml) or the design (03-sequences.md).
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { hashRefreshToken, signAccessToken } from '../src/auth/tokens';

let app: INestApplication;
let prisma: PrismaService;
const api = () => request(app.getHttpServer());

const ly = { name: 'Ly Nguyen', email: 'ly@taskflow.dev', password: 'password123' };

/** The refresh_token cookie from a response, as "refresh_token=…" (what a browser sends back). */
function refreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('no refresh_token cookie');
  return cookie.split(';')[0]!;
}

beforeAll(async () => {
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE users, workspaces CASCADE');
});

describe('POST /auth/register', () => {
  it('creates the account, returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await api().post('/api/v1/auth/register').send(ly).expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.expiresIn).toBe(900);
    expect(res.body.user).toMatchObject({ name: 'Ly Nguyen', email: 'ly@taskflow.dev' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('stores an argon2id hash, never the password', async () => {
    await api().post('/api/v1/auth/register').send(ly).expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ly.email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(ly.password);
  });

  it('rejects an email that is already registered, whatever its case (409)', async () => {
    await api().post('/api/v1/auth/register').send(ly).expect(201);
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ ...ly, email: 'LY@TaskFlow.dev' })
      .expect(409);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
  });

  it('validates against the contract: password under 8 characters is a 422 with the field', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ ...ly, password: 'short' })
      .expect(422);
    expect(res.body.errors).toContainEqual(expect.objectContaining({ field: 'password' }));
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await api().post('/api/v1/auth/register').send(ly).expect(201);
  });

  it('logs in with the right password', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'LY@taskflow.dev', password: ly.password })
      .expect(200);
    expect(res.body.user.email).toBe(ly.email);
    expect(refreshCookie(res)).toMatch(/^refresh_token=/);
  });

  it('gives the same 401 for a wrong password and an unknown email (no account enumeration)', async () => {
    const wrong = await api()
      .post('/api/v1/auth/login')
      .send({ email: ly.email, password: 'wrong-password' })
      .expect(401);
    const unknown = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@taskflow.dev', password: 'whatever1' })
      .expect(401);
    expect(wrong.body.detail).toBe(unknown.body.detail);
  });
});

describe('GET /me', () => {
  it('needs an access token', async () => {
    await api().get('/api/v1/me').expect(401);
    await api().get('/api/v1/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('rejects an expired access token', async () => {
    const reg = await api().post('/api/v1/auth/register').send(ly).expect(201);
    const expired = await signAccessToken(reg.body.user.id, -60);
    await api().get('/api/v1/me').set('Authorization', `Bearer ${expired}`).expect(401);
  });

  it('returns the user and their workspaces with roles', async () => {
    const reg = await api().post('/api/v1/auth/register').send(ly).expect(201);
    const token = reg.body.accessToken as string;

    const empty = await api().get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(empty.body).toMatchObject({ user: { email: ly.email }, workspaces: [] });

    await prisma.workspace.create({
      data: {
        name: 'Acme Studio',
        memberships: { create: { userId: reg.body.user.id, role: 'owner' } },
      },
    });
    const me = await api().get('/api/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.workspaces).toEqual([
      expect.objectContaining({ name: 'Acme Studio', role: 'owner', id: expect.any(String) }),
    ]);
  });
});

describe('POST /auth/refresh — rotation and theft detection', () => {
  it('swaps the refresh token for a new one and returns a new access token', async () => {
    const reg = await api().post('/api/v1/auth/register').send(ly).expect(201);
    const first = refreshCookie(reg);

    const res = await api().post('/api/v1/auth/refresh').set('Cookie', first).expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(refreshCookie(res)).not.toBe(first);
  });

  it('treats reuse of an old token as theft: revokes the whole family', async () => {
    const reg = await api().post('/api/v1/auth/register').send(ly).expect(201);
    const first = refreshCookie(reg);
    const rotated = await api().post('/api/v1/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(rotated);

    // Someone replays the first token (e.g. stolen) → 401…
    await api().post('/api/v1/auth/refresh').set('Cookie', first).expect(401);
    // …and the legitimate newer token is dead too: everyone has to log in again.
    await api().post('/api/v1/auth/refresh').set('Cookie', second).expect(401);
  });

  it('claims a token at most once, even when two requests both saw it unused', async () => {
    // The race, made deterministic: both requests have already read the row as
    // "unused"; now both try to mark it. Exactly one may succeed.
    const reg = await api().post('/api/v1/auth/register').send(ly).expect(201);
    const raw = refreshCookie(reg).split('=')[1]!;
    const row = await prisma.refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashRefreshToken(raw) },
    });
    const auth = app.get(AuthService);
    const results = await Promise.all([
      auth.claim(row.id, new Date()),
      auth.claim(row.id, new Date()),
    ]);
    expect(results.sort()).toEqual([false, true]);
  });

  it('lets only one of two simultaneous refreshes with the same token win', async () => {
    const reg = await api().post('/api/v1/auth/register').send(ly).expect(201);
    const first = refreshCookie(reg);

    const results = await Promise.all([
      api().post('/api/v1/auth/refresh').set('Cookie', first),
      api().post('/api/v1/auth/refresh').set('Cookie', first),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('rejects a missing or unknown token', async () => {
    await api().post('/api/v1/auth/refresh').expect(401);
    await api().post('/api/v1/auth/refresh').set('Cookie', 'refresh_token=made-up').expect(401);
  });
});

describe('POST /auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const reg = await api().post('/api/v1/auth/register').send(ly).expect(201);
    const cookie = refreshCookie(reg);

    const res = await api().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
    expect(([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';')).toMatch(
      /refresh_token=;/,
    );
    await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
  });
});
