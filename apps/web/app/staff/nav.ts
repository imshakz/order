import { BarChart3, BookOpen, ChefHat, ClipboardList, LayoutGrid, LucideIcon, Settings2, Users } from 'lucide-react';
import type { StaffRole } from '@/lib/types';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: StaffRole[];
  feature?: string;
}

/** Managers see everything; other roles see what their job needs. */
export const NAV: NavItem[] = [
  { href: '/staff/manager', label: 'Overview', icon: BarChart3, roles: ['MANAGER'], feature: 'stats' },
  { href: '/staff/floor', label: 'Floor', icon: LayoutGrid, roles: ['MANAGER', 'HOST', 'SERVER'], feature: 'tables' },
  { href: '/staff/kitchen', label: 'Kitchen', icon: ChefHat, roles: ['MANAGER', 'KITCHEN', 'SERVER'], feature: 'kitchen' },
  { href: '/staff/manager/orders', label: 'Orders', icon: ClipboardList, roles: ['MANAGER', 'HOST', 'SERVER'], feature: 'orders' },
  { href: '/staff/manager/customers', label: 'Customers', icon: Users, roles: ['MANAGER', 'HOST', 'SERVER'] },
  { href: '/staff/manager/menu', label: 'Menu', icon: BookOpen, roles: ['MANAGER', 'KITCHEN'], feature: 'menu' },
  { href: '/staff/manager/setup', label: 'Setup', icon: Settings2, roles: ['MANAGER'] },
];

export function homeFor(role: StaffRole) {
  if (role === 'MANAGER') return '/staff/manager';
  if (role === 'KITCHEN') return '/staff/kitchen';
  return '/staff/floor';
}
