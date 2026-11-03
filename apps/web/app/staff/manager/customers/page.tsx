'use client';

import clsx from 'clsx';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import useSWR from 'swr';
import { StaffHeader, useStaff } from '@/components/staff';
import { Empty, ErrorNote, Sheet, Spinner, StatusPill, TierBadge } from '@/components/ui';
import { api, staffFetcher } from '@/lib/api';
import { CHART, tooltipStyle } from '@/lib/chart';
import { ago, dateTime, money, TIER_LABEL } from '@/lib/format';
import type { Order, Tier } from '@/lib/types';

interface CustomerRow {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  tier: Tier;
  points: number;
  lifetimePoints: number;
  lifetimeSpend: number;
  visits: number;
  lastVisitAt?: string | null;
  createdAt: string;
}

interface CustomerStats {
  totals: { customers: number; newCustomers: number; activeInRange: number; returningRate: number; avgLifetimeSpend: number; avgVisits: number };
  tiers: { tier: Tier; customers: number; lifetimeSpend: number; outstandingPoints: number }[];
  revenueByTier: { tier: Tier | 'GUEST'; revenue: number; orders: number }[];
}

const TIER_FILL: Record<string, string> = { GUEST: '#3f4842', MEMBER: CHART.member, SILVER: CHART.silver, GOLD: CHART.gold };
const TIERS: Tier[] = ['MEMBER', 'SILVER', 'GOLD'];

export default function Customers() {
  const me = useStaff();
  const isManager = me?.role === 'MANAGER';
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState<Tier | ''>('');
  const [sort, setSort] = useState('spend');
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: stats } = useSWR<CustomerStats>(isManager ? '/stats/customers?range=30' : null, staffFetcher);
  const { data: list, mutate } = useSWR<CustomerRow[]>(
    `/customers?sort=${sort}${tier ? `&tier=${tier}` : ''}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    staffFetcher,
    { keepPreviousData: true },
  );

  return (
    <div>
      <StaffHeader title="Customers" sub="Who's coming in, how often, and what they're worth" />

      {isManager && (
        <div className="space-y-5 px-5 pb-6 md:px-8">
          {!stats ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-forest-700 bg-forest-700 md:grid-cols-5">
                <Stat label="Customers" value={stats.totals.customers.toLocaleString()} />
                <Stat label="New in 30 days" value={stats.totals.newCustomers} />
                <Stat label="Visited in 30 days" value={stats.totals.activeInRange} />
                <Stat label="Come back again" value={`${stats.totals.returningRate}%`} />
                <Stat label="Average lifetime spend" value={money(stats.totals.avgLifetimeSpend)} />
              </section>

              <section className="grid gap-5 lg:grid-cols-2">
                <div className="panel p-6">
                  <h2 className="text-lg font-semibold">Members by tier</h2>
                  <div className="mt-5 space-y-4">
                    {TIERS.map((t) => {
                      const row = stats.tiers.find((x) => x.tier === t);
                      const pct = ((row?.customers ?? 0) / Math.max(1, stats.totals.customers)) * 100;
                      return (
                        <div key={t}>
                          <div className="flex items-center justify-between text-sm">
                            <TierBadge tier={t} size="md" />
                            <span className="text-stone-400">
                              {row?.customers ?? 0} people · {money(row?.lifetimeSpend ?? 0)} lifetime · {(row?.outstandingPoints ?? 0).toLocaleString()} pts unspent
                            </span>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-forest-800">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: TIER_FILL[t] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="panel p-6">
                  <h2 className="text-lg font-semibold">Revenue by tier, 30 days</h2>
                  <div className="mt-4 h-48">
                    <ResponsiveContainer>
                      <BarChart data={['GUEST', ...TIERS].map((t) => stats.revenueByTier.find((r) => r.tier === t) ?? { tier: t, revenue: 0, orders: 0 })} layout="vertical" margin={{ left: 10 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="tier" tickFormatter={(t) => (t === 'GUEST' ? 'Guests' : TIER_LABEL[t as Tier])} tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={60} />
                        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={tooltipStyle} formatter={(v) => [money(Number(v)), 'Revenue']} />
                        <Bar dataKey="revenue" radius={[0, 6, 6, 0]} maxBarSize={28}>
                          {['GUEST', ...TIERS].map((t) => <Cell key={t} fill={TIER_FILL[t]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 px-5 pb-4 md:px-8">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" aria-hidden />
          <input className="input pl-9" placeholder="Name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search customers" />
        </div>
        <select className="input w-auto" value={tier} onChange={(e) => setTier(e.target.value as Tier | '')} aria-label="Tier">
          <option value="">All tiers</option>
          {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
          <option value="spend">Highest spend</option>
          <option value="visits">Most visits</option>
          <option value="recent">Recent visit</option>
          <option value="newest">Newest</option>
          <option value="name">Name</option>
        </select>
      </div>

      <div className="px-5 pb-10 md:px-8">
        {!list ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !list.length ? (
          <Empty title="No customers found" />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-forest-800">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-forest-900 text-left text-stone-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Tier</th>
                  <th className="px-4 py-3 text-right font-medium">Visits</th>
                  <th className="px-4 py-3 text-right font-medium">Spend</th>
                  <th className="px-4 py-3 text-right font-medium">Points</th>
                  <th className="px-4 py-3 font-medium">Last visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-forest-800">
                {list.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-forest-900/60" onClick={() => setOpenId(c.id)}>
                    <td className="px-4 py-3">
                      <button className="text-left" onClick={() => setOpenId(c.id)}>
                        <span className="block font-semibold">{c.name}</span>
                        <span className="text-xs text-stone-500">{c.email}</span>
                      </button>
                    </td>
                    <td className="px-4 py-3"><TierBadge tier={c.tier} /></td>
                    <td className="px-4 py-3 text-right">{c.visits}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(c.lifetimeSpend)}</td>
                    <td className="px-4 py-3 text-right text-stone-400">{c.points.toLocaleString()}</td>
                    <td className="px-4 py-3 text-stone-400">{c.lastVisitAt ? ago(c.lastVisitAt) : 'Not yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Sheet open={!!openId} onClose={() => setOpenId(null)} dark wide title="Customer">
        {openId && <CustomerDetail id={openId} canEdit={isManager} onChanged={() => mutate()} />}
      </Sheet>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-forest-900 p-5">
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-stone-400">{label}</p>
    </div>
  );
}

interface Detail extends CustomerRow {
  hasAccount: boolean;
  favourites: { name: string; count: number }[];
  orders: Order[];
  ledger: { id: string; delta: number; reason: string; createdAt: string }[];
}

function CustomerDetail({ id, canEdit, onChanged }: { id: string; canEdit: boolean; onChanged: () => void }) {
  const { data: c, mutate } = useSWR<Detail>(`/customers/${id}`, staffFetcher);
  const [adjust, setAdjust] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async (body: object) => {
    setError(null);
    try {
      await api(`/customers/${id}`, { as: 'staff', method: 'PATCH', body });
      mutate();
      onChanged();
      setAdjust('');
    } catch (e) {
      setError(e.message);
    }
  };

  if (!c) return <div className="flex justify-center py-16"><Spinner /></div>;

  return (
    <div className="space-y-6 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-2xl font-bold">{c.name}</p>
          <p className="text-sm text-stone-400">{c.email}{c.phone ? ` · ${c.phone}` : ''}</p>
          <p className="mt-1 text-xs text-stone-500">{c.hasAccount ? 'Rewards account' : 'Guest (no password yet)'} · since {new Date(c.createdAt).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}</p>
        </div>
        <TierBadge tier={c.tier} size="md" />
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ['Visits', c.visits],
          ['Spend', money(c.lifetimeSpend)],
          ['Avg bill', money(c.visits ? c.lifetimeSpend / c.visits : 0)],
          ['Points', c.points.toLocaleString()],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-xl bg-forest-900 py-3">
            <p className="font-display text-lg font-bold">{v}</p>
            <p className="text-[11px] text-stone-400">{l}</p>
          </div>
        ))}
      </div>

      {c.favourites.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-stone-300">Usually orders</p>
          <div className="flex flex-wrap gap-2">
            {c.favourites.map((f) => (
              <span key={f.name} className="rounded-full bg-forest-800 px-3 py-1 text-xs">{f.name} <span className="text-stone-400">×{f.count}</span></span>
            ))}
          </div>
        </div>
      )}

      {canEdit && (
        <div className="space-y-3 rounded-2xl border border-forest-700 p-4">
          <p className="text-sm font-semibold">Manage membership</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Tier">
            {TIERS.map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={c.tier === t}
                onClick={() => c.tier !== t && save({ tier: t })}
                className={clsx('flex-1 rounded-xl py-2 text-sm font-semibold ring-1', c.tier === t ? 'bg-forest-700 ring-brass' : 'ring-forest-700 text-stone-400')}
              >
                {TIER_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="input py-2" inputMode="numeric" placeholder="Points (+ or −)" value={adjust} onChange={(e) => setAdjust(e.target.value.replace(/[^\d-]/g, ''))} aria-label="Adjust points" />
            <button className="btn-outline shrink-0" disabled={!Number(adjust)} onClick={() => save({ pointsAdjustment: Number(adjust) })}>Adjust points</button>
          </div>
          <ErrorNote error={error} />
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-stone-300">Recent orders</p>
        {!c.orders.length ? (
          <p className="text-sm text-stone-500">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-forest-800 rounded-xl border border-forest-800">
            {c.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span>
                  #{o.number} <span className="text-stone-400">· {o.table?.label ?? 'Takeaway'} · {dateTime(o.createdAt)}</span>
                </span>
                <span className="flex items-center gap-2"><StatusPill status={o.status} />{money(o.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
