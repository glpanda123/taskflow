/**
 * Realtime, part 1: the WebSocket at /api/v1/realtime and its first message.
 * A browser can't put an Authorization header on a WebSocket, so the client sends
 * { type: 'auth', token } first. Protocol: docs/architecture/03-sequences.md.
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/auth/tokens';
import { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication;
let prisma: PrismaService;
let url: string;
let ly: { id: string; token: string };
const open: Client[] = [];

/** A test client: collects what the server sends, in order. */
type Client = {
  send: (message: unknown) => void;
  /** The next message from the server, or 'closed' / 'nothing' (after `quietMs`). */
  next: (quietMs?: number) => Promise<unknown>;
  closed: Promise<void>;
  socket: WebSocket;
};

async function connect(path = '/api/v1/realtime'): Promise<Client> {
  const socket = new WebSocket(url + path);
  const inbox: unknown[] = [];
  let wake: (() => void) | undefined;
  let isClosed = false;
  socket.on('message', (data) => {
    inbox.push(JSON.parse(Buffer.from(data as Buffer).toString('utf8')));
    wake?.();
  });
  const closed = new Promise<void>((resolve) =>
    socket.on('close', () => {
      isClosed = true;
      wake?.();
      resolve();
    }),
  );
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const client: Client = {
    socket,
    closed,
    send: (message) => socket.send(typeof message === 'string' ? message : JSON.stringify(message)),
    next: async (quietMs = 300) => {
      if (inbox.length === 0 && !isClosed) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, quietMs);
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      }
      if (inbox.length > 0) return inbox.shift();
      return isClosed ? 'closed' : 'nothing';
    },
  };
  open.push(client);
  return client;
}

beforeAll(async () => {
  app = await createApp();
  await app.listen(0); // a real port: WebSocket needs a listening server
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  url = `ws://127.0.0.1:${port}`;
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

afterEach(() => {
  for (const client of open.splice(0)) client.socket.terminate();
});

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
