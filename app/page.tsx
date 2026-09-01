import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';

export default async function RootPage() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          return;
        },
      },
    },
  );

  // getSession() rather than getUser(): middleware skips the root path, and this page
  // only picks a redirect target. RLS still validates the JWT on the query below, and
  // every destination re-checks auth on arrival.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const { data: user } = await supabase
    .from('users')
    .select('onboarding_complete')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!user) {
    redirect('/projects');
  }

  redirect(user.onboarding_complete ? '/home' : '/pending');
}
