/**
 * Realtime protocol: JSON messages over one WebSocket at /api/v1/realtime.
 * The web app has the same types in apps/web/src/lib/realtime/protocol.ts; the spec is
 * docs/architecture/03-sequences.md ("Realtime messages").
 */
import type { Task, TaskStatus } from '@taskflow/api-contract/schema';

export const REALTIME_PATH = '/api/v1/realtime';

export type Actor = { id: string; name: string };

export type ClientMessage =
  { type: 'auth'; token: string } | { type: 'subscribe'; projectId: string };

export type ServerMessage =
  | { type: 'presence'; projectId: string; users: Actor[] }
  | {
      type: 'task.changed';
      projectId: string;
      change: 'created' | 'updated' | 'moved';
      /** The task as the REST API returns it: a client can put it straight into its cache. */
      task: Task;
      /** Who made the change. */
      actor: Actor;
      /** For a move: the column the task was in before. */
      from?: TaskStatus;
    }
  | { type: 'error'; code: 'unauthorized' | 'not_found' };
