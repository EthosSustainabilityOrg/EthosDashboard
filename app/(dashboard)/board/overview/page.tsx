import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { ChapterMetricsTable } from '@/components/board/ChapterMetricsTable';
import { OrgOverviewMetrics } from '@/components/board/OrgOverviewMetrics';

type ChapterRow = {
  chapter_id: string;
  name: string;
  is_hq: boolean;
};

type ProjectRow = {
  project_id: string;
  chapter_id: string;
  project_type_id: number;
  is_published: boolean;
  closed_at: string | null;
  allocated_budget: number | null;
  created_at: string;
};

type UserRow = {
  user_id: string;
  chapter_id: string | null;
};

type ApplicationRow = {
  application_id: string;
  project_id: string;
  status: string;
};

type ShiftProjectRow = {
  project_id: string;
};

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function startOfNextMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
}

function sumAllocatedBudget(projects: ProjectRow[]) {
  return projects.reduce((total, project) => total + (project.allocated_budget ?? 0), 0);
}

export default async function BoardOverviewPage() {
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

  const currentMonthStart = startOfCurrentMonth();
  const nextMonthStart = startOfNextMonth();

  const [chaptersResult, projectsResult, usersResult, applicationsResult, eventShiftsResult] = await Promise.all([
    supabase.from('chapters').select('chapter_id, name, is_hq'),
    supabase
      .from('projects')
      .select('project_id, chapter_id, project_type_id, is_published, closed_at, allocated_budget, created_at'),
    supabase.from('users').select('user_id, chapter_id'),
    supabase.from('applications').select('application_id, project_id, status'),
    supabase
      .from('shifts')
      .select('project_id, projects!inner(project_type_id)')
      .eq('projects.project_type_id', 1)
      .gte('start_datetime', currentMonthStart)
      .lt('start_datetime', nextMonthStart),
  ]);

  const chapters = (chaptersResult.data ?? []) as ChapterRow[];
  const projects = (projectsResult.data ?? []) as ProjectRow[];
  const users = (usersResult.data ?? []) as UserRow[];
  const applications = (applicationsResult.data ?? []) as ApplicationRow[];
  const eventShiftsThisMonth = (eventShiftsResult.data ?? []) as ShiftProjectRow[];

  const activeProjects = projects.filter((project) => project.is_published && project.closed_at === null);
  const activeProjectIds = new Set(activeProjects.map((project) => project.project_id));
  const eventsThisMonthCount = new Set(
    eventShiftsThisMonth
      .map((shift) => shift.project_id)
      .filter((projectId) => activeProjectIds.has(projectId)),
  ).size;

  const chapterMetrics = chapters.map((chapter) => {
    const chapterProjects = projects.filter((project) => project.chapter_id === chapter.chapter_id);
    const chapterProjectIds = new Set(chapterProjects.map((project) => project.project_id));

    return {
      chapter_id: chapter.chapter_id,
      name: chapter.name,
      is_hq: chapter.is_hq,
      activeProjectCount: chapterProjects.filter(
        (project) => project.is_published && project.closed_at === null,
      ).length,
      memberCount: users.filter((user) => user.chapter_id === chapter.chapter_id).length,
      pendingApplicationCount: applications.filter(
        (application) =>
          application.status === 'Pending' && chapterProjectIds.has(application.project_id),
      ).length,
      allocatedBudget: sumAllocatedBudget(chapterProjects),
    };
  });

  return (
    <div className="space-y-8">
      <OrgOverviewMetrics
        totalProjects={activeProjects.length}
        totalMembers={users.length}
        eventsThisMonth={eventsThisMonthCount}
        totalFundsRaised={sumAllocatedBudget(projects)}
      />

      <ChapterMetricsTable chapters={chapterMetrics} />
    </div>
  );
}
