'use client';

import clsx from 'clsx';
import { ArrowLeft, Check, LogOut } from 'lucide-react';
import Link from 'next/link';
import useSWR from 'swr';
import { AuthForm } from '@/components/AuthForm';
import { Empty, Logo, Spinner, StatusPill, TierBadge } from '@/components/ui';
import { customerFetcher, setSession } from '@/lib/api';
import { RESTAURANT_NAME } from '@/lib/config';
import { dateTime, money, TIER_LABEL } from '@/lib/format';
import { useSession } from '@/lib/hooks';
import type { CustomerUser, Order, Tier, TierRule } from '@/lib/types';

interface LoyaltyStatus {
  tier: Tier;
  points: number;
  pointsValue: number;
  lifetimePoints: number;
  visits: number;
  currentRule?: TierRule;
  nextTier: { tier: Tier; pointsNeeded: number; minLifetimePoints: number } | null;
  ledger: { id: string; delta: number; reason: string; createdAt: string }[];
}

const CARD: Record<Tier, string> = {
  MEMBER: 'from-forest-800 to-forest-600 text-stone-50',
  SILVER: 'from-slate-300 via-slate-100 to-slate-300 text-slate-800',
  GOLD: 'from-amber-300 via-amber-100 to-tier-gold text-amber-950',
};

export default function Account() {
  const { session, ready } = useSession<CustomerUser>('customer');
  const { data: status } = useSWR<LoyaltyStatus>(session ? '/loyalty/me' : null, customerFetcher);
  const { data: orders } = useSWR<Order[]>(session ? '/orders/mine' : null, customerFetcher);

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <Link href="/" className="btn-ghost -ml-3"><ArrowLeft className="h-4 w-4" /> <Logo name={RESTAURANT_NAME} className="text-lg" /></Link>
        {session && (
          <button className="btn-ghost text-stone-600" onClick={() => setSession('customer', null)}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        )}
      </header>

      {!ready ? null : !session ? (
        <section className="mx-auto max-w-sm pt-6">
          <h1 className="text-3xl font-bold">Your rewards</h1>
          <p className="mb-6 mt-2 text-stone-600">Earn points every visit and move up to Silver and Gold.</p>
          <AuthForm />
        </section>
      ) : !status ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          <section
            className={clsx('relative overflow-hidden rounded-2xl bg-gradient-to-br p-6 shadow-lg', CARD[status.tier])}
            aria-label="Membership card"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm opacity-75">{session.user.name}</p>
                <p className="font-display text-3xl font-extrabold">{TIER_LABEL[status.tier]}</p>
              </div>
              <Logo name={RESTAURANT_NAME} className="text-base opacity-80" />
            </div>
            <div className="mt-10 flex items-end justify-between">
              <div>
                <p className="font-display text-5xl font-extrabold leading-none">{status.points.toLocaleString()}</p>
                <p className="mt-1 text-sm opacity-75">points, worth {money(status.pointsValue)}</p>
              </div>
              <p className="text-right text-sm opacity-75">{status.visits} visits</p>
            </div>
            {status.nextTier && (
              <div className="mt-6">
                <div className="h-2 overflow-hidden rounded-full bg-black/15">
                  <div
                    className="h-full rounded-full bg-current opacity-80"
                    style={{ width: `${Math.min(100, (status.lifetimePoints / status.nextTier.minLifetimePoints) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-sm opacity-80">
                  {status.nextTier.pointsNeeded.toLocaleString()} points to {TIER_LABEL[status.nextTier.tier]}
                </p>
              </div>
            )}
          </section>

          {status.currentRule && (
            <section className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
              <h2 className="text-lg font-bold">Your perks</h2>
              <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                {status.currentRule.perks.map((p) => (
                  <li key={p} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-forest-600" aria-hidden />{p}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <h2 className="mb-3 text-lg font-bold">Recent orders</h2>
            {!orders?.length ? (
              <Empty title="No orders yet">Scan the code on your table next visit to order and earn points.</Empty>
            ) : (
              <ul className="divide-y divide-stone-200 rounded-2xl bg-white ring-1 ring-stone-200">
                {orders.map((o) => (
                  <li key={o.id}>
                    <Link href={`/order/${o.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-stone-50">
                      <div className="min-w-0">
                        <p className="font-semibold">#{o.number} · {o.items.length} items</p>
                        <p className="truncate text-sm text-stone-500">{dateTime(o.createdAt)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <StatusPill status={o.status} />
                        <span className="font-semibold">{money(o.total)}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {status.ledger.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-bold">Points history</h2>
              <ul className="space-y-2 text-sm">
                {status.ledger.map((l) => (
                  <li key={l.id} className="flex justify-between">
                    <span className="text-stone-600">{l.reason} · {dateTime(l.createdAt)}</span>
                    <span className={clsx('font-semibold', l.delta > 0 ? 'text-forest-600' : 'text-stone-500')}>
                      {l.delta > 0 ? '+' : ''}{l.delta}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="mt-10 flex items-center justify-center gap-2 text-xs text-stone-500">
            Tier: <TierBadge tier={status.tier} />
          </p>
        </>
      )}
    </main>
  );
}
