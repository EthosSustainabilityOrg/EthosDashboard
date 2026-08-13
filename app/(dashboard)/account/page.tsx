'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

type AccountUser = {
  user_id: string;
  first_name: string;
  last_name: string;
  active_login_email: string;
  org_role_id: 1 | 2 | 3;
  org_role_name?: string;
  chapter_name?: string;
  created_at: string;
};

function roleLabel(roleId: AccountUser['org_role_id'], roleName?: string) {
  if (roleName) return roleName;
  if (roleId === 3) return 'Board';
  if (roleId === 2) return 'Project Lead';
  return 'Member';
}

function roleVariant(roleId: AccountUser['org_role_id']) {
  if (roleId === 3) return 'peach';
  if (roleId === 2) return 'info';
  return 'neutral';
}

function formatMemberSince(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(date));
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  useEffect(() => {
    async function getAuthHeaders() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      return {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };
    }

    async function loadUser() {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/users/me', { headers });
      const body = (await response.json()) as ApiResponse<AccountUser>;

      setUser(body.data ?? null);
      setIsLoading(false);
    }

    void loadUser();
  }, [supabase]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-8 py-10">
        <p className="text-sm text-warm-gray">Loading...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      <h1 className="text-3xl font-bold text-espresso">Account</h1>

      <div className="mt-8 rounded-xl border border-sand bg-cream p-6">
        {user ? (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-warm-gray">Full name</p>
              <p className="mt-1 text-lg font-semibold text-espresso">
                {user.first_name} {user.last_name}
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-warm-gray">Email</p>
              <p className="mt-1 text-espresso">{user.active_login_email}</p>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-warm-gray">Role</p>
              <Badge label={roleLabel(user.org_role_id, user.org_role_name)} variant={roleVariant(user.org_role_id)} />
            </div>

            <div>
              <p className="text-sm font-semibold text-warm-gray">Chapter</p>
              <p className="mt-1 text-espresso">{user.chapter_name ?? 'Not assigned'}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-warm-gray">Member since</p>
              <p className="mt-1 text-espresso">{formatMemberSince(user.created_at)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-warm-gray">Account information could not be loaded.</p>
        )}

        <div className="mt-8 border-t border-sand pt-6">
          <Button variant="secondary" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </div>
    </div>
  );
}
