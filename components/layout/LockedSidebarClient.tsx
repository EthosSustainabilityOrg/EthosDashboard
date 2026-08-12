'use client';

import type * as React from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { LockedSidebarLayout } from './LockedSidebarLayout';

type LockedSidebarClientProps = {
  children: React.ReactNode;
  firstName: string;
  lastName: string;
};

export function LockedSidebarClient({
  children,
  firstName,
  lastName,
}: LockedSidebarClientProps) {
  const router = useRouter();

  return (
    <LockedSidebarLayout
      user={{ firstName, lastName }}
      avatarAriaLabel="Sign out"
      onAvatarClick={async () => {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        );
        await supabase.auth.signOut();
        router.push('/login');
      }}
    >
      {children}
    </LockedSidebarLayout>
  );
}
