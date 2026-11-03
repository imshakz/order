export type Tier = 'MEMBER' | 'SILVER' | 'GOLD';
export type StaffRole = 'MANAGER' | 'HOST' | 'SERVER' | 'KITCHEN';
export type TableStatus = 'AVAILABLE' | 'SEATED' | 'ORDERED' | 'NEEDS_ATTENTION' | 'RESERVED' | 'CLEANING';
export type TableShape = 'ROUND' | 'SQUARE' | 'RECT' | 'BOOTH';
export type OrderStatus = 'PLACED' | 'PREPARING' | 'READY' | 'SERVED' | 'PAID' | 'CANCELLED';
export type ItemStatus = 'QUEUED' | 'COOKING' | 'DONE';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

export interface CustomerUser {
  id: string;
  name: string;
  email: string;
  tier: Tier;
  points: number;
  lifetimePoints: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string | null;
  categoryId: string;
  tags: string[];
  available: boolean;
  prepMinutes: number;
  sortOrder: number;
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  items: MenuItem[];
}

export interface Special {
  id: string;
  headline: string;
  note: string;
  minTier: Tier;
  endsAt?: string | null;
  specialPrice: number | null;
  unlocked: boolean;
  item: MenuItem;
}

export interface Menu {
  viewerTier: Tier;
  specials: Special[];
  categories: Category[];
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes?: string | null;
  status: ItemStatus;
}

export interface Order {
  id: string;
  number: number;
  type: 'DINE_IN' | 'TAKEAWAY';
  status: OrderStatus;
  source: 'CUSTOMER' | 'STAFF';
  tableId?: string | null;
  table?: { id: string; label: string; code: string } | null;
  customer?: { id: string; name: string; tier: Tier; email: string } | null;
  staff?: { id: string; name: string } | null;
  guestName?: string | null;
  notes?: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  total: number;
  pointsRedeemed: number;
  createdAt: string;
  paidAt?: string | null;
  items: OrderItem[];
  payments: { id: string; amount: number; tip: number; method: string; status: string; createdAt: string }[];
}

export interface FloorTable {
  id: string;
  label: string;
  seats: number;
  section: string;
  shape: TableShape;
  posX: number;
  posY: number;
  status: TableStatus;
  code: string;
  guests?: number | null;
  seatedAt?: string | null;
  orders: { id: string; number: number; status: OrderStatus; total: number; createdAt: string; customer?: { name: string; tier: Tier } | null }[];
  reservations: { id: string; name: string; time: string; partySize: number }[];
}

export interface Reservation {
  id: string;
  name: string;
  phone?: string | null;
  partySize: number;
  time: string;
  notes?: string | null;
  status: 'BOOKED' | 'SEATED' | 'CANCELLED' | 'NO_SHOW';
  table?: { id: string; label: string } | null;
  customer?: { id: string; tier: Tier } | null;
}

export interface TierRule {
  tier: Tier;
  minLifetimePoints: number;
  discountPercent: number;
  pointsMultiplier: number;
  perks: string[];
  color: string;
}

export interface Settings {
  name: string;
  currency: string;
  taxRate: number;
  taxInclusive: boolean;
  timezone: string;
  features: string[];
}
