'use client';

import { API_BASE } from './config';

export type SessionKind = 'staff' | 'customer';
const KEYS: Record<SessionKind, string> = { staff: 'eo.staff', customer: 'eo.customer' };

export interface Session<U> {
  token: string;
  user: U;
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getSession<U = unknown>(kind: SessionKind): Session<U> | null {
  try {
    const raw = storage()?.getItem(KEYS[kind]);
    return raw ? (JSON.parse(raw) as Session<U>) : null;
  } catch {
    return null;
  }
}

export function setSession<U>(kind: SessionKind, session: Session<U> | null) {
  try {
    if (session) storage()?.setItem(KEYS[kind], JSON.stringify(session));
    else storage()?.removeItem(KEYS[kind]);
    window.dispatchEvent(new Event('eo:session'));
  } catch {
    /* storage unavailable: session lasts for this page only */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Calls the API. `as` picks which saved login to send: staff screens use the staff token,
 * customer pages the customer token.
 */
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; as?: SessionKind } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const session = opts.as ? getSession(opts.as) : null;
  if (session) headers.Authorization = `Bearer ${session.token}`;

  const res = await fetch(`${API_BASE}/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && opts.as) setSession(opts.as, null);
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new ApiError(msg || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

/** SWR fetchers bound to a session. */
export const staffFetcher = (path: string) => api(path, { as: 'staff' });
export const customerFetcher = (path: string) => api(path, { as: 'customer' });
