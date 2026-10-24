/**
 * Realtime protocol (draft): JSON messages over one WebSocket at /api/v1/realtime.
 *
 * Browsers can't set an Authorization header on a WebSocket, so the client sends its
 * access token as the first message. It then subscribes to the project it is looking
 * at; the server only accepts projects the user can see (same rule as the REST API).
 *
 * Stage 3 turns this into a proper spec (AsyncAPI) next to the OpenAPI contract.
 */
import type { Task, TaskStatus } from '@taskflow/api-contract';

export type Actor = { id: string; name: string };

export type ClientMessage =
  { type: 'auth'; token: string } | { type: 'subscribe'; projectId: string };

export type ServerMessage =
  | { type: 'presence'; projectId: string; users: Actor[] }
  | {
      type: 'task.changed';
      projectId: string;
      change: 'moved' | 'created';
      task: Task;
      actor: Actor;
      /** Status before a move. */
      from?: TaskStatus;
    }
  | { type: 'error'; code: 'unauthorized' | 'not_found' };

export const REALTIME_PATH = '/api/v1/realtime';
