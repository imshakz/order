'use client';

import clsx from 'clsx';
import { Banknote, CreditCard, Minus, Plus, Search, UserRound, X } from 'lucide-react';
import { ReactNode, useMemo, useState } from 'react';
import useSWR from 'swr';
import { api, staffFetcher } from '@/lib/api';
import { ago, money, ORDER_STATUS } from '@/lib/format';
import { useSession } from '@/lib/hooks';
import type { Menu, MenuItem, Order, OrderStatus, StaffUser, Tier } from '@/lib/types';
import { DishArt, ErrorNote, Spinner, StatusPill, TierBadge } from './ui';

export function StaffHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 px-5 pb-4 pt-6 md:px-8">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-stone-400">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function useStaff() {
  return useSession<StaffUser>('staff').session?.user;
}

// ---------------------------------------------------------------------------
// Take an order for a table (servers) — fast tap-to-add grid with search.
// ---------------------------------------------------------------------------

interface Customer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  tier: Tier;
  points: number;
}

export function OrderComposer({ tableId, existingOrder, onDone }: { tableId?: string; existingOrder?: Order; onDone: (o: Order) => void }) {
  const { data: menu } = useSWR<Menu>('/menu', staffFetcher);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [lines, setLines] = useState<Record<string, { item: MenuItem; quantity: number; notes: string }>>({});
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lookup, setLookup] = useState('');
  const [guestName, setGuestName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: matches } = useSWR<Customer[]>(
    lookup.length >= 2 && !customer ? `/customers?search=${encodeURIComponent(lookup)}` : null,
    staffFetcher,
  );

  const items = useMemo(() => {
    if (!menu) return [];
    const all = menu.categories.flatMap((c) => c.items.map((i) => ({ ...i, cat: c.id })));
    return all.filter((i) => (cat === 'all' || i.cat === cat) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  }, [menu, q, cat]);

  const step = (item: MenuItem, d: number) =>
    setLines((l) => {
      const cur = l[item.id] ?? { item, quantity: 0, notes: '' };
      const next = { ...l };
      if (cur.quantity + d <= 0) delete next[item.id];
      else next[item.id] = { ...cur, quantity: cur.quantity + d };
      return next;
    });

  const chosen = Object.values(lines);
  const subtotal = chosen.reduce((s, l) => s + l.item.price * l.quantity, 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const payload = chosen.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity, notes: l.notes || undefined }));
    try {
      const order = existingOrder
        ? await api<Order>(`/orders/${existingOrder.id}/items`, { as: 'staff', body: { items: payload } })
        : await api<Order>('/orders', {
            as: 'staff',
            body: {
              items: payload,
              tableId,
              type: tableId ? 'DINE_IN' : 'TAKEAWAY',
              customerId: customer?.id,
              guestName: !customer && guestName ? guestName : undefined,
            },
          });
      onDone(order);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!menu) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b border-forest-700 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden />
          <input className="input pl-9" placeholder="Search dishes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search dishes" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {[{ id: 'all', name: 'All' }, ...menu.categories].map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={clsx('shrink-0 rounded-full px-3 py-1 text-xs font-medium', cat === c.id ? 'bg-brass text-forest-950' : 'bg-forest-800 text-stone-300')}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-4 sm:grid-cols-3">
        {items.map((i) => {
          const n = lines[i.id]?.quantity ?? 0;
          return (
            <button
              key={i.id}
              onClick={() => step(i, 1)}
              className={clsx(
                'relative rounded-xl border p-3 text-left transition-colors',
                n ? 'border-brass bg-forest-800' : 'border-forest-700 bg-forest-900 hover:border-forest-500',
              )}
            >
              <p className="text-sm font-semibold leading-tight">{i.name}</p>
              <p className="mt-1 text-xs text-stone-400">{money(i.price)}</p>
              {n > 0 && (
                <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-brass px-1.5 text-xs font-bold text-forest-950">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-3 border-t border-forest-700 bg-forest-900 p-4">
        {chosen.length > 0 && (
          <ul className="max-h-40 space-y-2 overflow-y-auto">
            {chosen.map((l) => (
              <li key={l.item.id} className="flex items-center gap-2 text-sm">
                <div className="flex items-center rounded-lg bg-forest-800">
                  <button className="p-1.5" onClick={() => step(l.item, -1)} aria-label={`Remove one ${l.item.name}`}><Minus className="h-3.5 w-3.5" /></button>
                  <span className="w-5 text-center font-semibold">{l.quantity}</span>
                  <button className="p-1.5" onClick={() => step(l.item, 1)} aria-label={`Add one ${l.item.name}`}><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <span className="min-w-0 flex-1 truncate">{l.item.name}</span>
                <input
                  className="w-32 rounded-lg border border-forest-700 bg-forest-950 px-2 py-1 text-xs"
                  placeholder="Note"
                  value={l.notes}
                  onChange={(e) => setLines((x) => ({ ...x, [l.item.id]: { ...l, notes: e.target.value } }))}
                  aria-label={`Note for ${l.item.name}`}
                />
              </li>
            ))}
          </ul>
        )}

        {!existingOrder && (
          <div className="relative">
            {customer ? (
              <div className="flex items-center justify-between rounded-xl bg-forest-800 px-3 py-2 text-sm">
                <span className="flex items-center gap-2"><UserRound className="h-4 w-4" />{customer.name} <TierBadge tier={customer.tier} /></span>
                <button onClick={() => setCustomer(null)} aria-label="Remove customer"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input className="input py-2" placeholder="Find member (name, phone)" value={lookup} onChange={(e) => setLookup(e.target.value)} aria-label="Find member" />
                <input className="input py-2" placeholder="Or guest name" value={guestName} onChange={(e) => setGuestName(e.target.value)} aria-label="Guest name" />
              </div>
            )}
            {!customer && matches && matches.length > 0 && (
              <ul className="absolute bottom-full z-10 mb-1 w-full overflow-hidden rounded-xl border border-forest-600 bg-forest-900 shadow-xl">
                {matches.slice(0, 5).map((m) => (
                  <li key={m.id}>
                    <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-forest-800" onClick={() => { setCustomer(m); setLookup(''); }}>
                      <span>{m.name} <span className="text-stone-500">{m.phone || m.email}</span></span>
                      <TierBadge tier={m.tier} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ErrorNote error={error} />
        <button className="btn-brass w-full py-3" disabled={!chosen.length || busy} onClick={submit}>
          {busy && <Spinner className="h-4 w-4" />}
          {existingOrder ? `Add to #${existingOrder.number}` : 'Send to kitchen'} · {money(subtotal)}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order detail with staff actions (status, payment).
// ---------------------------------------------------------------------------

const NEXT_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  PLACED: { to: 'PREPARING', label: 'Start cooking' },
  PREPARING: { to: 'READY', label: 'Mark ready' },
  READY: { to: 'SERVED', label: 'Mark served' },
};

export function OrderDetail({ order, onChange, onAddItems }: { order: Order; onChange: (o: Order) => void; onAddItems?: () => void }) {
  const me = useStaff();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState('');
  const open = order.status !== 'PAID' && order.status !== 'CANCELLED';
  const next = NEXT_ACTION[order.status];

  const run = async (key: string, fn: () => Promise<Order>) => {
    setBusy(key);
    setError(null);
    try {
      onChange(await fn());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const setStatus = (status: OrderStatus) => run(status, () => api(`/orders/${order.id}/status`, { as: 'staff', method: 'PATCH', body: { status } }));
  const pay = (method: 'CASH' | 'CARD_TERMINAL') =>
    run(method, () => api('/payments/manual', { as: 'staff', body: { orderId: order.id, method, tip: Number(tip) || 0 } }));

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-stone-400">
        <StatusPill status={order.status} />
        <span>{order.table ? `Table ${order.table.label}` : 'Takeaway'}</span>
        <span>· {ago(order.createdAt)}</span>
        <span>· {order.source === 'CUSTOMER' ? 'Ordered by guest' : `Taken by ${order.staff?.name ?? 'staff'}`}</span>
      </div>

      {(order.customer || order.guestName) && (
        <div className="flex items-center justify-between rounded-xl bg-forest-900 px-4 py-3">
          <span className="flex items-center gap-2 text-sm"><UserRound className="h-4 w-4 text-stone-400" />{order.customer?.name ?? order.guestName}</span>
          {order.customer && <TierBadge tier={order.customer.tier} />}
        </div>
      )}

      <ul className="space-y-2">
        {order.items.map((i) => (
          <li key={i.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="flex items-start gap-2">
              <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', i.status === 'DONE' ? 'bg-status-available' : i.status === 'COOKING' ? 'bg-brass' : 'bg-stone-600')} aria-label={i.status.toLowerCase()} />
              <span>
                <b>{i.quantity}×</b> {i.name}
                {i.notes && <span className="block text-xs text-brass-light">{i.notes}</span>}
              </span>
            </span>
            <span className="text-stone-300">{money(i.unitPrice * i.quantity)}</span>
          </li>
        ))}
      </ul>
      {order.notes && <p className="rounded-xl bg-brass/10 p-3 text-sm text-brass-light">{order.notes}</p>}

      <dl className="space-y-1 border-t border-forest-700 pt-3 text-sm">
        <div className="flex justify-between text-stone-400"><dt>Subtotal</dt><dd>{money(order.subtotal)}</dd></div>
        {order.discount > 0 && <div className="flex justify-between text-status-available"><dt>Member savings</dt><dd>−{money(order.discount)}</dd></div>}
        {order.tip > 0 && <div className="flex justify-between text-stone-400"><dt>Tip</dt><dd>{money(order.tip)}</dd></div>}
        <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{money(order.total + order.tip)}</dd></div>
      </dl>

      <ErrorNote error={error} />

      {open && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {next && (
              <button className="btn-outline flex-1" disabled={!!busy} onClick={() => setStatus(next.to)}>
                {busy === next.to && <Spinner className="h-4 w-4" />}
                {next.label}
              </button>
            )}
            {onAddItems && <button className="btn-outline flex-1" onClick={onAddItems}><Plus className="h-4 w-4" /> Add items</button>}
          </div>

          <div className="rounded-xl border border-forest-700 p-3">
            <p className="mb-2 text-sm font-semibold">Take payment · {money(order.total)}</p>
            <div className="flex gap-2">
              <input className="input w-28 py-2" inputMode="decimal" placeholder="Tip $" value={tip} onChange={(e) => setTip(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Tip amount" />
              <button className="btn-brass flex-1" disabled={!!busy} onClick={() => pay('CARD_TERMINAL')}>
                {busy === 'CARD_TERMINAL' ? <Spinner className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />} Card
              </button>
              <button className="btn-outline flex-1" disabled={!!busy} onClick={() => pay('CASH')}>
                {busy === 'CASH' ? <Spinner className="h-4 w-4" /> : <Banknote className="h-4 w-4" />} Cash
              </button>
            </div>
          </div>

          {(order.status === 'PLACED' || order.status === 'PREPARING') && (
            <button className="btn-ghost w-full text-sm text-ember" disabled={!!busy} onClick={() => confirm(`Cancel order #${order.number}?`) && setStatus('CANCELLED')}>
              Cancel order
            </button>
          )}
        </div>
      )}

      {order.payments.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-stone-300">Payments</p>
          {order.payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl bg-forest-900 px-3 py-2 text-sm">
              <span>{p.method.replace('_', ' ').toLowerCase()} · {p.status.toLowerCase()}</span>
              <span className="flex items-center gap-3">
                {money(p.amount)}
                {me?.role === 'MANAGER' && p.status === 'SUCCEEDED' && (
                  <button
                    className="text-xs text-ember underline"
                    onClick={async () => {
                      if (!confirm('Refund this payment?')) return;
                      try {
                        await api(`/payments/${p.id}/refund`, { as: 'staff', body: {} });
                        onChange(await api(`/orders/${order.id}`, { as: 'staff' }));
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    Refund
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrderStatusDot({ status }: { status: OrderStatus }) {
  return <span className={clsx('inline-block h-2 w-2 rounded-full', ORDER_STATUS[status].cls.split(' ')[0])} />;
}

export { DishArt };
