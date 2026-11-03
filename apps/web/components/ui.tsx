'use client';

import clsx from 'clsx';
import { Crown, Loader2, X } from 'lucide-react';
import { ReactNode, useEffect } from 'react';
import { ORDER_STATUS, TIER_LABEL } from '@/lib/format';
import type { OrderStatus, Tier } from '@/lib/types';

/** Wordmark: the ampersand carries the brass. */
export function Logo({ name, className }: { name: string; className?: string }) {
  const [a, b] = name.split('&').map((s) => s.trim());
  return (
    <span className={clsx('font-display text-xl font-bold tracking-tight', className)}>
      {b ? (
        <>
          {a} <span className="text-brass">&amp;</span> {b}
        </>
      ) : (
        name
      )}
    </span>
  );
}

const TIER_CLS: Record<Tier, string> = {
  MEMBER: 'bg-stone-200 text-stone-700',
  SILVER: 'bg-gradient-to-br from-slate-100 to-slate-300 text-slate-700 ring-1 ring-slate-300',
  GOLD: 'bg-gradient-to-br from-amber-200 to-tier-gold text-amber-950 ring-1 ring-amber-400',
};

export function TierBadge({ tier, size = 'sm' }: { tier: Tier; size?: 'sm' | 'md' }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
        TIER_CLS[tier],
      )}
    >
      {tier !== 'MEMBER' && <Crown className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />}
      {TIER_LABEL[tier]}
    </span>
  );
}

export function StatusPill({ status }: { status: OrderStatus }) {
  const s = ORDER_STATUS[status];
  return <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', s.cls)}>{s.label}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin', className)} aria-label="Loading" />;
}

/** Side drawer on desktop, bottom sheet on mobile. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  dark,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  dark?: boolean;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Close" />
      <div
        className={clsx(
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:max-h-none sm:rounded-none sm:animate-slideIn',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
          dark ? 'staff border-l border-forest-700 bg-forest-950 text-stone-100' : 'bg-white text-ink',
        )}
      >
        <div className={clsx('flex items-center justify-between gap-3 border-b px-5 py-4', dark ? 'border-forest-700' : 'border-stone-200')}>
          <div className="min-w-0 flex-1 font-display text-lg font-semibold">{title}</div>
          <button className="btn-ghost -mr-2 p-2" onClick={onClose} aria-label="Close panel">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 opacity-60">{icon}</div>}
      <p className="font-display text-base font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm opacity-70">{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error?: string | null }) {
  if (!error) return null;
  return <p className="rounded-xl bg-ember/10 px-3 py-2 text-sm text-ember" role="alert">{error}</p>;
}

/** Placeholder art for dishes without a photo: initials on a tone picked from the name. */
export function DishArt({ name, className }: { name: string; className?: string }) {
  const tones = ['from-forest-700 to-forest-500', 'from-brass-dark to-brass', 'from-stone-600 to-stone-400', 'from-forest-800 to-brass-dark'];
  const tone = tones[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % tones.length];
  const initials = name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return (
    <div className={clsx('flex items-center justify-center bg-gradient-to-br font-display font-bold text-white/90', tone, className)} aria-hidden>
      {initials}
    </div>
  );
}
