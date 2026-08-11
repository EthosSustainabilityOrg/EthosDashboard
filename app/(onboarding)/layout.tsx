import type * as React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { LockedSidebarClient } from '@/components/layout/LockedSidebarClient';

type OnboardingLayoutProps = {
  children: React.ReactNode;
};

type CookieToSet = {
  name: string;
  value: string;
  options?: object;
};

function deriveDisplayName(authUser: User): { firstName: string; lastName: string } {
  const metadata = authUser.user_metadata ?? {};

  const givenName = typeof metadata.given_name === 'string' ? metadata.given_name : null;
  const familyName = typeof metadata.family_name === 'string' ? metadata.family_name : null;

  if (givenName) {
    return { firstName: givenName, lastName: familyName ?? '' };
  }

  const fullName =
    typeof metadata.full_name === 'string'
      ? metadata.full_name
      : typeof metadata.name === 'string'
        ? metadata.name
        : null;

  if (fullName) {
    const [firstName, ...rest] = fullName.trim().split(/\s+/);
    return { firstName: firstName || 'Ethos', lastName: rest.join(' ') };
  }

  return { firstName: authUser.email ?? 'Ethos', lastName: '' };
}

export default async function OnboardingLayout({ children }: OnboardingLayoutProps) {
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
    error,
  } = await supabase.auth.getUser();

  if (!authUser || error) {
    redirect('/login');
  }

  const { data: user } = await supabase
    .from('users')
    .select('first_name, last_name')
    .eq('user_id', authUser.id)
    .maybeSingle();

  // authUser exists (Supabase Auth record + valid session) but no users row yet
  // happens for brand-new Google sign-ins — the users row isn't created until
  // their first application (POST /api/applications). Render the locked sidebar
  // using their Google profile instead of redirecting to /login.
  const displayName = user
    ? { firstName: user.first_name, lastName: user.last_name }
    : deriveDisplayName(authUser);

  return (
    <LockedSidebarClient
      firstName={displayName.firstName}
      lastName={displayName.lastName}
    >
      {children}
    </LockedSidebarClient>
  );
}
