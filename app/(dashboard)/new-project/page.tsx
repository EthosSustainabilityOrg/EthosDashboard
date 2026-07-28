import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { Chapter } from '@/types/chapters';
import type { ProjectType } from '@/types/projects';
import { CreateProjectWizard } from '@/components/lead/project-wizard/CreateProjectWizard';

type ChapterOption = Pick<Chapter, 'chapter_id' | 'name' | 'is_hq' | 'location'>;

export default async function NewProjectPage() {
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
    error: authError,
  } = await supabase.auth.getUser();

  if (!authUser || authError) {
    redirect('/login');
  }

  const { data: userData } = await supabase
    .from('users')
    .select('org_role_id, chapter_id')
    .eq('user_id', authUser.id)
    .single();

  if (!userData || (userData.org_role_id !== 2 && userData.org_role_id !== 3)) {
    redirect('/home');
  }

  const [{ data: chaptersData }, { data: projectTypesData }] = await Promise.all([
    supabase
      .from('chapters')
      .select('chapter_id, name, is_hq, location')
      .order('name', { ascending: true }),
    supabase
      .from('project_types')
      .select('type_id, type_name')
      .order('type_id', { ascending: true }),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-10">
      <CreateProjectWizard
        chapters={(chaptersData ?? []) as ChapterOption[]}
        projectTypes={(projectTypesData ?? []) as ProjectType[]}
        isBoard={userData.org_role_id === 3}
        currentChapterId={userData.chapter_id ?? ''}
      />
    </div>
  );
}
