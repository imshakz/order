'use client';

import clsx from 'clsx';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { OrderComposer, OrderDetail, StaffHeader } from '@/components/staff';
import { Empty, Sheet, Spinner, StatusPill, TierBadge } from '@/components/ui';
import { staffFetcher } from '@/lib/api';
import { ago, dateTime, money } from '@/lib/format';
import { useLive, useTick } from '@/lib/hooks';
import type { Order } from '@/lib/types';

const FILTERS = [
  { key: 'active', label: 'Open', query: 'active=1' },
  { key: 'today', label: 'Today', query: '' },
  { key: 'PAID', label: 'Paid', query: 'status=PAID' },
  { key: 'CANCELLED', label: 'Cancelled', query: 'status=CANCELLED' },
  { key: 'all', label: 'All', query: 'take=300' },
];

export default function OrdersPage() {
  useTick(30000);
  const [filter, setFilter] = useState('active');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [takeaway, setTakeaway] = useState(false);

  const query = useMemo(() => {
    if (filter === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return `from=${start.toISOString()}&take=300`;
    }
    return FILTERS.find((f) => f.key === filter)!.query;
  }, [filter]);

  const { data: orders, mutate } = useSWR<Order[]>(`/orders?${query}`, staffFetcher);
  useLive('staff', {
    'order.created': () => mutate(),
    'order.updated': (o: Order) => {
      mutate();
      setSelected((s) => (s?.id === o.id ? o : s));
    },
  });

  const shown = (orders ?? []).filter((o) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      String(o.number) === t.replace('#', '') ||
      o.table?.label.toLowerCase() === t ||
      o.customer?.name.toLowerCase().includes(t) ||
      o.guestName?.toLowerCase().includes(t)
    );
  });
  const total = shown.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + o.total, 0);

  return (
    <div>
      <StaffHeader title="Orders" sub={orders ? `${shown.length} orders · ${money(total)}` : undefined}>
        <button className="btn-brass" onClick={() => setTakeaway(true)}><Plus className="h-4 w-4" /> Takeaway order</button>
      </StaffHeader>

      <div className="flex flex-wrap items-center gap-3 px-5 pb-4 md:px-8">
        <div className="flex rounded-xl bg-forest-900 p-1" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={clsx('rounded-lg px-3 py-1.5 text-sm', filter === f.key ? 'bg-forest-700 font-semibold' : 'text-stone-400')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden />
          <input className="input pl-9" placeholder="Order #, table or guest" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search orders" />
        </div>
      </div>

      <div className="px-5 pb-10 md:px-8">
        {!orders ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : !shown.length ? (
          <Empty title="No orders match">Try another filter or search.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-forest-800">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-forest-900 text-left text-stone-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Table</th>
                  <th className="px-4 py-3 font-medium">Guest</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Placed</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-forest-800">
                {shown.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-forest-900/60" onClick={() => setSelected(o)}>
                    <td className="px-4 py-3 font-semibold">
                      <button className="font-semibold" onClick={() => setSelected(o)}>#{o.number}</button>
                    </td>
                    <td className="px-4 py-3">{o.table?.label ?? <span className="text-stone-500">Takeaway</span>}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        {o.customer?.name ?? o.guestName ?? <span className="text-stone-500">Guest</span>}
                        {o.customer && o.customer.tier !== 'MEMBER' && <TierBadge tier={o.customer.tier} />}
                      </span>
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-3 text-stone-400">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</td>
                    <td className="px-4 py-3"><StatusPill status={o.status} /></td>
                    <td className="px-4 py-3 text-stone-400" title={dateTime(o.createdAt)}>{ago(o.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(o.total + o.tip)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={!!selected} onClose={() => setSelected(null)} dark title={selected ? `Order #${selected.number}` : ''}>
        {selected && <OrderDetail order={selected} onChange={(o) => { setSelected(o); mutate(); }} />}
      </Sheet>

      <Sheet open={takeaway} onClose={() => setTakeaway(false)} dark wide title="Takeaway order">
        <div className="h-[calc(100vh-64px)]">
          <OrderComposer onDone={(o) => { setTakeaway(false); mutate(); setSelected(o); }} />
        </div>
      </Sheet>
    </div>
  );
}
