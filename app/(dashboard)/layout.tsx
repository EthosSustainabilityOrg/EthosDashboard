import type * as React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { FullSidebarClient } from '@/components/layout/FullSidebarClient';

type DashboardLayoutProps = {
  children: React.ReactNode;
};

type CurrentUser = {
  first_name: string;
  last_name: string;
  org_role_id: number;
};

type CookieToSet = {
  name: string;
  value: string;
  options?: object;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    },
  );

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();
  if (!authUser || authError) {
    redirect('/login');
  }

  const { data } = await supabase
    .from('users')
    .select('first_name, last_name, org_role_id')
    .eq('user_id', authUser.id)
    .single();

  const user = data as CurrentUser | null;
  const orgRoleId = user?.org_role_id === 2 || user?.org_role_id === 3 ? user.org_role_id : 1;

  const unresolvedLogResult =
    orgRoleId === 3
      ? await supabase
          .from('system_logs')
          .select('*', { count: 'exact', head: true })
          .eq('resolved', false)
      : { count: 0 };

  const unresolvedLogCount = unresolvedLogResult.count ?? 0;

  return (
    <FullSidebarClient
      firstName={user?.first_name ?? 'Ethos'}
      lastName={user?.last_name ?? 'Member'}
      orgRoleId={orgRoleId}
      unresolvedLogCount={unresolvedLogCount}
    >
      {children}
    </FullSidebarClient>
  );
}
