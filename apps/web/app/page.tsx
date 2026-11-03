'use client';

import { CalendarDays, Check, QrCode, UserRound } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { ErrorNote, Logo, Spinner, TierBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { RESTAURANT_NAME } from '@/lib/config';
import { useSession } from '@/lib/hooks';
import type { CustomerUser, TierRule } from '@/lib/types';

export default function Home() {
  const { session } = useSession<CustomerUser>('customer');
  const { data: tiers } = useSWR<{ pointValue: number; rules: TierRule[] }>('/loyalty/tiers', (p: string) => api(p), {
    shouldRetryOnError: false,
  });

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo name={RESTAURANT_NAME} className="text-2xl" />
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/account" className="btn-ghost">
            <UserRound className="h-4 w-4" />
            {session ? session.user.name.split(' ')[0] : 'Rewards'}
          </Link>
          <Link href="/staff/login" className="btn-outline">Staff</Link>
        </nav>
      </header>

      <section className="relative overflow-hidden bg-forest-900 text-stone-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div className="flex flex-col justify-center">
            <h1 className="text-5xl font-extrabold leading-[0.95] md:text-7xl">
              Wood fire,
              <br />
              good company.
            </h1>
            <p className="mt-6 max-w-md text-lg text-stone-300">
              Book a table, order from your seat when you&apos;re here, and earn points on every visit.
            </p>
            <div className="mt-8 flex items-center gap-3 text-sm text-stone-300">
              <QrCode className="h-5 w-5 text-brass" aria-hidden />
              Already seated? Scan the code on your table to see the menu and order.
            </div>
          </div>
          <BookingCard />
        </div>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brass/10 blur-3xl" />
      </section>

      {tiers && tiers.rules.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-16">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold">Rewards that grow with you</h2>
              <p className="mt-2 max-w-xl text-stone-600">
                Earn a point for every dollar. Every 100 points is worth {`$${(tiers.pointValue * 100).toFixed(0)}`} off. Visit more to reach Silver and Gold.
              </p>
            </div>
            <Link href="/account" className="btn-primary">{session ? 'See my rewards' : 'Join for free'}</Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {tiers.rules.map((r) => (
              <article
                key={r.tier}
                className={`rounded-2xl border p-6 ${r.tier === 'GOLD' ? 'border-tier-gold/60 bg-gradient-to-br from-amber-50 to-white' : 'border-stone-200 bg-white'}`}
              >
                <div className="flex items-center justify-between">
                  <TierBadge tier={r.tier} size="md" />
                  <span className="text-sm text-stone-500">
                    {r.minLifetimePoints === 0 ? 'On sign-up' : `${r.minLifetimePoints.toLocaleString()} points`}
                  </span>
                </div>
                <ul className="mt-5 space-y-2.5 text-sm">
                  {r.perks.map((p) => (
                    <li key={p} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-forest-600" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      )}

      <footer className="border-t border-stone-200 py-8 text-center text-sm text-stone-500">
        {RESTAURANT_NAME}
      </footer>
    </main>
  );
}

function BookingCard() {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ name: '', phone: '', partySize: 2, date: today, time: '19:00', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const time = new Date(`${form.date}T${form.time}`);
      await api('/reservations', {
        as: 'customer',
        body: { name: form.name, phone: form.phone || undefined, partySize: Number(form.partySize), time: time.toISOString(), notes: form.notes || undefined },
      });
      setDone(`${time.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })} at ${form.time}`);
    } catch (err) {
      setError(err.status === 404 ? 'Online booking is not available. Please call us.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl bg-white p-7 text-ink shadow-xl">
        <Check className="h-8 w-8 rounded-full bg-status-available p-1.5 text-white" aria-hidden />
        <h2 className="mt-4 text-2xl font-bold">You&apos;re booked</h2>
        <p className="mt-2 text-stone-600">
          Table for {form.partySize}, {done}. We&apos;ll hold it for 15 minutes.
        </p>
        <button className="btn-outline mt-6" onClick={() => setDone(null)}>Make another booking</button>
      </div>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 text-ink shadow-xl md:p-7">
      <h2 className="flex items-center gap-2 text-xl font-bold">
        <CalendarDays className="h-5 w-5 text-forest-600" aria-hidden />
        Book a table
      </h2>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label" htmlFor="b-size">Guests</label>
          <select id="b-size" className="input" value={form.partySize} onChange={set('partySize')}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="b-date">Date</label>
          <input id="b-date" type="date" min={today} className="input" required value={form.date} onChange={set('date')} />
        </div>
        <div>
          <label className="label" htmlFor="b-time">Time</label>
          <input id="b-time" type="time" step={900} className="input" required value={form.time} onChange={set('time')} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="b-name">Name</label>
          <input id="b-name" className="input" required minLength={2} autoComplete="name" value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className="label" htmlFor="b-phone">Mobile</label>
          <input id="b-phone" type="tel" className="input" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="b-notes">Anything we should know?</label>
        <input id="b-notes" className="input" placeholder="Birthday, high chair, allergies" value={form.notes} onChange={set('notes')} />
      </div>
      <ErrorNote error={error} />
      <button className="btn-primary w-full" disabled={busy}>
        {busy && <Spinner className="h-4 w-4" />}
        Book table
      </button>
    </form>
  );
}
