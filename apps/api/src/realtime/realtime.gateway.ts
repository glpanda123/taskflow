import { Logger } from '@nestjs/common';
import { type OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import { type RawData, WebSocket } from 'ws';
import { AccessService } from '../access/access.service';
import { verifyAccessToken } from '../auth/tokens';
import { ProblemException } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import { type Actor, REALTIME_PATH, type ServerMessage } from './protocol';
import { RealtimeHub, type Subscriber } from './realtime.hub';

/** What the server remembers about one open socket. */
type Connection = {
  socket: WebSocket;
  /** null until a valid `auth` message arrives. */
  user: Actor | null;
  /** The project this socket watches (one at a time), and its entry in the hub. */
  watching: { projectId: string; subscriber: Subscriber } | null;
  /** Messages of one socket are handled one at a time, in the order they arrived. */
  queue: Promise<void>;
};

type Message = { type: string; [key: string]: unknown };

/**
 * The WebSocket side of the API. A browser can't set an Authorization header on a
 * WebSocket, so the first message must be { type: 'auth', token }. After that the
 * socket may subscribe to one project at a time, under the same rule as reading it
 * over REST.
 */
@WebSocketGateway({ path: REALTIME_PATH })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly hub: RealtimeHub,
  ) {}

  handleConnection(socket: WebSocket) {
    const connection: Connection = {
      socket,
      user: null,
      watching: null,
      queue: Promise.resolve(),
    };
    socket.on('message', (data) => {
      // The browser sends `auth` and `subscribe` back to back. Checking a token is
      // asynchronous, so without this queue `subscribe` could run before `auth` finished.
      connection.queue = connection.queue
        .then(() => this.onMessage(connection, data))
        .catch((error: unknown) => this.logger.error(error));
    });
    socket.on('close', () => this.stopWatching(connection));
  }

  private async onMessage(connection: Connection, data: RawData) {
    const message = parse(data);
    // Unknown or malformed messages are ignored, so an older client and a newer server
    // (or the reverse) can still talk.
    if (!message) return;
    if (message.type === 'auth') return this.onAuth(connection, message);
    if (message.type === 'subscribe') return this.onSubscribe(connection, message);
  }

  private async onAuth(connection: Connection, message: Message) {
    const token = typeof message.token === 'string' ? message.token : '';
    const userId = await verifyAccessToken(token);
    connection.user = userId
      ? await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true },
        })
      : null;
    if (!connection.user) {
      // One attempt per socket: a client with a bad token must reconnect.
      send(connection.socket, { type: 'error', code: 'unauthorized' });
      connection.socket.close();
    }
  }

  private async onSubscribe(connection: Connection, message: Message) {
    const { user, socket } = connection;
    if (!user) return send(socket, { type: 'error', code: 'unauthorized' });

    const projectId = typeof message.projectId === 'string' ? message.projectId : '';
    try {
      // The same check as GET on the project. Whoever may not read it must not learn
      // that it exists, so every refusal looks the same.
      await this.access.requireProject(user.id, projectId, 'project:read');
    } catch (error) {
      // A refusal (403 or 404 over REST). Anything else is a real failure: let it be logged.
      if (!(error instanceof ProblemException)) throw error;
      return send(socket, { type: 'error', code: 'not_found' });
    }
    // The socket may have closed while the database was answering.
    if (socket.readyState !== WebSocket.OPEN) return;

    this.stopWatching(connection);
    const subscriber: Subscriber = { user, send: (m) => send(socket, m) };
    connection.watching = { projectId, subscriber };
    this.hub.join(projectId, subscriber);
    this.announcePresence(projectId);
  }

  /** Leaves the current project, if any, and tells the people still there. */
  private stopWatching(connection: Connection) {
    if (!connection.watching) return;
    const { projectId, subscriber } = connection.watching;
    connection.watching = null;
    this.hub.leave(projectId, subscriber);
    this.announcePresence(projectId);
  }

  private announcePresence(projectId: string) {
    this.hub.publish(projectId, { type: 'presence', projectId, users: this.hub.people(projectId) });
  }
}

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

/** The message as an object with a string `type`, or null if it isn't one. */
function parse(data: RawData): Message | null {
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
