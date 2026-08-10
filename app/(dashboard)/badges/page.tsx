import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { Badge } from '@/types/badges';
import { BadgeManagement } from '@/components/board/badges/BadgeManagement';

type BadgeRow = Badge & {
  projects:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

type ProjectOption = {
  project_id: string;
  name: string;
};

function getProjectName(badge: BadgeRow) {
  const project = Array.isArray(badge.projects) ? badge.projects[0] : badge.projects;
  return project?.name ?? null;
}

export default async function BadgesPage() {
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
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const { data: viewerData } = await supabase
    .from('users')
    .select('org_role_id')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (viewerData?.org_role_id !== 3) {
    redirect('/home');
  }

  const [badgesResult, projectsResult] = await Promise.all([
    supabase
      .from('badges')
      .select('*, projects(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('projects')
      .select('project_id, name')
      .order('name', { ascending: true }),
  ]);

  const badges = ((badgesResult.data ?? []) as BadgeRow[]).map((badge) => ({
    badge_id: badge.badge_id,
    badge_category: badge.badge_category,
    project_id: badge.project_id,
    project_name: getProjectName(badge),
    name: badge.name,
    description: badge.description,
    image_url: badge.image_url,
    created_by: badge.created_by,
    created_at: badge.created_at,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <BadgeManagement
        badges={badges}
        projects={(projectsResult.data ?? []) as ProjectOption[]}
      />
    </div>
  );
}
