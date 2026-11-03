'use client';

import clsx from 'clsx';
import { CalendarClock, ExternalLink, Minus, Plus, Sparkles, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { OrderComposer, OrderDetail, StaffHeader } from '@/components/staff';
import { ErrorNote, Sheet, Spinner, StatusPill, TierBadge } from '@/components/ui';
import { api, staffFetcher } from '@/lib/api';
import { clock, minutesSince, money, TABLE_STATUS } from '@/lib/format';
import { useLive, useTick } from '@/lib/hooks';
import type { FloorTable, Order, Reservation, Settings, TableStatus } from '@/lib/types';

const RING: Record<TableStatus, string> = {
  AVAILABLE: 'ring-status-available/70',
  SEATED: 'ring-status-seated',
  ORDERED: 'ring-status-ordered',
  NEEDS_ATTENTION: 'ring-status-attention',
  RESERVED: 'ring-status-reserved',
  CLEANING: 'ring-stone-600',
};

export default function Floor() {
  useTick(30000);
  const { data: tables, mutate } = useSWR<FloorTable[]>('/tables', staffFetcher);
  const { data: settings } = useSWR<Settings>('/settings', (p: string) => api(p));
  const reservationsOn = settings?.features.includes('reservations');
  const { data: reservations, mutate: reloadRes } = useSWR<Reservation[]>(reservationsOn ? '/reservations' : null, staffFetcher);
  const [section, setSection] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useLive('staff', {
    'table.updated': () => mutate(),
    'order.created': () => mutate(),
    'order.updated': () => mutate(),
    'floor.changed': () => mutate(),
    'reservation.updated': () => reloadRes(),
  });

  const sections = useMemo(() => ['All', ...new Set((tables ?? []).map((t) => t.section))], [tables]);
  const shown = (tables ?? []).filter((t) => section === 'All' || t.section === section);
  const selected = tables?.find((t) => t.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const c: Partial<Record<TableStatus, number>> = {};
    (tables ?? []).forEach((t) => (c[t.status] = (c[t.status] ?? 0) + 1));
    return c;
  }, [tables]);
  const covers = (tables ?? []).reduce((s, t) => s + (t.guests ?? 0), 0);
  const attention = counts.NEEDS_ATTENTION ?? 0;

  return (
    <div className="flex min-h-screen flex-col xl:flex-row">
      <div className="min-w-0 flex-1">
        <StaffHeader
          title="Floor"
          sub={
            tables ? (
              <>
                {covers} guests seated · {tables.length - (counts.AVAILABLE ?? 0)} of {tables.length} tables in use
                {attention > 0 && <span className="ml-2 font-semibold text-ember">· {attention} with food ready</span>}
              </>
            ) : undefined
          }
        >
          <div className="flex rounded-xl bg-forest-900 p-1" role="tablist" aria-label="Sections">
            {sections.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={section === s}
                onClick={() => setSection(s)}
                className={clsx('rounded-lg px-3 py-1.5 text-sm', section === s ? 'bg-forest-700 font-semibold text-stone-50' : 'text-stone-400')}
              >
                {s}
              </button>
            ))}
          </div>
        </StaffHeader>

        <div className="flex flex-wrap gap-x-5 gap-y-2 px-5 pb-4 text-xs text-stone-400 md:px-8">
          {(Object.keys(TABLE_STATUS) as TableStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={clsx('h-2.5 w-2.5 rounded-full', TABLE_STATUS[s].color)} />
              {TABLE_STATUS[s].label} <span className="text-stone-500">{counts[s] ?? 0}</span>
            </span>
          ))}
        </div>

        {!tables ? (
          <div className="flex justify-center py-24"><Spinner /></div>
        ) : (
          <FloorPlan tables={shown} onSelect={setSelectedId} selectedId={selectedId} />
        )}
      </div>

      {reservationsOn && (
        <aside className="border-t border-forest-800 p-5 xl:sticky xl:top-0 xl:h-screen xl:w-80 xl:overflow-y-auto xl:border-l xl:border-t-0">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <CalendarClock className="h-5 w-5 text-status-reserved" aria-hidden /> Today&apos;s bookings
          </h2>
          <ReservationList reservations={reservations} tables={tables ?? []} onChange={() => { reloadRes(); mutate(); }} />
        </aside>
      )}

      <Sheet open={!!selected} onClose={() => setSelectedId(null)} dark wide title={selected ? <TableTitle t={selected} /> : ''}>
        {selected && <TablePanel table={selected} onChanged={() => mutate()} />}
      </Sheet>
    </div>
  );
}

function TableTitle({ t }: { t: FloorTable }) {
  return (
    <span className="flex items-center gap-3">
      Table {t.label}
      <span className={clsx('rounded-full px-2.5 py-0.5 text-xs font-semibold text-forest-950', TABLE_STATUS[t.status].color)}>
        {TABLE_STATUS[t.status].label}
      </span>
    </span>
  );
}

/** The dining room drawn to scale-ish: each table sits at its grid position, ring colour = status. */
function FloorPlan({ tables, onSelect, selectedId }: { tables: FloorTable[]; onSelect: (id: string) => void; selectedId: string | null }) {
  const cols = Math.max(1, ...tables.map((t) => t.posX + 1));
  const rows = Math.max(1, ...tables.map((t) => t.posY + 1));
  return (
    <div className="overflow-x-auto px-5 pb-10 md:px-8">
      <div
        className="grid min-w-max gap-4 rounded-2xl border border-forest-800 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_0)] bg-[length:24px_24px] p-6"
        style={{ gridTemplateColumns: `repeat(${cols}, 168px)`, gridTemplateRows: `repeat(${rows}, 148px)` }}
      >
        {tables.map((t) => (
          <div key={t.id} style={{ gridColumn: t.posX + 1, gridRow: t.posY + 1 }} className="flex items-center justify-center">
            <TableShape t={t} selected={selectedId === t.id} onClick={() => onSelect(t.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TableShape({ t, selected, onClick }: { t: FloorTable; selected: boolean; onClick: () => void }) {
  const mins = minutesSince(t.seatedAt);
  const open = t.orders;
  const total = open.reduce((s, o) => s + o.total, 0);
  const vip = open.find((o) => o.customer && o.customer.tier !== 'MEMBER')?.customer;
  const size =
    t.shape === 'ROUND' ? 'h-24 w-24 rounded-full' : t.shape === 'RECT' ? 'h-24 w-40 rounded-2xl' : t.shape === 'BOOTH' ? 'h-24 w-32 rounded-t-[28px] rounded-b-xl' : 'h-24 w-24 rounded-2xl';
  const seatsOccupied = t.guests ?? 0;

  return (
    <button
      onClick={onClick}
      className={clsx(
        'group relative flex flex-col items-center justify-center bg-forest-800 ring-[3px] transition-transform hover:scale-[1.03] focus-visible:scale-[1.03]',
        size,
        RING[t.status],
        t.status === 'NEEDS_ATTENTION' && 'animate-pulseRing',
        t.status === 'AVAILABLE' && 'bg-forest-900',
        selected && 'outline outline-2 outline-offset-4 outline-brass',
      )}
      aria-label={`Table ${t.label}, ${TABLE_STATUS[t.status].label}, ${t.seats} seats`}
    >
      {t.shape === 'BOOTH' && <span className="absolute -top-2 left-3 right-3 h-2 rounded-t-full bg-forest-600" aria-hidden />}
      <span className="font-display text-xl font-bold leading-none">{t.label}</span>
      <span className="mt-1 flex items-center gap-1 text-[11px] text-stone-400">
        <Users className="h-3 w-3" aria-hidden />
        {seatsOccupied ? `${seatsOccupied}/${t.seats}` : t.seats}
      </span>
      {t.seatedAt && t.status !== 'AVAILABLE' && t.status !== 'CLEANING' && (
        <span className={clsx('mt-0.5 text-[11px] font-semibold', mins > 90 ? 'text-ember' : 'text-stone-300')}>{mins}m</span>
      )}
      {total > 0 && (
        <span className="absolute -bottom-3 rounded-full bg-forest-950 px-2 py-0.5 text-[11px] font-semibold text-stone-200 ring-1 ring-forest-600">
          {money(total)}
        </span>
      )}
      {t.status === 'RESERVED' && t.reservations[0] && (
        <span className="absolute -bottom-3 rounded-full bg-status-reserved px-2 py-0.5 text-[11px] font-semibold text-white">
          {clock(t.reservations[0].time)}
        </span>
      )}
      {vip && (
        <span className="absolute -right-2 -top-2" title={`${vip.name} is ${vip.tier.toLowerCase()}`}>
          <TierBadge tier={vip.tier} />
        </span>
      )}
    </button>
  );
}

function TablePanel({ table, onChanged }: { table: FloorTable; onChanged: () => void }) {
  const { data: orders, mutate } = useSWR<Order[]>(`/orders?active=1&tableId=${table.id}`, staffFetcher);
  const [composing, setComposing] = useState<Order | 'new' | null>(null);
  const [guests, setGuests] = useState(Math.min(2, table.seats));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useLive('staff', { 'order.updated': () => mutate(), 'order.created': () => mutate() });

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      mutate();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (composing) {
    return (
      <div className="flex h-[calc(100vh-64px)] flex-col">
        <button className="btn-ghost m-3 self-start text-sm" onClick={() => setComposing(null)}>Back to table</button>
        <div className="min-h-0 flex-1">
          <OrderComposer
            tableId={table.id}
            existingOrder={composing === 'new' ? undefined : composing}
            onDone={() => {
              setComposing(null);
              mutate();
              onChanged();
            }}
          />
        </div>
      </div>
    );
  }

  const canSeat = table.status === 'AVAILABLE' || table.status === 'RESERVED';

  return (
    <div className="space-y-6 p-5">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Fact label="Seats" value={table.seats} />
        <Fact label="Guests" value={table.guests ?? '—'} />
        <Fact label="Seated" value={table.seatedAt ? `${minutesSince(table.seatedAt)}m` : '—'} />
      </div>

      <ErrorNote error={error} />

      {canSeat && (
        <div className="flex items-center gap-3 rounded-2xl border border-forest-700 p-4">
          <div className="flex items-center rounded-xl bg-forest-800">
            <button className="p-2.5" onClick={() => setGuests((g) => Math.max(1, g - 1))} aria-label="Fewer guests"><Minus className="h-4 w-4" /></button>
            <span className="w-8 text-center text-lg font-bold" aria-live="polite">{guests}</span>
            <button className="p-2.5" onClick={() => setGuests((g) => Math.min(table.seats + 4, g + 1))} aria-label="More guests"><Plus className="h-4 w-4" /></button>
          </div>
          <button className="btn-brass flex-1 py-3" disabled={busy} onClick={() => act(() => api(`/tables/${table.id}/seat`, { as: 'staff', body: { guests } }))}>
            Seat {guests} {guests === 1 ? 'guest' : 'guests'}
          </button>
        </div>
      )}

      {table.status !== 'AVAILABLE' && table.status !== 'CLEANING' && (
        <button className="btn-brass w-full py-3" onClick={() => setComposing('new')}>
          <Plus className="h-4 w-4" /> New order
        </button>
      )}

      {orders?.map((o) => (
        <section key={o.id} className="rounded-2xl border border-forest-700">
          <div className="flex items-center justify-between border-b border-forest-700 px-5 py-3">
            <span className="font-display font-semibold">Order #{o.number}</span>
            <StatusPill status={o.status} />
          </div>
          <OrderDetail order={o} onChange={() => { mutate(); onChanged(); }} onAddItems={() => setComposing(o)} />
        </section>
      ))}

      <div className="flex flex-wrap gap-2 border-t border-forest-700 pt-5">
        {table.status === 'CLEANING' && (
          <button className="btn-brass flex-1" disabled={busy} onClick={() => act(() => api(`/tables/${table.id}/status`, { as: 'staff', method: 'PATCH', body: { status: 'AVAILABLE' } }))}>
            <Sparkles className="h-4 w-4" /> Table is reset
          </button>
        )}
        {table.status !== 'AVAILABLE' && table.status !== 'CLEANING' && !orders?.length && (
          <button className="btn-outline flex-1" disabled={busy} onClick={() => act(() => api(`/tables/${table.id}/status`, { as: 'staff', method: 'PATCH', body: { status: 'CLEANING' } }))}>
            Guests have left
          </button>
        )}
        {table.status === 'AVAILABLE' && (
          <button className="btn-outline flex-1" disabled={busy} onClick={() => act(() => api(`/tables/${table.id}/status`, { as: 'staff', method: 'PATCH', body: { status: 'RESERVED' } }))}>
            Hold for booking
          </button>
        )}
        <a className="btn-ghost text-sm text-stone-400" href={`/t/${table.code}`} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" /> Guest ordering page
        </a>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-forest-900 py-3">
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-stone-400">{label}</p>
    </div>
  );
}

function ReservationList({ reservations, tables, onChange }: { reservations?: Reservation[]; tables: FloorTable[]; onChange: () => void }) {
  const [error, setError] = useState<string | null>(null);
  if (!reservations) return <Spinner />;
  const upcoming = reservations.filter((r) => r.status === 'BOOKED');
  if (!upcoming.length) return <p className="text-sm text-stone-400">No more bookings today.</p>;

  const update = async (id: string, body: object) => {
    setError(null);
    try {
      await api(`/reservations/${id}`, { as: 'staff', method: 'PATCH', body });
      onChange();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <ErrorNote error={error} />
      {upcoming.map((r) => {
        const fits = tables.filter((t) => t.seats >= r.partySize && (t.status === 'AVAILABLE' || t.id === r.table?.id));
        return (
          <article key={r.id} className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-sm text-stone-400">{clock(r.time)} · {r.partySize} guests</p>
              </div>
              {r.customer && r.customer.tier !== 'MEMBER' && <TierBadge tier={r.customer.tier} />}
            </div>
            {r.notes && <p className="mt-2 text-xs text-brass-light">{r.notes}</p>}
            <div className="mt-3 flex gap-2">
              <select
                className="input py-1.5 text-xs"
                value={r.table?.id ?? ''}
                onChange={(e) => update(r.id, { tableId: e.target.value })}
                aria-label={`Table for ${r.name}`}
              >
                <option value="">Assign table</option>
                {fits.map((t) => (
                  <option key={t.id} value={t.id}>{t.label} ({t.seats})</option>
                ))}
              </select>
              <button className="btn-brass px-3 py-1.5 text-xs" disabled={!r.table} onClick={() => update(r.id, { status: 'SEATED' })}>
                Seat
              </button>
              <button className="btn-ghost px-2 py-1.5 text-xs text-stone-400" onClick={() => update(r.id, { status: 'NO_SHOW' })}>
                No-show
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
