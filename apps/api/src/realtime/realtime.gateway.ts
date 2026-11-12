import { Logger } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import type { RawData, WebSocket } from 'ws';
import { verifyAccessToken } from '../auth/tokens';
import { REALTIME_PATH, type ServerMessage } from './protocol';

/** What the server remembers about one open socket. */
type Connection = {
  socket: WebSocket;
  /** null until a valid `auth` message arrives. */
  userId: string | null;
  /** Messages of one socket are handled one at a time, in the order they arrived. */
  queue: Promise<void>;
};

/**
 * The WebSocket side of the API. A browser can't set an Authorization header on a
 * WebSocket, so the first message must be { type: 'auth', token }. Until then the
 * socket may do nothing else.
 */
@WebSocketGateway({ path: REALTIME_PATH })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(socket: WebSocket) {
    const connection: Connection = { socket, userId: null, queue: Promise.resolve() };
    socket.on('message', (data) => {
      // The browser sends `auth` and `subscribe` back to back. Checking a token is
      // asynchronous, so without this queue `subscribe` could run before `auth` finished.
      connection.queue = connection.queue
        .then(() => this.onMessage(connection, data))
        .catch((error: unknown) => this.logger.error(error));
    });
  }

  private async onMessage(connection: Connection, data: RawData) {
    const message = parse(data);
    // Unknown or malformed messages are ignored, so an older client and a newer server
    // (or the reverse) can still talk.
    if (!message) return;

    if (message.type === 'auth') {
      const token = typeof message.token === 'string' ? message.token : '';
      connection.userId = await verifyAccessToken(token);
      if (!connection.userId) {
        // One attempt per socket: a client with a bad token must reconnect.
        this.send(connection, { type: 'error', code: 'unauthorized' });
        connection.socket.close();
      }
      return;
    }

    if (message.type === 'subscribe') {
      if (!connection.userId) this.send(connection, { type: 'error', code: 'unauthorized' });
    }
  }

  private send(connection: Connection, message: ServerMessage) {
    connection.socket.send(JSON.stringify(message));
  }
}

/** The message as an object with a string `type`, or null if it isn't one. */
function parse(data: RawData): { type: string; [key: string]: unknown } | null {
  try {
    const value: unknown = JSON.parse(text(data));
    if (typeof value !== 'object' || value === null) return null;
    const type = (value as { type?: unknown }).type;
    return typeof type === 'string' ? { ...value, type } : null;
  } catch {
    return null;
  }
}

/** `ws` hands a message over as one Buffer, a list of Buffers, or an ArrayBuffer. */
function text(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.from(data as ArrayBuffer).toString('utf8');
}
