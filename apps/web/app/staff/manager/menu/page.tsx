'use client';

import clsx from 'clsx';
import { Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { FormEvent, useState } from 'react';
import useSWR from 'swr';
import { StaffHeader, useStaff } from '@/components/staff';
import { DishArt, ErrorNote, Sheet, Spinner, TierBadge } from '@/components/ui';
import { api, staffFetcher } from '@/lib/api';
import { money, TIER_LABEL } from '@/lib/format';
import { useLive } from '@/lib/hooks';
import type { Menu, MenuItem, Settings, Tier } from '@/lib/types';

interface SpecialRow {
  id: string;
  headline: string;
  note: string;
  specialPrice: number | null;
  minTier: Tier;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  menuItem: MenuItem;
}

export default function MenuAdmin() {
  const me = useStaff();
  const isManager = me?.role === 'MANAGER';
  const { data: menu, mutate } = useSWR<Menu>('/menu?all=1', staffFetcher);
  const { data: settings } = useSWR<Settings>('/settings', (p: string) => api(p));
  const specialsOn = settings?.features.includes('specials');
  const { data: specials, mutate: reloadSpecials } = useSWR<SpecialRow[]>(specialsOn ? '/specials' : null, staffFetcher);
  const [editing, setEditing] = useState<Partial<MenuItem> | null>(null);
  const [specialFor, setSpecialFor] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useLive('staff', { 'menu.changed': () => { mutate(); reloadSpecials(); } });

  const toggle = async (item: MenuItem) => {
    setError(null);
    mutate(
      (m) => m && { ...m, categories: m.categories.map((c) => ({ ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, available: !i.available } : i)) })) },
      { revalidate: false },
    );
    try {
      await api(`/menu/items/${item.id}`, { as: 'staff', method: 'PATCH', body: { available: !item.available } });
    } catch (e) {
      setError(e.message);
      mutate();
    }
  };

  const addCategory = async () => {
    const name = prompt('Name of the new section, e.g. "Brunch"');
    if (!name) return;
    try {
      await api('/menu/categories', { as: 'staff', body: { name, sortOrder: (menu?.categories.length ?? 0) + 1 } });
      mutate();
    } catch (e) {
      setError(e.message);
    }
  };

  const allItems = menu?.categories.flatMap((c) => c.items) ?? [];

  return (
    <div>
      <StaffHeader title="Menu" sub="Switch a dish off when it sells out. Guests stop seeing it straight away.">
        {isManager && (
          <>
            <button className="btn-outline" onClick={addCategory}><Plus className="h-4 w-4" /> Section</button>
            <button className="btn-brass" onClick={() => setEditing({ categoryId: menu?.categories[0]?.id, tags: [], prepMinutes: 15 })}>
              <Plus className="h-4 w-4" /> Dish
            </button>
          </>
        )}
      </StaffHeader>

      <div className="space-y-6 px-5 pb-10 md:px-8">
        <ErrorNote error={error} />

        {specialsOn && (
          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-brass" aria-hidden /> Chef&apos;s specials</h2>
              <button className="btn-outline py-2" onClick={() => setSpecialFor(true)}><Plus className="h-4 w-4" /> New special</button>
            </div>
            {!specials ? (
              <Spinner className="mt-4" />
            ) : !specials.length ? (
              <p className="mt-3 text-sm text-stone-400">No specials yet. Feature a dish, give it a special price, or keep it for Gold members.</p>
            ) : (
              <ul className="mt-4 grid gap-3 md:grid-cols-2">
                {specials.map((s) => {
                  const live = s.active && (!s.endsAt || new Date(s.endsAt) > new Date());
                  return (
                    <li key={s.id} className={clsx('rounded-xl border p-4', live ? 'border-brass/50 bg-forest-800' : 'border-forest-700 opacity-60')}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">{s.headline}</p>
                          <p className="text-sm text-stone-400">
                            {s.menuItem.name} · {s.specialPrice != null ? <>{money(s.specialPrice)} <span className="line-through">{money(s.menuItem.price)}</span></> : money(s.menuItem.price)}
                          </p>
                        </div>
                        {s.minTier !== 'MEMBER' && <TierBadge tier={s.minTier} />}
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-stone-400">
                        <span>{s.endsAt ? `Ends ${new Date(s.endsAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : 'No end date'}</span>
                        <span className="flex gap-3">
                          <button
                            className="underline"
                            onClick={async () => {
                              await api(`/specials/${s.id}`, { as: 'staff', method: 'PATCH', body: { active: !s.active } }).catch((e) => setError(e.message));
                              reloadSpecials();
                            }}
                          >
                            {s.active ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            className="text-ember underline"
                            onClick={async () => {
                              if (!confirm('Remove this special?')) return;
                              await api(`/specials/${s.id}`, { as: 'staff', method: 'DELETE' }).catch((e) => setError(e.message));
                              reloadSpecials();
                            }}
                          >
                            Remove
                          </button>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {!menu ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : (
          menu.categories.map((c) => (
            <section key={c.id}>
              <h2 className="mb-3 text-lg font-semibold">{c.name} <span className="text-sm font-normal text-stone-500">{c.items.length}</span></h2>
              <ul className="divide-y divide-forest-800 rounded-2xl border border-forest-800">
                {c.items.map((i) => (
                  <li key={i.id} className={clsx('flex items-center gap-4 px-4 py-3', !i.available && 'opacity-50')}>
                    <DishArt name={i.name} className="h-11 w-11 shrink-0 rounded-lg text-sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{i.name}</p>
                      <p className="truncate text-sm text-stone-400">{i.description}</p>
                    </div>
                    <span className="w-20 text-right font-semibold">{money(i.price)}</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-stone-400">
                      <span className="hidden sm:inline">{i.available ? 'On menu' : 'Sold out'}</span>
                      <input type="checkbox" className="peer sr-only" checked={i.available} onChange={() => toggle(i)} aria-label={`${i.name} available`} />
                      <span className="relative h-6 w-11 rounded-full bg-forest-700 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-stone-300 after:transition-transform peer-checked:bg-status-available peer-checked:after:translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brass" />
                    </label>
                    {isManager && (
                      <button className="btn-ghost p-2" onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <Sheet open={!!editing} onClose={() => setEditing(null)} dark title={editing?.id ? `Edit ${editing.name}` : 'New dish'}>
        {editing && menu && (
          <ItemForm item={editing} categories={menu.categories} onDone={() => { setEditing(null); mutate(); }} />
        )}
      </Sheet>

      <Sheet open={specialFor} onClose={() => setSpecialFor(false)} dark title="New chef's special">
        {specialFor && <SpecialForm items={allItems} onDone={() => { setSpecialFor(false); reloadSpecials(); }} />}
      </Sheet>
    </div>
  );
}

function ItemForm({ item, categories, onDone }: { item: Partial<MenuItem>; categories: { id: string; name: string }[]; onDone: () => void }) {
  const [f, setF] = useState({
    name: item.name ?? '',
    description: item.description ?? '',
    price: item.price != null ? String(item.price) : '',
    categoryId: item.categoryId ?? categories[0]?.id ?? '',
    tags: (item.tags ?? []).join(', '),
    prepMinutes: String(item.prepMinutes ?? 15),
    imageUrl: item.imageUrl ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name: f.name,
      description: f.description,
      price: Number(f.price),
      categoryId: f.categoryId,
      tags: f.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
      prepMinutes: Number(f.prepMinutes) || 0,
      imageUrl: f.imageUrl || undefined,
    };
    try {
      if (item.id) await api(`/menu/items/${item.id}`, { as: 'staff', method: 'PATCH', body });
      else await api('/menu/items', { as: 'staff', body });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form onSubmit={submit} className="space-y-4 p-5">
      <div><label className="label" htmlFor="i-name">Name</label><input id="i-name" className="input" required value={f.name} onChange={set('name')} /></div>
      <div><label className="label" htmlFor="i-desc">Description</label><textarea id="i-desc" rows={2} className="input" value={f.description} onChange={set('description')} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="i-price">Price ($)</label><input id="i-price" className="input" required inputMode="decimal" value={f.price} onChange={set('price')} /></div>
        <div><label className="label" htmlFor="i-prep">Prep time (min)</label><input id="i-prep" className="input" inputMode="numeric" value={f.prepMinutes} onChange={set('prepMinutes')} /></div>
      </div>
      <div>
        <label className="label" htmlFor="i-cat">Section</label>
        <select id="i-cat" className="input" value={f.categoryId} onChange={set('categoryId')}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div><label className="label" htmlFor="i-tags">Tags, comma separated</label><input id="i-tags" className="input" placeholder="vegan, gf, spicy" value={f.tags} onChange={set('tags')} /></div>
      <div><label className="label" htmlFor="i-img">Photo URL (optional)</label><input id="i-img" type="url" className="input" value={f.imageUrl} onChange={set('imageUrl')} /></div>
      <ErrorNote error={error} />
      <div className="flex gap-2">
        <button className="btn-brass flex-1" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}{item.id ? 'Save dish' : 'Add dish'}</button>
        {item.id && (
          <button
            type="button"
            className="btn-outline text-ember"
            onClick={async () => {
              if (!confirm(`Remove ${item.name} from the menu? Past orders keep it.`)) return;
              await api(`/menu/items/${item.id}`, { as: 'staff', method: 'DELETE' }).catch((e) => setError(e.message));
              onDone();
            }}
          >
            <Trash2 className="h-4 w-4" /> Remove
          </button>
        )}
      </div>
    </form>
  );
}

function SpecialForm({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  const [f, setF] = useState({ menuItemId: items[0]?.id ?? '', headline: '', note: '', specialPrice: '', minTier: 'MEMBER' as Tier, endsAt: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const item = items.find((i) => i.id === f.menuItemId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/specials', {
        as: 'staff',
        body: {
          menuItemId: f.menuItemId,
          headline: f.headline,
          note: f.note || undefined,
          specialPrice: f.specialPrice ? Number(f.specialPrice) : undefined,
          minTier: f.minTier,
          endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : undefined,
        },
      });
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
      <div>
        <label className="label" htmlFor="s-item">Dish</label>
        <select id="s-item" className="input" value={f.menuItemId} onChange={set('menuItemId')}>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({money(i.price)})</option>)}
        </select>
      </div>
      <div><label className="label" htmlFor="s-head">Headline guests see</label><input id="s-head" className="input" required minLength={2} placeholder="Tonight: line-caught snapper" value={f.headline} onChange={set('headline')} /></div>
      <div><label className="label" htmlFor="s-note">Short description</label><input id="s-note" className="input" value={f.note} onChange={set('note')} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="s-price">Special price</label>
          <input id="s-price" className="input" inputMode="decimal" placeholder={item ? `Normally ${money(item.price)}` : ''} value={f.specialPrice} onChange={set('specialPrice')} />
        </div>
        <div>
          <label className="label" htmlFor="s-tier">Who can order it</label>
          <select id="s-tier" className="input" value={f.minTier} onChange={set('minTier')}>
            <option value="MEMBER">Everyone</option>
            <option value="SILVER">{TIER_LABEL.SILVER} and Gold</option>
            <option value="GOLD">{TIER_LABEL.GOLD} only</option>
          </select>
        </div>
      </div>
      <div><label className="label" htmlFor="s-end">Ends (optional)</label><input id="s-end" type="datetime-local" className="input" value={f.endsAt} onChange={set('endsAt')} /></div>
      <ErrorNote error={error} />
      <button className="btn-brass w-full" disabled={busy}>{busy && <Spinner className="h-4 w-4" />}Publish special</button>
    </form>
  );
}
