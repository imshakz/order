'use client';

import { FormEvent, useState } from 'react';
import { api, setSession } from '@/lib/api';
import type { CustomerUser } from '@/lib/types';
import { ErrorNote, Spinner } from './ui';

/** Customer sign in / join rewards. */
export function AuthForm({ onDone, intro }: { onDone?: (u: CustomerUser) => void; intro?: string }) {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = mode === 'login' ? { email: form.email, password: form.password } : { ...form, phone: form.phone || undefined };
      const res = await api<{ token: string; user: CustomerUser }>(`/auth/customer/${mode}`, { body });
      setSession('customer', res);
      onDone?.(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      {intro && <p className="text-sm text-stone-600">{intro}</p>}
      <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1 text-sm font-semibold" role="tablist">
        {(['register', 'login'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 transition-colors ${mode === m ? 'bg-white shadow-sm' : 'text-stone-500'}`}
          >
            {m === 'register' ? 'Join rewards' : 'Sign in'}
          </button>
        ))}
      </div>
      {mode === 'register' && (
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="input" required minLength={2} autoComplete="name" {...field('name')} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" className="input" required autoComplete="email" {...field('email')} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          className="input"
          required
          minLength={6}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          {...field('password')}
        />
      </div>
      {mode === 'register' && (
        <div>
          <label className="label" htmlFor="phone">Mobile (optional)</label>
          <input id="phone" type="tel" className="input" autoComplete="tel" {...field('phone')} />
        </div>
      )}
      <ErrorNote error={error} />
      <button className="btn-primary w-full" disabled={busy}>
        {busy && <Spinner className="h-4 w-4" />}
        {mode === 'register' ? 'Create account' : 'Sign in'}
      </button>
    </form>
  );
}
