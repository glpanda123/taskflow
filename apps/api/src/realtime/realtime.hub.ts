import { Injectable } from '@nestjs/common';
import type { Actor, ServerMessage } from './protocol';

/** One socket that is watching a project. */
export type Subscriber = { user: Actor; send: (message: ServerMessage) => void };

/**
 * Who is watching which project, kept in this process's memory.
 *
 * That is enough for one API instance. With two, a write handled by instance A never
 * reaches a socket held by instance B; Redis pub/sub closes that gap (Realtime, part 2).
 */
@Injectable()
export class RealtimeHub {
  private readonly rooms = new Map<string, Set<Subscriber>>();

  join(projectId: string, subscriber: Subscriber) {
    let room = this.rooms.get(projectId);
    if (!room) this.rooms.set(projectId, (room = new Set()));
    room.add(subscriber);
  }

  leave(projectId: string, subscriber: Subscriber) {
    const room = this.rooms.get(projectId);
    if (!room) return;
    room.delete(subscriber);
    // An empty room is removed, or the map would grow with every project ever opened.
    if (room.size === 0) this.rooms.delete(projectId);
  }

  /** The people on a board, in the order they arrived; two tabs of one person count once. */
  people(projectId: string): Actor[] {
    const seen = new Map<string, Actor>();
    for (const { user } of this.rooms.get(projectId) ?? []) {
      if (!seen.has(user.id)) seen.set(user.id, user);
    }
    return [...seen.values()];
  }

  /** Sends a message to every socket watching the project. */
  publish(projectId: string, message: ServerMessage) {
    for (const subscriber of this.rooms.get(projectId) ?? []) subscriber.send(message);
  }
}
