'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { putTaskInCache } from '@/lib/api/queries';
import { getAccessToken } from '@/lib/auth/token';
import { REALTIME_PATH, type Actor, type ServerMessage } from './protocol';

export type TaskEvent = Extract<ServerMessage, { type: 'task.changed' }> & { key: number };

let eventKey = 0;

/**
 * Live updates for one project: who else is here, and tasks changed by someone else.
 * Changed tasks go straight into the query cache; the caller gets the events too, to
 * show a toast and highlight the card.
 */
export function useProjectRealtime(projectId: string, onEvent?: (event: TaskEvent) => void) {
  const qc = useQueryClient();
  const [online, setOnline] = useState<Actor[]>([]);
  const [connected, setConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${REALTIME_PATH}`;
    const socket = new WebSocket(url);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'auth', token }));
      socket.send(JSON.stringify({ type: 'subscribe', projectId }));
      setConnected(true);
    });
    socket.addEventListener('close', () => setConnected(false));
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (message.type === 'presence' && message.projectId === projectId) setOnline(message.users);
      if (message.type === 'task.changed' && message.projectId === projectId) {
        putTaskInCache(qc, message.task);
        onEventRef.current?.({ ...message, key: ++eventKey });
      }
    });

    return () => {
      socket.close();
      setOnline([]);
    };
  }, [projectId, qc]);

  return { online, connected };
}
