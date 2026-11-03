'use client';

import clsx from 'clsx';
import { Lock, Minus, Plus, ShoppingBag, Sparkles, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { AuthForm } from '@/components/AuthForm';
import { DishArt, Empty, ErrorNote, Logo, Sheet, Spinner, TierBadge } from '@/components/ui';
import { api, customerFetcher } from '@/lib/api';
import { RESTAURANT_NAME } from '@/lib/config';
import { money, TIER_LABEL } from '@/lib/format';
import { useSession } from '@/lib/hooks';
import type { CustomerUser, Menu, MenuItem, Order } from '@/lib/types';

interface CartLine {
  item: MenuItem;
  unitPrice: number;
  quantity: number;
  notes?: string;
}

const activeKey = (code: string) => `eo.activeOrder.${code}`;

export default function TableOrdering() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { session } = useSession<CustomerUser>('customer');
  const signedIn = !!session;

  const { data: table, error: tableError } = useSWR<{ id: string; label: string }>(`/tables/code/${code}`, (p: string) => api(p));
  const { data: menu, mutate: reloadMenu } = useSWR<Menu>(['/menu', session?.token ?? 'guest'], ([p]: [string, string]) => customerFetcher(p));
  const { data: loyalty } = useSWR(signedIn ? '/loyalty/me' : null, customerFetcher, { shouldRetryOnError: false });

  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  // If this device already has an open order at this table, new items get added to it.
  useEffect(() => {
    let id: string | null = null;
    try {
      id = localStorage.getItem(activeKey(code));
    } catch {}
    if (!id) return;
    api<Order>(`/orders/${id}`)
      .then((o) => {
        if (o.status === 'PAID' || o.status === 'CANCELLED') localStorage.removeItem(activeKey(code));
        else setActiveOrder(o);
      })
      .catch(() => {});
  }, [code]);

  useEffect(() => {
    reloadMenu();
  }, [session?.token, reloadMenu]);

  const priceFor = (item: MenuItem) => {
    const sp = menu?.specials.find((s) => s.item.id === item.id && s.unlocked && s.specialPrice != null);
    return sp ? Math.min(item.price, sp.specialPrice!) : item.price;
  };

  const add = (item: MenuItem, delta: number) =>
    setCart((c) => {
      const line = c[item.id] ?? { item, unitPrice: priceFor(item), quantity: 0 };
      const quantity = line.quantity + delta;
      const next = { ...c };
      if (quantity <= 0) delete next[item.id];
      else next[item.id] = { ...line, quantity };
      return next;
    });

  const lines = Object.values(cart);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  const sections = useRef<Record<string, HTMLElement | null>>({});
  useEffect(() => {
    if (!menu) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveCat(top.target.id);
      },
      { rootMargin: '-120px 0px -60% 0px' },
    );
    Object.values(sections.current).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [menu]);

  if (tableError) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Empty title="We couldn't find this table">Ask a member of staff for help, or scan the code on your table again.</Empty>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl pb-32">
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <Logo name={RESTAURANT_NAME} className="text-lg" />
            <p className="text-xs text-stone-500">{table ? `Table ${table.label}` : 'Finding your table…'}</p>
          </div>
          {session ? (
            <Link href="/account" className="flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 text-sm shadow-sm ring-1 ring-stone-200">
              <TierBadge tier={session.user.tier} />
              <span className="font-semibold">{loyalty?.points ?? session.user.points} pts</span>
            </Link>
          ) : (
            <button className="btn-outline py-2" onClick={() => setAuthOpen(true)}>
              <UserRound className="h-4 w-4" /> Earn points
            </button>
          )}
        </div>
        {menu && (
          <nav className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]" aria-label="Menu sections">
            {menu.specials.length > 0 && <CatChip id="specials" label="Chef's specials" active={activeCat === 'specials'} />}
            {menu.categories.filter((c) => c.items.length).map((c) => (
              <CatChip key={c.id} id={c.id} label={c.name} active={activeCat === c.id} />
            ))}
          </nav>
        )}
      </header>

      {activeOrder && (
        <Link
          href={`/order/${activeOrder.id}`}
          className="mx-4 mt-4 flex items-center justify-between rounded-xl bg-forest-800 px-4 py-3 text-sm text-stone-50"
        >
          <span>Order #{activeOrder.number} is open. Anything you add now joins it.</span>
          <span className="font-semibold text-brass-light">Track</span>
        </Link>
      )}

      {!menu ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          {menu.specials.length > 0 && (
            <section id="specials" ref={(el) => { sections.current.specials = el; }} className="scroll-mt-32 px-4 pt-6">
              <h2 className="mb-3 flex items-center gap-2 text-xl font-bold">
                <Sparkles className="h-5 w-5 text-brass" aria-hidden /> Chef&apos;s specials
              </h2>
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
                {menu.specials.map((s) => (
                  <article
                    key={s.id}
                    className={clsx(
                      'relative w-72 shrink-0 snap-start overflow-hidden rounded-2xl p-5 text-stone-50',
                      s.minTier === 'GOLD' ? 'bg-gradient-to-br from-forest-900 via-forest-800 to-brass-dark' : 'bg-forest-800',
                    )}
                  >
                    {s.minTier !== 'MEMBER' && (
                      <span className="absolute right-4 top-4"><TierBadge tier={s.minTier} /></span>
                    )}
                    <p className="pr-16 font-display text-lg font-semibold leading-tight">{s.headline}</p>
                    <p className="mt-1 text-sm text-stone-300">{s.note || s.item.description}</p>
                    <div className="mt-5 flex items-end justify-between">
                      <div>
                        <p className="text-xs text-stone-400">{s.item.name}</p>
                        <p className="font-semibold">
                          {s.specialPrice != null && s.specialPrice < s.item.price ? (
                            <>
                              <span className="mr-2 text-stone-400 line-through">{money(s.item.price)}</span>
                              <span className="text-brass-light">{money(s.specialPrice)}</span>
                            </>
                          ) : (
                            money(s.item.price)
                          )}
                        </p>
                      </div>
                      {s.unlocked ? (
                        <button className="btn-brass px-3 py-2" onClick={() => add(s.item, 1)} aria-label={`Add ${s.item.name}`}>
                          <Plus className="h-4 w-4" /> Add
                        </button>
                      ) : (
                        <button className="btn border border-white/20 px-3 py-2 text-xs text-stone-200" onClick={() => setAuthOpen(true)}>
                          <Lock className="h-3.5 w-3.5" /> {TIER_LABEL[s.minTier]} only
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {menu.categories.filter((c) => c.items.length).map((c) => (
            <section key={c.id} id={c.id} ref={(el) => { sections.current[c.id] = el; }} className="scroll-mt-32 px-4 pt-8">
              <h2 className="mb-2 text-xl font-bold">{c.name}</h2>
              <ul className="divide-y divide-stone-200">
                {c.items.map((item) => {
                  const q = cart[item.id]?.quantity ?? 0;
                  const price = priceFor(item);
                  return (
                    <li key={item.id} className="flex gap-4 py-4">
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                      ) : (
                        <DishArt name={item.name} className="h-20 w-20 shrink-0 rounded-xl text-lg" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{item.name}</p>
                        <p className="mt-0.5 line-clamp-2 text-sm text-stone-600">{item.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="mr-1 font-semibold">{money(price)}</span>
                          {price < item.price && <span className="text-xs text-stone-400 line-through">{money(item.price)}</span>}
                          {item.tags.map((t) => (
                            <span key={t} className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">{t}</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center self-center">
                        {q === 0 ? (
                          <button className="btn-outline h-10 w-10 p-0" onClick={() => add(item, 1)} aria-label={`Add ${item.name}`}>
                            <Plus className="h-4 w-4" />
                          </button>
                        ) : (
                          <Stepper q={q} onMinus={() => add(item, -1)} onPlus={() => add(item, 1)} name={item.name} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-4">
          <button
            className="mx-auto flex w-full max-w-3xl animate-rise items-center justify-between rounded-2xl bg-forest-900 px-5 py-4 text-stone-50 shadow-2xl"
            onClick={() => setCartOpen(true)}
          >
            <span className="flex items-center gap-3">
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-brass px-2 text-sm font-bold text-forest-950">{count}</span>
              <span className="font-semibold">Review order</span>
            </span>
            <span className="font-semibold">{money(subtotal)}</span>
          </button>
        </div>
      )}

      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title={activeOrder ? `Add to order #${activeOrder.number}` : 'Your order'}>
        <Checkout
          lines={lines}
          setNotes={(id, notes) => setCart((c) => ({ ...c, [id]: { ...c[id], notes } }))}
          onStep={(item, d) => add(item, d)}
          tableCode={code}
          activeOrder={activeOrder}
          loyalty={loyalty}
          signedIn={signedIn}
          onSignIn={() => {
            setCartOpen(false);
            setAuthOpen(true);
          }}
          onPlaced={(order) => {
            try {
              localStorage.setItem(activeKey(code), order.id);
            } catch {}
            setCart({});
            router.push(`/order/${order.id}`);
          }}
        />
      </Sheet>

      <Sheet open={authOpen} onClose={() => setAuthOpen(false)} title="Earn points on this order">
        <div className="p-5">
          <AuthForm
            intro="Members save on every order and unlock Silver and Gold perks as they visit."
            onDone={() => setAuthOpen(false)}
          />
        </div>
      </Sheet>
    </main>
  );
}

function CatChip({ id, label, active }: { id: string; label: string; active: boolean }) {
  return (
    <a
      href={`#${id}`}
      className={clsx(
        'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-forest-800 text-stone-50' : 'bg-white text-stone-600 ring-1 ring-stone-200',
      )}
    >
      {label}
    </a>
  );
}

function Stepper({ q, onMinus, onPlus, name }: { q: number; onMinus: () => void; onPlus: () => void; name: string }) {
  return (
    <div className="flex items-center rounded-xl bg-forest-800 text-stone-50">
      <button className="p-2.5" onClick={onMinus} aria-label={`Remove one ${name}`}><Minus className="h-4 w-4" /></button>
      <span className="w-5 text-center text-sm font-bold" aria-live="polite">{q}</span>
      <button className="p-2.5" onClick={onPlus} aria-label={`Add one ${name}`}><Plus className="h-4 w-4" /></button>
    </div>
  );
}

function Checkout({
  lines,
  setNotes,
  onStep,
  tableCode,
  activeOrder,
  loyalty,
  signedIn,
  onSignIn,
  onPlaced,
}: {
  lines: CartLine[];
  setNotes: (id: string, notes: string) => void;
  onStep: (item: MenuItem, d: number) => void;
  tableCode: string;
  activeOrder: Order | null;
  loyalty?: { points: number; pointsValue: number; currentRule?: { discountPercent: number } };
  signedIn: boolean;
  onSignIn: () => void;
  onPlaced: (o: Order) => void;
}) {
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [usePoints, setUsePoints] = useState(false);
  const [notes, setOrderNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const pct = loyalty?.currentRule?.discountPercent ?? 0;
  const tierDiscount = Math.round(subtotal * pct) / 100;
  const pointsDiscount = useMemo(
    () => (usePoints && loyalty ? Math.min(loyalty.pointsValue, subtotal - tierDiscount) : 0),
    [usePoints, loyalty, subtotal, tierDiscount],
  );
  const total = Math.max(0, subtotal - tierDiscount - pointsDiscount);

  const place = async () => {
    setBusy(true);
    setError(null);
    const items = lines.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity, notes: l.notes || undefined }));
    try {
      const order = activeOrder
        ? await api<Order>(`/orders/${activeOrder.id}/items`, { as: 'customer', body: { items } })
        : await api<Order>('/orders', {
            as: 'customer',
            body: {
              items,
              tableCode,
              notes: notes || undefined,
              guestName: signedIn ? undefined : guestName || undefined,
              guestEmail: signedIn ? undefined : guestEmail || undefined,
              redeemPoints: usePoints && loyalty ? Math.round(pointsDiscount / 0.05) : 0,
            },
          });
      onPlaced(order);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!lines.length) return <Empty icon={<ShoppingBag className="h-8 w-8" />} title="Nothing here yet">Add a dish from the menu.</Empty>;

  return (
    <div className="space-y-5 p-5">
      <ul className="space-y-4">
        {lines.map((l) => (
          <li key={l.item.id} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{l.item.name}</p>
                <p className="text-sm text-stone-500">{money(l.unitPrice)} each</p>
              </div>
              <Stepper q={l.quantity} onMinus={() => onStep(l.item, -1)} onPlus={() => onStep(l.item, 1)} name={l.item.name} />
            </div>
            <input
              className="input py-2 text-xs"
              placeholder="Note for the kitchen (optional)"
              value={l.notes ?? ''}
              onChange={(e) => setNotes(l.item.id, e.target.value)}
              aria-label={`Note for ${l.item.name}`}
            />
          </li>
        ))}
      </ul>

      {!activeOrder && (
        <>
          {signedIn ? (
            loyalty && loyalty.points >= 20 && (
              <label className="flex cursor-pointer items-center justify-between rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <span className="text-sm">
                  <span className="font-semibold">Use {loyalty.points} points</span>
                  <span className="block text-stone-600">Worth up to {money(loyalty.pointsValue)}</span>
                </span>
                <input type="checkbox" className="h-5 w-5 accent-forest-700" checked={usePoints} onChange={(e) => setUsePoints(e.target.checked)} />
              </label>
            )
          ) : (
            <div className="space-y-3 rounded-xl bg-stone-100 p-4">
              <p className="text-sm">
                <button className="font-semibold text-forest-700 underline" onClick={onSignIn}>Sign in or join</button> to earn points, or order as a guest.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Name" value={guestName} onChange={(e) => setGuestName(e.target.value)} aria-label="Your name" />
                <input className="input" type="email" placeholder="Email (optional)" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} aria-label="Your email" />
              </div>
            </div>
          )}
          <input className="input" placeholder="Allergies or requests for the whole table" value={notes} onChange={(e) => setOrderNotes(e.target.value)} aria-label="Order notes" />
        </>
      )}

      <dl className="space-y-1.5 border-t border-stone-200 pt-4 text-sm">
        <Row label="Subtotal" value={money(subtotal)} />
        {tierDiscount > 0 && <Row label={`Member discount (${pct}%)`} value={`−${money(tierDiscount)}`} accent />}
        {pointsDiscount > 0 && <Row label="Points" value={`−${money(pointsDiscount)}`} accent />}
        <Row label="Total (incl. GST)" value={money(total)} strong />
      </dl>
      <ErrorNote error={error} />
      <button className="btn-primary w-full py-3.5 text-base" onClick={place} disabled={busy}>
        {busy && <Spinner className="h-4 w-4" />}
        {activeOrder ? 'Add to my order' : 'Send order to kitchen'}
      </button>
      <p className="text-center text-xs text-stone-500">You can pay from your phone or with your server when you&apos;re ready.</p>
    </div>
  );
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className={clsx('flex justify-between', strong && 'pt-1 text-base font-bold', accent && 'text-forest-600')}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
