/**
 * Realtime, part 1: the WebSocket at /api/v1/realtime and its first message.
 * A browser can't put an Authorization header on a WebSocket, so the client sends
 * { type: 'auth', token } first. Protocol: docs/architecture/03-sequences.md.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/auth/tokens';
import { PrismaService } from '../src/prisma/prisma.service';
import { closeAll, connect as connectTo, listen } from './realtime-client';

let app: INestApplication;
let prisma: PrismaService;
let url: string;
let ly: { id: string; token: string };
const connect = (path?: string) => connectTo(url, path);

beforeAll(async () => {
  app = await createApp();
  url = await listen(app);
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE users, workspaces CASCADE');
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ name: 'Ly', email: 'ly@taskflow.dev', password: 'password123' })
    .expect(201);
  ly = { id: res.body.user.id as string, token: res.body.accessToken as string };
});

afterEach(closeAll);

describe('connecting', () => {
  it('accepts a WebSocket at /api/v1/realtime', async () => {
    const client = await connect();
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('refuses a WebSocket on any other path', async () => {
    await expect(connect('/api/v1/elsewhere')).rejects.toThrow();
  });
});

describe('the auth message', () => {
  it('a valid access token: no error, the socket stays open', async () => {
    const client = await connect();
    client.send({ type: 'auth', token: ly.token });
    expect(await client.next()).toBe('nothing');
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('a wrong token: error unauthorized, then the server closes the socket', async () => {
    const client = await connect();
    client.send({ type: 'auth', token: 'not-a-token' });
    expect(await client.next()).toEqual({ type: 'error', code: 'unauthorized' });
    await client.closed;
  });

  it('an expired token: error unauthorized, then the server closes the socket', async () => {
    const client = await connect();
    client.send({ type: 'auth', token: await signAccessToken(ly.id, -60) });
    expect(await client.next()).toEqual({ type: 'error', code: 'unauthorized' });
    await client.closed;
  });

  it('an auth message without a token is treated as a wrong token', async () => {
    const client = await connect();
    client.send({ type: 'auth' });
    expect(await client.next()).toEqual({ type: 'error', code: 'unauthorized' });
    await client.closed;
  });
});

describe('before auth', () => {
  it('subscribe is answered with error unauthorized', async () => {
    const client = await connect();
    client.send({ type: 'subscribe', projectId: '00000000-0000-4000-8000-000000000000' });
    expect(await client.next()).toEqual({ type: 'error', code: 'unauthorized' });
  });
});

describe('messages the server does not understand', () => {
  it('text that is not JSON is ignored: no reply, no crash, the socket still works', async () => {
    const client = await connect();
    client.send('hello, not json');
    expect(await client.next()).toBe('nothing');
    client.send({ type: 'auth', token: 'not-a-token' });
    expect(await client.next()).toEqual({ type: 'error', code: 'unauthorized' });
  });

  it('an unknown message type is ignored', async () => {
    const client = await connect();
    client.send({ type: 'dance' });
    expect(await client.next()).toBe('nothing');
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });
});
