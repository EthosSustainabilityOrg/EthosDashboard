import type * as React from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { BoardSectionNav } from '@/components/board/BoardSectionNav';

type BoardLayoutProps = {
  children: React.ReactNode;
};

type CookieToSet = {
  name: string;
  value: string;
  options?: object;
};

export default async function BoardLayout({ children }: BoardLayoutProps) {
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

  const { data: boardUser } = await supabase
    .from('users')
    .select('org_role_id')
    .eq('user_id', authUser.id)
    .single();

  if (boardUser?.org_role_id !== 3) {
    redirect('/home');
  }

  const { count } = await supabase
    .from('system_logs')
    .select('*', { count: 'exact', head: true })
    .eq('resolved', false);

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-espresso">Board Panel</h1>
        <div className="mt-5">
          <BoardSectionNav unresolvedLogCount={count ?? 0} />
        </div>
      </header>

      {children}
    </div>
  );
}
