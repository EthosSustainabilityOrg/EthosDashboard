import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { DirectoryPageClient } from '@/components/directory/DirectoryPageClient';

export default async function DirectoryPage() {
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

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/login');
  }

  const { data: viewerData } = await supabase
    .from('users')
    .select('org_role_id')
    .eq('user_id', authUser.id)
    .maybeSingle();

  const isBoard = viewerData?.org_role_id === 3;

  return <DirectoryPageClient isBoard={isBoard} />;
}
