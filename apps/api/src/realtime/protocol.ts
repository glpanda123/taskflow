/**
 * Realtime protocol: JSON messages over one WebSocket at /api/v1/realtime.
 * The web app has the same types in apps/web/src/lib/realtime/protocol.ts; the spec is
 * docs/architecture/03-sequences.md ("Realtime messages").
 */
export const REALTIME_PATH = '/api/v1/realtime';

export type ClientMessage =
  { type: 'auth'; token: string } | { type: 'subscribe'; projectId: string };

export type ServerMessage = { type: 'error'; code: 'unauthorized' | 'not_found' };
