'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { getSession } from '@/lib/api';
import type { StaffUser } from '@/lib/types';
import { homeFor } from './nav';

export default function StaffHome() {
  const router = useRouter();
  useEffect(() => {
    const s = getSession<StaffUser>('staff');
    router.replace(s ? homeFor(s.user.role) : '/staff/login');
  }, [router]);
  return null;
}
