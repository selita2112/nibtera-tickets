
'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Button } from './ui/button';
import { UserNav } from './user-nav';
import { Skeleton } from './ui/skeleton';
import { usePathname } from 'next/navigation';

export function AuthStatus() {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();

  // This component is no longer needed on the main page,
  // as the logic is now handled directly in page.tsx.
  // It is also not needed on dashboard pages.
  // Returning null to prevent it from rendering anywhere.
  return null;
}

    