/** A small WebSocket client for the realtime e2e tests: it collects what the server sends, in order. */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import WebSocket from 'ws';

export type Client = {
  send: (message: unknown) => void;
  /** The next message from the server, or 'closed' / 'nothing' (after `quietMs`). */
  next: (quietMs?: number) => Promise<unknown>;
  closed: Promise<void>;
  socket: WebSocket;
};

const open: Client[] = [];

/** Starts the app on a free port (a WebSocket needs a listening server) and returns its ws:// address. */
export async function listen(app: INestApplication): Promise<string> {
  await app.listen(0);
  const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
  return `ws://127.0.0.1:${port}`;
}

export async function connect(url: string, path = '/api/v1/realtime'): Promise<Client> {
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

/** Call in afterEach: drops every socket a test left open. */
export function closeAll() {
  for (const client of open.splice(0)) client.socket.terminate();
}
