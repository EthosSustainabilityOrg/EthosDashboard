import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { Project } from '@/types/projects';
import type { Shift } from '@/types/shifts';
import type { Task } from '@/types/tasks';
import { LeadProjectCard } from '@/components/lead/LeadProjectCard';
import { Button } from '@/components/ui/Button';

type ChapterRow = {
  chapter_id: string;
  is_hq: boolean;
};

type ProjectCardData = {
  project: Project;
  pendingCount: number;
  taskProgress: {
    complete: number;
    total: number;
  };
  upcomingShift: Pick<Shift, 'start_datetime'> | null;
  isHq: boolean;
};

function statusRank(project: Project) {
  if (project.closed_at !== null) return 3;
  if (project.is_published) return 1;
  return 2;
}

function sortProjectCards(a: ProjectCardData, b: ProjectCardData) {
  const statusDelta = statusRank(a.project) - statusRank(b.project);
  if (statusDelta !== 0) return statusDelta;

  if (!a.upcomingShift && !b.upcomingShift) return 0;
  if (!a.upcomingShift) return 1;
  if (!b.upcomingShift) return -1;

  return a.upcomingShift.start_datetime.localeCompare(b.upcomingShift.start_datetime);
}

export default async function LeadProjectsPage() {
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
    .select('org_role_id')
    .eq('user_id', authUser.id)
    .single();

  if (!userData || (userData.org_role_id !== 2 && userData.org_role_id !== 3)) {
    redirect('/home');
  }

  const { data: projectsData } = await supabase
    .from('projects')
    .select('*')
    .eq('created_by', authUser.id);

  const projects = (projectsData ?? []) as Project[];

  const { data: chaptersData } = await supabase
    .from('chapters')
    .select('chapter_id, is_hq');

  const hqChapterIds = new Set(
    ((chaptersData ?? []) as ChapterRow[])
      .filter((chapter) => chapter.is_hq)
      .map((chapter) => chapter.chapter_id),
  );

  const cards = await Promise.all(
    projects.map(async (project) => {
      const [{ count: pendingCount }, { data: tasksData }, { data: upcomingShiftData }] =
        await Promise.all([
          supabase
            .from('applications')
            .select('application_id', { count: 'exact', head: true })
            .eq('project_id', project.project_id)
            .eq('status', 'Pending'),
          supabase
            .from('tasks')
            .select('*')
            .eq('project_id', project.project_id),
          supabase
            .from('shifts')
            .select('start_datetime')
            .eq('project_id', project.project_id)
            .gt('start_datetime', new Date().toISOString())
            .order('start_datetime', { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);

      const tasks = (tasksData ?? []) as Task[];

      return {
        project,
        pendingCount: pendingCount ?? 0,
        taskProgress: {
          complete: tasks.filter((task) => task.status === 'Complete').length,
          total: tasks.length,
        },
        upcomingShift: upcomingShiftData as Pick<Shift, 'start_datetime'> | null,
        isHq: hqChapterIds.has(project.chapter_id),
      };
    }),
  );

  const sortedCards = cards.sort(sortProjectCards);

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-espresso">My Projects</h1>
          <p className="mt-2 text-sm text-warm-gray">
            Manage drafts, applications, tasks, and project teams.
          </p>
        </div>

        <Link href="/new-project">
          <Button variant="primary">New Project</Button>
        </Link>
      </header>

      {sortedCards.length > 0 ? (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sortedCards.map((card) => (
            <LeadProjectCard
              key={card.project.project_id}
              project={card.project}
              pendingCount={card.pendingCount}
              taskProgress={card.taskProgress}
              upcomingShift={card.upcomingShift}
              isHq={card.isHq}
              applicationsUrl={`/projects/${card.project.project_id}/applications`}
            />
          ))}
        </section>
      ) : (
        <div className="rounded-xl border border-sand bg-cream p-8 text-center">
          <p className="text-sm text-warm-gray">
            You haven't created any projects yet.
          </p>
          <Link href="/new-project" className="mt-5 inline-block">
            <Button variant="primary">New Project</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
