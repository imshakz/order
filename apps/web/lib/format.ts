import type { OrderStatus, TableStatus, Tier } from './types';

const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
export const money = (n: number | string | null | undefined) => currency.format(Number(n ?? 0));

export function minutesSince(iso?: string | null) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function ago(iso?: string | null) {
  if (!iso) return '';
  const m = minutesSince(iso);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export const TIER_LABEL: Record<Tier, string> = { MEMBER: 'Member', SILVER: 'Silver', GOLD: 'Gold' };

export const TABLE_STATUS: Record<TableStatus, { label: string; color: string; text: string }> = {
  AVAILABLE: { label: 'Available', color: 'bg-status-available', text: 'text-status-available' },
  SEATED: { label: 'Seated', color: 'bg-status-seated', text: 'text-status-seated' },
  ORDERED: { label: 'Ordered', color: 'bg-status-ordered', text: 'text-status-ordered' },
  NEEDS_ATTENTION: { label: 'Food ready', color: 'bg-status-attention', text: 'text-status-attention' },
  RESERVED: { label: 'Reserved', color: 'bg-status-reserved', text: 'text-status-reserved' },
  CLEANING: { label: 'Needs reset', color: 'bg-status-cleaning', text: 'text-stone-400' },
};

export const ORDER_STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  PLACED: { label: 'Sent to kitchen', cls: 'bg-stone-200 text-stone-700' },
  PREPARING: { label: 'Cooking', cls: 'bg-brass/20 text-brass-dark' },
  READY: { label: 'Ready to serve', cls: 'bg-ember/15 text-ember' },
  SERVED: { label: 'Served', cls: 'bg-status-seated/15 text-status-seated' },
  PAID: { label: 'Paid', cls: 'bg-status-available/15 text-status-available' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-stone-200 text-stone-500 line-through' },
};
