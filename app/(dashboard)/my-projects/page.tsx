import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Application } from '@/types/applications';
import type { Project } from '@/types/projects';
import type { Task } from '@/types/tasks';
import { MyProjectCard } from '@/components/projects/MyProjectCard';

type ProjectSummary = Project & {
  chapter_name: string;
  type_name: string;
  is_hq?: boolean;
  shifts?: {
    start_datetime: string;
    end_datetime: string;
  }[];
};

type ApprovedApplication = Application & {
  project_name?: string;
  projects?: ProjectSummary | ProjectSummary[] | null;
};

type ApplicationsResponse = {
  applications: ApprovedApplication[];
  total: number;
  page: number;
  per_page: number;
};

type TasksResponse = {
  tasks: Task[];
  total: number;
  page: number;
  per_page: number;
};

type ProjectCardData = {
  project: ProjectSummary;
  taskProgress: {
    complete: number;
    total: number;
  };
  teamCount: number;
  upcomingShift: {
    start_datetime: string;
    end_datetime: string;
  } | null;
};

function getUpcomingShift(project: ProjectSummary) {
  const now = new Date().toISOString();

  return (project.shifts ?? [])
    .filter((shift) => shift.start_datetime > now)
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))[0] ?? null;
}

function sortByUpcomingShift(a: ProjectCardData, b: ProjectCardData) {
  if (!a.upcomingShift && !b.upcomingShift) return 0;
  if (!a.upcomingShift) return 1;
  if (!b.upcomingShift) return -1;
  return a.upcomingShift.start_datetime.localeCompare(b.upcomingShift.start_datetime);
}

export default async function MyProjectsPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();

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

  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';
  const host = headerStore.get('host');

  if (!host) {
    redirect('/home');
  }

  const applicationsResponse = await fetch(
    `${protocol}://${host}/api/applications?status=Approved&per_page=50`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      cache: 'no-store',
    },
  );

  const applicationsBody =
    (await applicationsResponse.json()) as ApiResponse<ApplicationsResponse>;

  const applications = applicationsBody.data?.applications ?? [];
  const projectIds = [...new Set(applications.map((application) => application.project_id))];

  if (projectIds.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-espresso">My Projects</h1>
          <p className="mt-2 text-sm text-warm-gray">0 active projects</p>
        </header>

        <div className="rounded-xl border border-sand bg-cream p-8 text-center">
          <p className="text-sm text-warm-gray">
            You're not on any projects yet.{' '}
            <Link href="/open-calls" className="font-semibold text-espresso underline">
              Browse the project board.
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const projectResponses = await Promise.all(
    projectIds.map((projectId) =>
      fetch(`${protocol}://${host}/api/projects/${projectId}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      }),
    ),
  );

  const projectBodies = await Promise.all(
    projectResponses.map((response) => response.json() as Promise<ApiResponse<ProjectSummary>>),
  );

  const cardData = await Promise.all(
    projectBodies.flatMap((projectBody) => {
      if (!projectBody.data) return [];

      const project = projectBody.data;
      const upcomingShift = getUpcomingShift(project);

      return [
        Promise.all([
          fetch(`${protocol}://${host}/api/tasks?project_id=${project.project_id}&per_page=100`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: 'no-store',
          }),
          fetch(`${protocol}://${host}/api/applications?project_id=${project.project_id}&status=Approved&per_page=100`, {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
            cache: 'no-store',
          }),
        ]).then(async ([tasksResponse, teamResponse]) => {
          const tasksBody = (await tasksResponse.json()) as ApiResponse<TasksResponse>;
          const teamBody = (await teamResponse.json()) as ApiResponse<ApplicationsResponse>;
          const tasks = tasksBody.data?.tasks ?? [];

          return {
            project,
            upcomingShift,
            taskProgress: {
              complete: tasks.filter((task) => task.status === 'Complete').length,
              total: tasks.length,
            },
            teamCount: teamBody.data?.applications.length ?? 0,
          };
        }),
      ];
    }),
  );

  const sortedProjects = cardData.sort(sortByUpcomingShift);

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-espresso">My Projects</h1>
        <p className="mt-2 text-sm text-warm-gray">
          {sortedProjects.length} active projects
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {sortedProjects.map((item) => (
          <MyProjectCard
            key={item.project.project_id}
            project={item.project}
            taskProgress={item.taskProgress}
            teamCount={item.teamCount}
            upcomingShift={item.upcomingShift}
          />
        ))}
      </section>
    </div>
  );
}
