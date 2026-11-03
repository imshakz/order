'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getSession, Session, SessionKind } from './api';
import { SOCKET_URL } from './config';

let shared: Socket | null = null;
function socket(): Socket {
  if (!shared) shared = io(SOCKET_URL || undefined, { path: '/socket.io', transports: ['websocket', 'polling'] });
  return shared;
}

/**
 * Subscribe to live events in a room. `handlers` maps event name to callback.
 * Re-joins the room after reconnects.
 */
export function useLive(room: string | null | undefined, handlers: Record<string, (payload: any) => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const events = Object.keys(handlers).join('|');

  useEffect(() => {
    if (!room) return;
    const s = socket();
    const join = () => s.emit('join', { room, token: room === 'staff' ? getSession('staff')?.token : undefined });
    join();
    s.on('connect', join);
    const bound = events.split('|').filter(Boolean).map((ev) => {
      const fn = (p: unknown) => ref.current[ev]?.(p);
      s.on(ev, fn);
      return [ev, fn] as const;
    });
    return () => {
      s.off('connect', join);
      bound.forEach(([ev, fn]) => s.off(ev, fn));
    };
  }, [room, events]);
}

/** Saved login for staff or customer, kept in sync across tabs and components. */
export function useSession<U>(kind: SessionKind) {
  const [session, setState] = useState<Session<U> | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const read = () => setState(getSession<U>(kind));
    read();
    setReady(true);
    window.addEventListener('eo:session', read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener('eo:session', read);
      window.removeEventListener('storage', read);
    };
  }, [kind]);
  return { session, ready };
}

/** Re-render every `ms` so "12m ago" timers stay current. */
export function useTick(ms = 30000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
