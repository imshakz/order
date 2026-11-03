'use client';

import clsx from 'clsx';
import { BellRing, Check, Flame } from 'lucide-react';
import useSWR from 'swr';
import { StaffHeader } from '@/components/staff';
import { Empty, Spinner, TierBadge } from '@/components/ui';
import { api, staffFetcher } from '@/lib/api';
import { minutesSince } from '@/lib/format';
import { useLive, useTick } from '@/lib/hooks';
import type { ItemStatus, Order, OrderStatus } from '@/lib/types';

const COLUMNS: { status: OrderStatus; title: string; hint: string }[] = [
  { status: 'PLACED', title: 'New', hint: 'Tap a dish to start it' },
  { status: 'PREPARING', title: 'On the pass', hint: 'Tap a dish when it’s plated' },
  { status: 'READY', title: 'Ready for service', hint: 'Waiting for a server' },
];

const NEXT_ITEM: Record<ItemStatus, ItemStatus> = { QUEUED: 'COOKING', COOKING: 'DONE', DONE: 'QUEUED' };

export default function Kitchen() {
  useTick(15000);
  const { data: tickets, mutate } = useSWR<Order[]>('/kitchen/tickets', staffFetcher, { refreshInterval: 60000 });
  useLive('staff', { 'order.created': () => mutate(), 'order.updated': () => mutate() });

  const cycle = async (itemId: string, status: ItemStatus) => {
    // Optimistic: flip the dish immediately, the live update confirms it.
    mutate(
      (list) => list?.map((o) => ({ ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, status: NEXT_ITEM[status] } : i)) })),
      { revalidate: false },
    );
    await api(`/kitchen/items/${itemId}`, { as: 'staff', method: 'PATCH', body: { status: NEXT_ITEM[status] } }).catch(() => mutate());
  };

  const bump = async (o: Order, status: OrderStatus) => {
    await api(`/orders/${o.id}/status`, { as: 'staff', method: 'PATCH', body: { status } }).catch(() => {});
    mutate();
  };

  const active = tickets?.filter((t) => t.status !== 'READY').length ?? 0;

  return (
    <div className="flex min-h-screen flex-col">
      <StaffHeader title="Kitchen" sub={tickets ? `${active} tickets cooking or waiting` : undefined} />
      {!tickets ? (
        <div className="flex justify-center py-24"><Spinner /></div>
      ) : (
        <div className="grid flex-1 gap-4 px-5 pb-8 md:px-8 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = tickets.filter((t) => t.status === col.status);
            return (
              <section key={col.status} className="flex min-h-[300px] flex-col rounded-2xl bg-forest-900/60 p-3" aria-label={col.title}>
                <header className="flex items-baseline justify-between px-2 pb-3 pt-1">
                  <h2 className="text-lg font-semibold">{col.title} <span className="text-stone-500">{list.length}</span></h2>
                  <span className="text-xs text-stone-500">{col.hint}</span>
                </header>
                <div className="space-y-3">
                  {list.length === 0 && <Empty title="All clear" />}
                  {list.map((o) => (
                    <Ticket key={o.id} order={o} onItem={cycle} onBump={bump} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Ticket({ order, onItem, onBump }: { order: Order; onItem: (id: string, s: ItemStatus) => void; onBump: (o: Order, s: OrderStatus) => void }) {
  const mins = minutesSince(order.createdAt);
  const late = mins >= 20 && order.status !== 'READY';
  const warn = mins >= 12 && !late && order.status !== 'READY';
  return (
    <article
      className={clsx(
        'animate-rise overflow-hidden rounded-xl border bg-forest-950',
        late ? 'border-ember' : warn ? 'border-brass' : 'border-forest-700',
      )}
    >
      <header className={clsx('flex items-center justify-between px-4 py-2.5', late ? 'bg-ember/20' : warn ? 'bg-brass/10' : 'bg-forest-800')}>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-xl font-bold">{order.table ? order.table.label : 'TA'}</span>
          <span className="text-sm text-stone-400">#{order.number}</span>
          {order.customer && order.customer.tier !== 'MEMBER' && <TierBadge tier={order.customer.tier} />}
        </div>
        <span className={clsx('font-display text-lg font-bold tabular-nums', late ? 'text-ember' : warn ? 'text-brass-light' : 'text-stone-300')}>
          {mins}m
        </span>
      </header>
      <ul className="divide-y divide-forest-800">
        {order.items.map((i) => (
          <li key={i.id}>
            <button
              onClick={() => onItem(i.id, i.status)}
              className={clsx('flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-forest-900', i.status === 'DONE' && 'opacity-50')}
            >
              <span
                className={clsx(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                  i.status === 'DONE' ? 'border-status-available bg-status-available text-forest-950' : i.status === 'COOKING' ? 'border-brass bg-brass/20 text-brass' : 'border-stone-600',
                )}
                aria-hidden
              >
                {i.status === 'DONE' ? <Check className="h-3.5 w-3.5" /> : i.status === 'COOKING' ? <Flame className="h-3.5 w-3.5" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={clsx('font-semibold', i.status === 'DONE' && 'line-through')}>
                  {i.quantity} × {i.name}
                </span>
                {i.notes && <span className="block text-sm font-semibold text-brass-light">{i.notes}</span>}
              </span>
              <span className="sr-only">{i.status.toLowerCase()}, tap to change</span>
            </button>
          </li>
        ))}
      </ul>
      {order.notes && <p className="border-t border-forest-800 bg-brass/10 px-4 py-2 text-sm text-brass-light">{order.notes}</p>}
      <footer className="flex gap-2 border-t border-forest-800 p-2">
        {order.status === 'PLACED' && (
          <button className="btn-outline flex-1 py-2" onClick={() => onBump(order, 'PREPARING')}><Flame className="h-4 w-4" /> Fire all</button>
        )}
        {order.status !== 'READY' && (
          <button className="btn-brass flex-1 py-2" onClick={() => onBump(order, 'READY')}><BellRing className="h-4 w-4" /> Ready</button>
        )}
        {order.status === 'READY' && (
          <button className="btn-outline flex-1 py-2" onClick={() => onBump(order, 'SERVED')}><Check className="h-4 w-4" /> Picked up</button>
        )}
      </footer>
    </article>
  );
}
