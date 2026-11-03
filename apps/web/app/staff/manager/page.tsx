'use client';

import clsx from 'clsx';
import { TrendingDown, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import useSWR from 'swr';
import { StaffHeader } from '@/components/staff';
import { Spinner, StatusPill } from '@/components/ui';
import { staffFetcher } from '@/lib/api';
import { CHART, tooltipStyle } from '@/lib/chart';
import { ago, money, TABLE_STATUS } from '@/lib/format';
import { useLive } from '@/lib/hooks';
import type { Order, TableStatus } from '@/lib/types';

interface Overview {
  rangeDays: number;
  today: { revenue: number; orders: number; avgTicket: number };
  range: { revenue: number; orders: number; avgTicket: number; tips: number; revenueChange: number | null };
  live: { openOrders: number; tablesBusy: number; tablesTotal: number; guestsSeated: number; tableStatus: Partial<Record<TableStatus, number>> };
  revenueByDay: { date: string; revenue: number; orders: number }[];
  ordersByHour: { hour: number; orders: number }[];
  topItems: { name: string; quantity: number; revenue: number }[];
  paymentMix: { method: string; count: number; amount: number }[];
  orderSources: { source: string; count: number }[];
}


const RANGES = [7, 14, 30, 90];

export default function ManagerOverview() {
  const [range, setRange] = useState(7);
  const { data, mutate } = useSWR<Overview>(`/stats/overview?range=${range}`, staffFetcher);
  const { data: live, mutate: reloadLive } = useSWR<Order[]>('/orders?active=1&take=8', staffFetcher);
  useLive('staff', {
    'order.created': () => { mutate(); reloadLive(); },
    'order.updated': () => { mutate(); reloadLive(); },
    'table.updated': () => mutate(),
  });

  return (
    <div>
      <StaffHeader title="Overview" sub={new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}>
        <div className="flex rounded-xl bg-forest-900 p-1" role="tablist" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={clsx('rounded-lg px-3 py-1.5 text-sm', range === r ? 'bg-forest-700 font-semibold' : 'text-stone-400')}
            >
              {r}d
            </button>
          ))}
        </div>
      </StaffHeader>

      {!data ? (
        <div className="flex justify-center py-24"><Spinner /></div>
      ) : (
        <div className="space-y-5 px-5 pb-10 md:px-8">
          {/* Today leads; the range figures sit beneath it as context. */}
          <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="panel p-6">
              <p className="text-sm text-stone-400">Takings today</p>
              <p className="font-display text-6xl font-extrabold tracking-tight">{money(data.today.revenue)}</p>
              <div className="mt-6 grid grid-cols-3 gap-4 border-t border-forest-700 pt-5">
                <Figure label="Orders today" value={data.today.orders} />
                <Figure label="Average bill" value={money(data.today.avgTicket)} />
                <Figure label={`Tips, ${range} days`} value={money(data.range.tips)} />
              </div>
            </div>
            <div className="panel p-6">
              <p className="text-sm text-stone-400">Right now</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-5xl font-extrabold">{data.live.tablesBusy}</span>
                <span className="text-stone-400">of {data.live.tablesTotal} tables in use</span>
              </div>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-forest-800" aria-hidden>
                {(Object.keys(TABLE_STATUS) as TableStatus[]).filter((s) => s !== 'AVAILABLE').map((s) => (
                  <span key={s} className={TABLE_STATUS[s].color} style={{ width: `${((data.live.tableStatus[s] ?? 0) / Math.max(1, data.live.tablesTotal)) * 100}%` }} />
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4">
                <Figure label="Guests seated" value={data.live.guestsSeated} />
                <Figure label="Open orders" value={data.live.openOrders} />
              </div>
            </div>
          </section>

          <section className="panel p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm text-stone-400">Revenue, last {range} days</p>
                <p className="font-display text-3xl font-bold">{money(data.range.revenue)}</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-stone-400">{data.range.orders} orders · avg {money(data.range.avgTicket)}</span>
                {data.range.revenueChange != null && (
                  <span className={clsx('flex items-center gap-1 font-semibold', data.range.revenueChange >= 0 ? 'text-status-available' : 'text-ember')}>
                    {data.range.revenueChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {Math.abs(data.range.revenueChange)}% vs previous {range} days
                  </span>
                )}
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={data.revenueByDay} margin={{ left: -10, right: 0, top: 5 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => new Date(`${d}T00:00`).toLocaleDateString('en-AU', range > 14 ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' })}
                    tick={{ fill: CHART.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={12}
                  />
                  <YAxis tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    contentStyle={tooltipStyle}
                    formatter={(v) => [money(Number(v)), 'Revenue']}
                    labelFormatter={(d) => new Date(`${d}T00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })}
                  />
                  <Bar dataKey="revenue" fill={CHART.brass} radius={[6, 6, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="panel p-6">
              <h2 className="text-lg font-semibold">Best sellers</h2>
              <ol className="mt-4 space-y-3">
                {data.topItems.map((t, i) => {
                  const max = data.topItems[0]?.quantity || 1;
                  return (
                    <li key={t.name} className="text-sm">
                      <div className="flex justify-between gap-3">
                        <span><span className="mr-2 text-stone-500">{i + 1}</span>{t.name}</span>
                        <span className="text-stone-400">{t.quantity} sold · {money(t.revenue)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-forest-800">
                        <div className="h-full rounded-full bg-status-available" style={{ width: `${(t.quantity / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="panel p-6">
              <h2 className="text-lg font-semibold">Busiest hours</h2>
              <div className="mt-4 h-52">
                <ResponsiveContainer>
                  <BarChart data={data.ordersByHour.filter((h) => h.hour >= 10 && h.hour <= 23)} margin={{ left: -25, right: 0 }}>
                    <XAxis dataKey="hour" tickFormatter={(h) => (h === 12 ? '12p' : h > 12 ? `${h - 12}p` : `${h}a`)} tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={tooltipStyle} formatter={(v) => [String(v), 'Orders']} labelFormatter={(h) => `${h}:00`} />
                    <Bar dataKey="orders" fill={CHART.green} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-forest-700 pt-4 text-sm">
                <div>
                  <p className="mb-2 text-stone-400">How guests paid</p>
                  {data.paymentMix.map((p) => (
                    <p key={p.method} className="flex justify-between"><span>{p.method === 'CARD_ONLINE' ? 'Phone' : p.method === 'CARD_TERMINAL' ? 'Card machine' : 'Cash'}</span><span className="text-stone-400">{money(p.amount)}</span></p>
                  ))}
                </div>
                <div>
                  <p className="mb-2 text-stone-400">Who placed orders</p>
                  {data.orderSources.map((s) => (
                    <p key={s.source} className="flex justify-between"><span>{s.source === 'CUSTOMER' ? 'Guests (QR)' : 'Staff'}</span><span className="text-stone-400">{s.count}</span></p>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="panel p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Open orders</h2>
              <Link href="/staff/manager/orders" className="text-sm text-brass-light underline-offset-2 hover:underline">All orders</Link>
            </div>
            {!live?.length ? (
              <p className="mt-3 text-sm text-stone-400">Nothing open right now.</p>
            ) : (
              <ul className="mt-3 divide-y divide-forest-800">
                {live.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="flex items-center gap-3">
                      <span className="w-10 font-display font-bold">{o.table?.label ?? 'TA'}</span>
                      <span className="text-stone-400">#{o.number} · {o.items.length} items · {ago(o.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      <StatusPill status={o.status} />
                      <span className="w-20 text-right font-semibold">{money(o.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-stone-400">{label}</p>
    </div>
  );
}
