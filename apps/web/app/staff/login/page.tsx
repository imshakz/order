'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ErrorNote, Logo, Spinner } from '@/components/ui';
import { api, setSession } from '@/lib/api';
import { RESTAURANT_NAME } from '@/lib/config';
import type { StaffUser } from '@/lib/types';
import { homeFor } from '../nav';

export default function StaffLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ token: string; user: StaffUser }>('/auth/staff/login', { body: { email, password } });
      setSession('staff', res);
      router.replace(homeFor(res.user.role));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <main className="staff flex min-h-screen items-center justify-center bg-forest-950 p-5 text-stone-100">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div>
          <Logo name={RESTAURANT_NAME} className="text-3xl" />
          <p className="mt-1 text-stone-400">Staff sign in</p>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <ErrorNote error={error} />
        <button className="btn-brass w-full py-3" disabled={busy}>
          {busy && <Spinner className="h-4 w-4" />}
          Sign in
        </button>
        <details className="rounded-xl border border-forest-700 p-3 text-sm text-stone-400">
          <summary className="cursor-pointer text-stone-300">Demo logins</summary>
          <ul className="mt-2 space-y-1">
            {['manager', 'host', 'server', 'kitchen'].map((r) => (
              <li key={r}>
                <button
                  type="button"
                  className="underline decoration-forest-600 underline-offset-2 hover:text-brass-light"
                  onClick={() => {
                    setEmail(`${r}@demo.com`);
                    setPassword('password123');
                  }}
                >
                  {r}@demo.com
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2">Password: password123</p>
        </details>
      </form>
    </main>
  );
}
