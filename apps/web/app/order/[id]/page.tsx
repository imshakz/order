'use client';

import clsx from 'clsx';
import { Check, ChefHat, CreditCard, Crown, PartyPopper, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { StripePay } from '@/components/StripePay';
import { ErrorNote, Logo, Spinner, StatusPill, TierBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { RESTAURANT_NAME, STRIPE_KEY } from '@/lib/config';
import { money, TIER_LABEL } from '@/lib/format';
import { useLive } from '@/lib/hooks';
import type { Order, OrderStatus, Tier } from '@/lib/types';

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'PLACED', label: 'Sent' },
  { key: 'PREPARING', label: 'Cooking' },
  { key: 'READY', label: 'Ready' },
  { key: 'SERVED', label: 'Served' },
  { key: 'PAID', label: 'Paid' },
];

export default function OrderPageWrapper() {
  return (
    <Suspense fallback={null}>
      <OrderPage />
    </Suspense>
  );
}

function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const { data: order, mutate, error } = useSWR<Order>(`/orders/${id}`, (p: string) => api(p));
  const [tierUp, setTierUp] = useState<Tier | null>(null);

  useLive(`order:${id}`, {
    'order.updated': (o: Order) => mutate(o, { revalidate: false }),
    'customer.tierUp': (e: { to: Tier }) => setTierUp(e.to),
  });

  // Returning from a Stripe redirect (e.g. 3-D Secure): ask the API to check the payment.
  useEffect(() => {
    const pid = search.get('payment');
    if (search.get('redirect_status') === 'succeeded' && pid) {
      api('/payments/confirm', { body: { paymentId: pid } }).then(() => mutate());
    }
  }, [search, mutate]);

  if (error) return <p className="p-10 text-center">We couldn&apos;t find this order.</p>;
  if (!order) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;

  const stepIndex = order.status === 'CANCELLED' ? -1 : STEPS.findIndex((s) => s.key === order.status);

  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <Logo name={RESTAURANT_NAME} className="text-lg" />
        {order.table && (
          <Link href={`/t/${order.table.code}`} className="btn-outline py-2">
            <Plus className="h-4 w-4" /> Order more
          </Link>
        )}
      </header>

      <section className="rounded-2xl bg-forest-900 p-6 text-stone-50">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-stone-400">{order.table ? `Table ${order.table.label}` : 'Takeaway'}</p>
            <h1 className="text-3xl font-bold">Order #{order.number}</h1>
          </div>
          <ChefHat className="h-8 w-8 text-brass" aria-hidden />
        </div>
        {order.status === 'CANCELLED' ? (
          <p className="mt-6 rounded-xl bg-white/10 p-3 text-sm">This order was cancelled. Please speak to your server if this is unexpected.</p>
        ) : (
          <ol className="mt-8 grid grid-cols-5 gap-1" aria-label="Order progress">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex flex-col gap-2">
                <span className={clsx('h-1.5 rounded-full transition-colors duration-500', i <= stepIndex ? 'bg-brass' : 'bg-white/15')} />
                <span className={clsx('text-xs', i === stepIndex ? 'font-semibold text-stone-50' : 'text-stone-400')} aria-current={i === stepIndex ? 'step' : undefined}>
                  {s.label}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {tierUp && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-100 to-amber-50 p-4 ring-1 ring-amber-300 animate-rise">
          <PartyPopper className="h-6 w-6 text-amber-700" aria-hidden />
          <p className="text-sm">
            You&apos;ve reached <strong>{TIER_LABEL[tierUp]}</strong>. Your new perks apply from your next order.
          </p>
        </div>
      )}

      <section className="mt-6">
        <ul className="divide-y divide-stone-200">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-3 text-sm">
              <span>
                <span className="font-semibold">{i.quantity}×</span> {i.name}
                {i.notes && <span className="block text-xs text-stone-500">{i.notes}</span>}
              </span>
              <span>{money(i.unitPrice * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-stone-300 pt-3 text-sm">
          <Line label="Subtotal" value={money(order.subtotal)} />
          {order.discount > 0 && <Line label="Member savings" value={`−${money(order.discount)}`} className="text-forest-600" />}
          <Line label="Includes GST" value={money(order.tax)} className="text-stone-500" />
          {order.tip > 0 && <Line label="Tip" value={money(order.tip)} />}
          <Line label="Total" value={money(order.total + order.tip)} className="pt-1 text-base font-bold" />
        </dl>
      </section>

      {order.status === 'PAID' ? (
        <section className="mt-8 rounded-2xl bg-white p-6 text-center ring-1 ring-stone-200">
          <Check className="mx-auto h-10 w-10 rounded-full bg-status-available p-2 text-white" aria-hidden />
          <h2 className="mt-3 text-xl font-bold">Paid. Thanks for dining with us.</h2>
          {order.customer ? (
            <p className="mt-1 flex items-center justify-center gap-2 text-sm text-stone-600">
              Points added to your <TierBadge tier={order.customer.tier} /> account.
            </p>
          ) : (
            <p className="mt-1 text-sm text-stone-600">
              <Link href="/account" className="font-semibold text-forest-700 underline">Join rewards</Link> to earn points next time.
            </p>
          )}
        </section>
      ) : (
        order.status !== 'CANCELLED' && <PayPanel order={order} onPaid={() => mutate()} />
      )}
    </main>
  );
}

function Line({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={clsx('flex justify-between', className)}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PayPanel({ order, onPaid }: { order: Order; onPaid: () => void }) {
  const [tipPct, setTipPct] = useState(0);
  const [intent, setIntent] = useState<{ paymentId: string; provider: string; clientSecret?: string; amount: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tip = Math.round(order.total * tipPct) / 100;

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setIntent(await api('/payments/intent', { as: 'customer', body: { orderId: order.id, tip } }));
    } catch (e) {
      setError(e.status === 404 ? 'Online payment is off. Please pay with your server.' : e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = useCallback(async () => {
    if (!intent) return;
    setBusy(true);
    try {
      await api('/payments/confirm', { body: { paymentId: intent.paymentId } });
      onPaid();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [intent, onPaid]);

  return (
    <section className="mt-8 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <CreditCard className="h-5 w-5 text-forest-600" aria-hidden /> Pay from your phone
      </h2>
      {!intent ? (
        <>
          <p className="mt-1 text-sm text-stone-600">Add a tip for the team if you&apos;d like.</p>
          <div className="mt-4 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Tip">
            {[0, 10, 15, 20].map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={tipPct === p}
                onClick={() => setTipPct(p)}
                className={clsx('rounded-xl py-2.5 text-sm font-semibold ring-1', tipPct === p ? 'bg-forest-800 text-white ring-forest-800' : 'ring-stone-300')}
              >
                {p === 0 ? 'No tip' : `${p}%`}
              </button>
            ))}
          </div>
          <ErrorNote error={error} />
          <button className="btn-primary mt-4 w-full py-3.5 text-base" onClick={start} disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />}
            Continue to pay {money(order.total + tip)}
          </button>
        </>
      ) : intent.provider === 'stripe' && intent.clientSecret && STRIPE_KEY ? (
        <div className="mt-4">
          <StripePay
            clientSecret={intent.clientSecret}
            amount={intent.amount}
            returnUrl={`${window.location.origin}/order/${order.id}?payment=${intent.paymentId}`}
            onPaid={confirm}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl bg-stone-100 p-3 text-sm text-stone-600">
            Demo mode: no card is charged. Add Stripe keys to take real payments.
          </p>
          <ErrorNote error={error} />
          <button className="btn-primary w-full py-3.5 text-base" onClick={confirm} disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />}
            Pay {money(intent.amount)}
          </button>
        </div>
      )}
      {order.customer && order.customer.tier !== 'GOLD' && (
        <p className="mt-4 flex items-center gap-1.5 text-xs text-stone-500">
          <Crown className="h-3.5 w-3.5" aria-hidden /> Paying earns points toward your next tier.
        </p>
      )}
    </section>
  );
}
