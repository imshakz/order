'use client';

import clsx from 'clsx';
import { LogOut } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import useSWR from 'swr';
import { Spinner } from '@/components/ui';
import { api, setSession } from '@/lib/api';
import { RESTAURANT_NAME } from '@/lib/config';
import { useSession } from '@/lib/hooks';
import type { Settings, StaffUser } from '@/lib/types';
import { NAV } from './nav';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, ready } = useSession<StaffUser>('staff');
  const { data: settings } = useSWR<Settings>('/settings', (p: string) => api(p));
  const isLogin = pathname === '/staff/login';

  useEffect(() => {
    if (ready && !session && !isLogin) router.replace('/staff/login');
  }, [ready, session, isLogin, router]);

  if (isLogin) return <>{children}</>;
  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-forest-950 text-stone-300">
        <Spinner />
      </div>
    );
  }

  const role = session.user.role;
  const items = NAV.filter((n) => n.roles.includes(role) && (!n.feature || !settings || settings.features.includes(n.feature)));
  const initials = session.user.name.split(' ').map((w) => w[0]).join('').slice(0, 2);
  const brand = RESTAURANT_NAME.split('&').map((s) => s.trim()[0]).join('&');

  return (
    <div className="staff flex min-h-screen bg-forest-950 text-stone-100">
      <aside className="sticky top-0 hidden h-screen w-20 shrink-0 flex-col items-center gap-2 border-r border-forest-800 py-5 md:flex">
        <Link href="/staff" className="mb-4 font-display text-lg font-extrabold text-brass" aria-label={RESTAURANT_NAME}>
          {brand}
        </Link>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Staff">
          {items.map((n) => {
            const active = n.href === '/staff/manager' ? pathname === n.href : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-medium transition-colors',
                  active ? 'bg-forest-800 text-brass-light' : 'text-stone-400 hover:bg-forest-900 hover:text-stone-200',
                )}
              >
                <n.icon className="h-5 w-5" aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-700 text-sm font-semibold"
          title={`${session.user.name} (${role.toLowerCase()})`}
        >
          {initials}
        </div>
        <button className="btn-ghost p-2 text-stone-400" onClick={() => setSession('staff', null)} aria-label="Sign out">
          <LogOut className="h-5 w-5" />
        </button>
      </aside>

      {/* Phone / tablet-portrait navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex justify-around border-t border-forest-800 bg-forest-950/95 py-2 backdrop-blur md:hidden" aria-label="Staff">
        {items.slice(0, 5).map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={clsx('flex flex-col items-center gap-0.5 px-2 text-[10px]', pathname.startsWith(n.href) ? 'text-brass-light' : 'text-stone-400')}
          >
            <n.icon className="h-5 w-5" aria-hidden />
            {n.label}
          </Link>
        ))}
      </nav>

      <div className="min-w-0 flex-1 pb-20 md:pb-0">{children}</div>
    </div>
  );
}
