'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { refreshAccessToken } from '@/lib/api/client';
import { putTaskInCache, useMe } from '@/lib/api/queries';
import { getAccessToken } from '@/lib/auth/token';
import { REALTIME_PATH, type Actor, type ServerMessage } from './protocol';

export type TaskEvent = Extract<ServerMessage, { type: 'task.changed' }>;

/**
 * Where the WebSocket lives. With the mock API (and in local development) it is this
 * site. In production the web app is on Vercel, which does not forward WebSockets, so
 * NEXT_PUBLIC_REALTIME_URL points straight at the API (for example wss://api.example.com).
 * That is safe across origins: the socket is authenticated by the token in its first
 * message, not by a cookie.
 */
function realtimeUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_REALTIME_URL ??
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  return base.replace(/\/$/, '') + REALTIME_PATH;
}

/**
 * Live updates for one project: who else is here, and tasks changed by someone else.
 * Changed tasks go straight into the query cache; the caller gets the events too, to
 * show a toast and highlight the card. The server also sends your own changes (your
 * other tab needs them): those update the cache but are not passed to the caller.
 */
export function useProjectRealtime(projectId: string, onEvent?: (event: TaskEvent) => void) {
  const qc = useQueryClient();
  const myId = useMe().data?.user.id;
  const [people, setPeople] = useState<Actor[]>([]);
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  const myIdRef = useRef(myId);
  useEffect(() => {
    onEventRef.current = onEvent;
    myIdRef.current = myId;
  });

  useEffect(() => {
    let socket: WebSocket | undefined;
    let stopped = false;
    let retried = false;

    const open = (token: string) => {
      const ws = new WebSocket(realtimeUrl());
      socket = ws;
      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({ type: 'auth', token }));
        ws.send(JSON.stringify({ type: 'subscribe', projectId }));
        setConnected(true);
      });
      ws.addEventListener('close', () => setConnected(false));
      ws.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'presence' && message.projectId === projectId) {
          setPeople(message.users);
        }
        if (message.type === 'task.changed' && message.projectId === projectId) {
          putTaskInCache(qc, message.task);
          if (message.actor.id !== myIdRef.current) onEventRef.current?.(message);
        }
        // The access token lives 15 minutes; the one in memory may have just expired.
        // Get a fresh one and connect again, once.
        if (message.type === 'error' && message.code === 'unauthorized' && !retried) {
          retried = true;
          void refreshAccessToken().then((fresh) => {
            if (fresh && !stopped) open(fresh);
          });
        }
      });
    };

    const token = getAccessToken();
    if (token) open(token);

    return () => {
      stopped = true;
      socket?.close();
      setPeople([]);
    };
  }, [projectId, qc]);

  // "Also here": everyone on the board except you.
  const online = people.filter((u) => u.id !== myId);
  return { online, connected };
}
