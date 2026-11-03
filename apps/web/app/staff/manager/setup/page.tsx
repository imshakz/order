'use client';

import clsx from 'clsx';
import { Check, ExternalLink, Plus, Printer, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { FormEvent, useEffect, useState } from 'react';
import useSWR from 'swr';
import { StaffHeader } from '@/components/staff';
import { ErrorNote, Sheet, Spinner, TierBadge } from '@/components/ui';
import { api, staffFetcher } from '@/lib/api';
import type { FloorTable, Settings, StaffRole, StaffUser, TableShape, TierRule } from '@/lib/types';

const TABS = ['Tables', 'Rewards', 'Team', 'Modules'] as const;
type Tab = (typeof TABS)[number];

export default function Setup() {
  const [tab, setTab] = useState<Tab>('Tables');
  return (
    <div>
      <StaffHeader title="Setup" sub="Shape the system around how your restaurant runs">
        <div className="flex rounded-xl bg-forest-900 p-1" role="tablist">
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx('rounded-lg px-3 py-1.5 text-sm', tab === t ? 'bg-forest-700 font-semibold' : 'text-stone-400')}>
              {t}
            </button>
          ))}
        </div>
      </StaffHeader>
      <div className="px-5 pb-10 md:px-8">
        {tab === 'Tables' && <TablesSetup />}
        {tab === 'Rewards' && <RewardsSetup />}
        {tab === 'Team' && <TeamSetup />}
        {tab === 'Modules' && <ModulesInfo />}
      </div>
    </div>
  );
}

// ---------------- Tables ----------------

const SHAPES: TableShape[] = ['ROUND', 'SQUARE', 'RECT', 'BOOTH'];

function TablesSetup() {
  const { data: tables, mutate } = useSWR<FloorTable[]>('/tables', staffFetcher);
  const [editing, setEditing] = useState<Partial<FloorTable> | null>(null);
  const [qr, setQr] = useState<FloorTable | null>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

  if (!tables) return <Spinner />;
  const nextPos = { posX: 0, posY: Math.max(-1, ...tables.map((t) => t.posY)) + 1 };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-400">{tables.length} tables, {tables.reduce((s, t) => s + t.seats, 0)} seats. Each table has its own QR code for guest ordering.</p>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print all codes</button>
          <button className="btn-brass" onClick={() => setEditing({ seats: 4, section: 'Main', shape: 'SQUARE', ...nextPos })}><Plus className="h-4 w-4" /> Table</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((t) => (
          <article key={t.id} className="panel flex items-center gap-4 p-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-forest-800 font-display text-xl font-bold">{t.label}</div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{t.seats} seats · {t.section}</p>
              <p className="text-stone-400">{t.shape.toLowerCase()} · grid {t.posX + 1},{t.posY + 1}</p>
            </div>
            <button className="btn-ghost p-2" onClick={() => setQr(t)} aria-label={`QR code for ${t.label}`}><QrCode className="h-5 w-5" /></button>
            <button className="btn-ghost p-2 text-sm" onClick={() => setEditing(t)}>Edit</button>
          </article>
        ))}
      </div>

      {/* Printable sheet of codes */}
      <div className="hidden print:block">
        <div className="grid grid-cols-3 gap-6 bg-white p-6 text-black">
          {tables.map((t) => (
            <div key={t.id} className="flex flex-col items-center gap-2 border p-4">
              <QRCodeSVG value={`${origin}/t/${t.code}`} size={140} />
              <p className="text-lg font-bold">Table {t.label}</p>
              <p className="text-xs">Scan to see the menu and order</p>
            </div>
          ))}
        </div>
      </div>

      <Sheet open={!!editing} onClose={() => setEditing(null)} dark title={editing?.id ? `Table ${editing.label}` : 'New table'}>
        {editing && <TableForm table={editing} onDone={() => { setEditing(null); mutate(); }} />}
      </Sheet>

      <Sheet open={!!qr} onClose={() => setQr(null)} dark title={qr ? `Table ${qr.label} code` : ''}>
        {qr && (
          <div className="space-y-4 p-6 text-center">
            <div className="mx-auto inline-block rounded-2xl bg-white p-5">
              <QRCodeSVG value={`${origin}/t/${qr.code}`} size={220} />
            </div>
            <p className="break-all text-sm text-stone-400">{origin}/t/{qr.code}</p>
            <div className="flex justify-center gap-2">
              <a className="btn-outline" href={`/t/${qr.code}`} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open</a>
              <button
                className="btn-outline"
                onClick={async () => {
                  if (!confirm('Make a new code? The printed one for this table will stop working.')) return;
                  const t = await api<FloorTable>(`/tables/${qr.id}/rotate-code`, { as: 'staff', body: {} });
                  setQr({ ...qr, code: t.code });
                  mutate();
                }}
              >
                <RefreshCw className="h-4 w-4" /> New code
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </section>
  );
}

function TableForm({ table, onDone }: { table: Partial<FloorTable>; onDone: () => void }) {
  const [f, setF] = useState({
    label: table.label ?? '',
    seats: String(table.seats ?? 4),
    section: table.section ?? 'Main',
    shape: table.shape ?? 'SQUARE',
    posX: String((table.posX ?? 0) + 1),
    posY: String((table.posY ?? 0) + 1),
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      label: f.label,
      seats: Number(f.seats),
      section: f.section,
      shape: f.shape,
      posX: Math.max(0, Number(f.posX) - 1),
      posY: Math.max(0, Number(f.posY) - 1),
    };
    try {
      if (table.id) await api(`/tables/${table.id}`, { as: 'staff', method: 'PATCH', body });
      else await api('/tables', { as: 'staff', body });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="t-label">Name</label><input id="t-label" className="input" required placeholder="T7" value={f.label} onChange={set('label')} /></div>
        <div><label className="label" htmlFor="t-seats">Seats</label><input id="t-seats" type="number" min={1} max={40} className="input" required value={f.seats} onChange={set('seats')} /></div>
      </div>
      <div><label className="label" htmlFor="t-section">Section</label><input id="t-section" className="input" placeholder="Main, Patio, Bar…" value={f.section} onChange={set('section')} /></div>
      <div>
        <span className="label">Shape</span>
        <div className="grid grid-cols-4 gap-2">
          {SHAPES.map((s) => (
            <button type="button" key={s} onClick={() => setF({ ...f, shape: s })} className={clsx('rounded-xl py-2 text-xs font-semibold ring-1', f.shape === s ? 'bg-forest-700 ring-brass' : 'text-stone-400 ring-forest-700')}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="t-x">Floor column</label><input id="t-x" type="number" min={1} className="input" value={f.posX} onChange={set('posX')} /></div>
        <div><label className="label" htmlFor="t-y">Floor row</label><input id="t-y" type="number" min={1} className="input" value={f.posY} onChange={set('posY')} /></div>
      </div>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <button className="btn-brass flex-1" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}{table.id ? 'Save table' : 'Add table'}</button>
        {table.id && (
          <button
            type="button"
            className="btn-outline text-ember"
            onClick={async () => {
              if (!confirm(`Remove table ${table.label}?`)) return;
              await api(`/tables/${table.id}`, { as: 'staff', method: 'DELETE' }).catch((e) => setError(e.message));
              onDone();
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  );
}

// ---------------- Rewards tiers ----------------

function RewardsSetup() {
  const { data, mutate, error } = useSWR<{ pointValue: number; rules: TierRule[] }>('/loyalty/tiers', staffFetcher);
  if (error) return <p className="text-sm text-stone-400">The rewards module is switched off for this restaurant.</p>;
  if (!data) return <Spinner />;
  return (
    <section className="space-y-4">
      <p className="max-w-2xl text-sm text-stone-400">
        Customers earn points on what they spend (times their tier&apos;s multiplier) and move up when their lifetime points pass a threshold.
        Each point is worth ${data.pointValue.toFixed(2)} when redeemed.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {data.rules.map((r) => <TierCard key={r.tier} rule={r} onSaved={() => mutate()} />)}
      </div>
    </section>
  );
}

function TierCard({ rule, onSaved }: { rule: TierRule; onSaved: () => void }) {
  const [f, setF] = useState({
    minLifetimePoints: String(rule.minLifetimePoints),
    discountPercent: String(rule.discountPercent),
    pointsMultiplier: String(rule.pointsMultiplier),
    perks: rule.perks.join('\n'),
  });
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setState('saving');
    setError(null);
    try {
      await api(`/loyalty/tiers/${rule.tier}`, {
        as: 'staff',
        method: 'PUT',
        body: {
          minLifetimePoints: Number(f.minLifetimePoints),
          discountPercent: Number(f.discountPercent),
          pointsMultiplier: Number(f.pointsMultiplier),
          perks: f.perks.split('\n').map((p) => p.trim()).filter(Boolean),
        },
      });
      setState('saved');
      onSaved();
      setTimeout(() => setState('idle'), 1500);
    } catch (err) {
      setError(err.message);
      setState('idle');
    }
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form onSubmit={save} className="panel space-y-3 p-5">
      <TierBadge tier={rule.tier} size="md" />
      <div className="grid grid-cols-3 gap-2">
        <div><label className="label text-xs" htmlFor={`${rule.tier}-min`}>From points</label><input id={`${rule.tier}-min`} className="input" inputMode="numeric" disabled={rule.tier === 'MEMBER'} value={f.minLifetimePoints} onChange={set('minLifetimePoints')} /></div>
        <div><label className="label text-xs" htmlFor={`${rule.tier}-disc`}>Discount %</label><input id={`${rule.tier}-disc`} className="input" inputMode="decimal" value={f.discountPercent} onChange={set('discountPercent')} /></div>
        <div><label className="label text-xs" htmlFor={`${rule.tier}-mult`}>Points ×</label><input id={`${rule.tier}-mult`} className="input" inputMode="decimal" value={f.pointsMultiplier} onChange={set('pointsMultiplier')} /></div>
      </div>
      <div>
        <label className="label text-xs" htmlFor={`${rule.tier}-perks`}>Perks guests see (one per line)</label>
        <textarea id={`${rule.tier}-perks`} rows={4} className="input" value={f.perks} onChange={set('perks')} />
      </div>
      <ErrorNote error={error} />
      <button className="btn-outline w-full" disabled={state === 'saving'}>
        {state === 'saving' ? <Spinner className="h-4 w-4" /> : state === 'saved' ? <Check className="h-4 w-4" /> : null}
        {state === 'saved' ? 'Saved' : 'Save tier'}
      </button>
    </form>
  );
}

// ---------------- Team ----------------

const ROLES: StaffRole[] = ['MANAGER', 'HOST', 'SERVER', 'KITCHEN'];

function TeamSetup() {
  const { data: staff, mutate } = useSWR<(StaffUser & { active: boolean })[]>('/staff', staffFetcher);
  const [f, setF] = useState({ name: '', email: '', password: '', role: 'SERVER' as StaffRole });
  const [error, setError] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/staff', { as: 'staff', body: f });
      setF({ name: '', email: '', password: '', role: 'SERVER' });
      mutate();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="overflow-hidden rounded-2xl border border-forest-800">
        {!staff ? (
          <Spinner className="m-6" />
        ) : (
          <ul className="divide-y divide-forest-800">
            {staff.map((s) => (
              <li key={s.id} className={clsx('flex items-center gap-4 px-4 py-3 text-sm', !s.active && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-stone-400">{s.email}</p>
                </div>
                <select
                  className="input w-32 py-1.5 text-xs"
                  value={s.role}
                  onChange={async (e) => {
                    await api(`/staff/${s.id}`, { as: 'staff', method: 'PATCH', body: { role: e.target.value } }).catch((x) => setError(x.message));
                    mutate();
                  }}
                  aria-label={`Role for ${s.name}`}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
                </select>
                <button
                  className="text-xs text-stone-400 underline"
                  onClick={async () => {
                    await api(`/staff/${s.id}`, { as: 'staff', method: 'PATCH', body: { active: !s.active } }).catch((x) => setError(x.message));
                    mutate();
                  }}
                >
                  {s.active ? 'Disable' : 'Enable'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form onSubmit={add} className="panel h-fit space-y-3 p-5">
        <h2 className="font-semibold">Add a team member</h2>
        <input className="input" placeholder="Name" required minLength={2} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Name" />
        <input className="input" type="email" placeholder="Email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Email" />
        <input className="input" type="password" placeholder="Temporary password" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} aria-label="Temporary password" />
        <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as StaffRole })} aria-label="Role">
          {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
        </select>
        <ErrorNote error={error} />
        <button className="btn-brass w-full"><Plus className="h-4 w-4" /> Add to team</button>
      </form>
    </section>
  );
}

// ---------------- Modules ----------------

const MODULES: { key: string; name: string; what: string }[] = [
  { key: 'tables', name: 'Tables & floor plan', what: 'Floor view, table QR codes, seating' },
  { key: 'menu', name: 'Menu', what: 'Sections, dishes, sold-out switches' },
  { key: 'specials', name: "Chef's specials", what: 'Featured dishes, special prices, tier-only dishes' },
  { key: 'orders', name: 'Ordering', what: 'Guest QR ordering and staff order taking' },
  { key: 'kitchen', name: 'Kitchen display', what: 'Live tickets for the pass' },
  { key: 'payments', name: 'Payments', what: 'Pay at table (Stripe), cash and card machine' },
  { key: 'loyalty', name: 'Rewards', what: 'Points, Member / Silver / Gold tiers, discounts' },
  { key: 'reservations', name: 'Bookings', what: 'Online booking and the host booking list' },
  { key: 'stats', name: 'Reports', what: 'Sales, best sellers and customer statistics' },
];

function ModulesInfo() {
  const { data } = useSWR<Settings>('/settings', (p: string) => api(p));
  if (!data) return <Spinner />;
  return (
    <section className="space-y-4">
      <p className="max-w-2xl text-sm text-stone-400">
        Switch modules on or off with <code className="rounded bg-forest-800 px-1.5 py-0.5 text-brass-light">ENABLED_MODULES</code> in your <code className="rounded bg-forest-800 px-1.5 py-0.5 text-brass-light">.env</code> file, then restart. A café might only need menu, ordering and payments.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((m) => {
          const on = data.features.includes(m.key);
          return (
            <li key={m.key} className={clsx('panel p-4', !on && 'opacity-50')}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">{m.name}</p>
                <span className={clsx('rounded-full px-2 py-0.5 text-xs font-semibold', on ? 'bg-status-available/20 text-status-available' : 'bg-forest-800 text-stone-400')}>{on ? 'On' : 'Off'}</span>
              </div>
              <p className="mt-1 text-sm text-stone-400">{m.what}</p>
              <p className="mt-2 text-xs text-stone-500">{m.key}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
