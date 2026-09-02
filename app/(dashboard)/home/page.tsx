import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { Announcement } from '@/types/announcements';
import type { ApiResponse } from '@/types/api';
import type { Task } from '@/types/tasks';
import { Tag } from '@/components/ui/Tag';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { formatDate } from '@/lib/format-date';

type CurrentUser = {
  first_name: string;
  created_at: string;
  org_role_id: number;
  chapters:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

type DonationAmount = {
  amount: number;
};

type ProjectSummary = {
  project_id: string;
  name: string;
  project_type_id: number;
  is_virtual: boolean;
  location: string | null;
  shifts: {
    start_datetime: string;
    end_datetime: string;
  }[];
};

type ApprovedApplication = {
  projects: ProjectSummary | ProjectSummary[] | null;
};

type TasksResponse = {
  tasks: Task[];
  total: number;
  page: number;
  per_page: number;
};

function getChapterName(user: CurrentUser | null) {
  const chapter = Array.isArray(user?.chapters) ? user?.chapters[0] : user?.chapters;
  return chapter?.name ?? 'Ethos';
}

function formatMonthYear(value: string) {
  return formatDate(new Date(value), {
    month: 'long',
    year: 'numeric',
  });
}

function formatShiftDate(value: string) {
  return formatDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAnnouncementDate(value: string) {
  return formatDate(new Date(value), {
    month: 'short',
    day: 'numeric',
  });
}

function getApprovedProject(application: ApprovedApplication | null) {
  return Array.isArray(application?.projects)
    ? application?.projects[0]
    : application?.projects;
}

function getUpcomingShift(project: ProjectSummary | null | undefined) {
  const now = new Date().toISOString();

  return (project?.shifts ?? [])
    .filter((shift) => shift.start_datetime > now)
    .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime))[0];
}

function getProjectTag(projectTypeId: number) {
  if (projectTypeId === 1) return { label: 'Event', color: 'green' as const };
  if (projectTypeId === 2) return { label: 'Campaign', color: 'peach' as const };
  if (projectTypeId === 3) return { label: 'Program', color: 'blue' as const };
  return { label: 'HQ', color: 'sand' as const };
}

export default async function HomePage() {
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

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(monthStart);
  monthEnd.setMonth(monthEnd.getMonth() + 1);

  const [
    { data: userData },
    { count: activeProjectsCount },
    { count: totalMembersCount },
    { data: eventShiftsThisMonth },
    { data: donationData },
    { data: applicationData },
    { data: announcementsData },
  ] = await Promise.all([
    supabase
      .from('users')
      .select('first_name, created_at, org_role_id, chapters(name)')
      .eq('user_id', session.user.id)
      .single(),
    supabase
      .from('projects')
      .select('project_id', { count: 'exact', head: true })
      .eq('is_published', true)
      .is('closed_at', null),
    supabase
      .from('users')
      .select('user_id', { count: 'exact', head: true }),
    supabase
      .from('shifts')
      .select('project_id, projects!inner(project_type_id)')
      .eq('projects.project_type_id', 1)
      .gte('start_datetime', monthStart.toISOString())
      .lt('start_datetime', monthEnd.toISOString()),
    supabase
      .from('donations')
      .select('amount'),
    supabase
      .from('applications')
      .select(`
        projects (
          project_id,
          name,
          project_type_id,
          is_virtual,
          location,
          shifts (
            start_datetime,
            end_datetime
          )
        )
      `)
      .eq('user_id', session.user.id)
      .eq('status', 'Approved')
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('announcements')
      .select('*')
      .order('posted_at', { ascending: false })
      .limit(3),
  ]);

  const user = userData as CurrentUser | null;
  const isBoard = user?.org_role_id === 3;
  const boardMetricHref = isBoard ? '/board/overview' : undefined;
  const eventsThisMonthCount = new Set(
    ((eventShiftsThisMonth ?? []) as Array<{ project_id: string }>).map((shift) => shift.project_id),
  ).size;
  const donations = (donationData ?? []) as DonationAmount[];
  const application = applicationData as ApprovedApplication | null;
  const announcements = (announcementsData ?? []) as Announcement[];
  const project = getApprovedProject(application);
  const upcomingShift = getUpcomingShift(project);
  const projectTag = project ? getProjectTag(project.project_type_id) : null;

  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';
  const host = headerStore.get('host');
  const tasksUrl = host
    ? `${protocol}://${host}/api/tasks?assigned_to=${session.user.id}&per_page=5`
    : null;

  const tasksResponse = tasksUrl
    ? await fetch(tasksUrl, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: 'no-store',
      })
    : null;

  const tasksBody = tasksResponse
    ? ((await tasksResponse.json()) as ApiResponse<TasksResponse>)
    : null;

  const tasks = (tasksBody?.data?.tasks ?? [])
    .filter((task) => task.status !== 'Complete')
    .slice(0, 5);

  const fundsRaised = donations.reduce((sum, donation) => sum + donation.amount, 0);

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-espresso">
          Welcome, {user?.first_name ?? 'friend'}
        </h1>
        <p className="mt-2 text-sm text-warm-gray">
          {getChapterName(user)} · Member since {formatMonthYear(user?.created_at ?? new Date().toISOString())}
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active projects" value={activeProjectsCount ?? 0} href={boardMetricHref} />
        <MetricCard label="Total members" value={totalMembersCount ?? 0} href={boardMetricHref} />
        <MetricCard label="Events this month" value={eventsThisMonthCount ?? 0} href={boardMetricHref} />
        <MetricCard label="Funds raised" value={`$${fundsRaised.toLocaleString()}`} href={boardMetricHref} />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <section className="rounded-xl border border-sand bg-cream p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-espresso">My project</h2>
            {projectTag ? <Tag label={projectTag.label} color={projectTag.color} /> : null}
          </div>

          {project ? (
            <Link href={`/projects/${project.project_id}`} className="block rounded-lg transition hover:bg-peach-light/50">
              <h3 className="font-semibold text-espresso">{project.name}</h3>
              <div className="mt-4 space-y-2 text-sm text-warm-gray">
                <p>{upcomingShift ? formatShiftDate(upcomingShift.start_datetime) : 'Schedule coming soon'}</p>
                <p>{project.is_virtual ? 'Virtual' : project.location ?? 'Location to be shared'}</p>
              </div>
            </Link>
          ) : (
            <p className="text-sm text-warm-gray">No active projects</p>
          )}
        </section>

        <section className="rounded-xl border border-sand bg-cream p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-espresso">My tasks</h2>
            <Link href="/work" className="text-sm font-semibold text-espresso underline">
              View all tasks
            </Link>
          </div>

          {tasks.length > 0 ? (
            <ul className="space-y-3">
              {tasks.map((task) => (
                <li key={task.task_id} className="flex items-center gap-3 rounded-lg border border-sand p-3">
                  <span className="text-warm-gray" aria-hidden="true">—</span>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-espresso">
                    {task.title}
                  </span>
                  <span className="rounded-full bg-peach-light px-2.5 py-1 text-xs font-semibold text-espresso">
                    {task.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-warm-gray">No tasks assigned yet</p>
          )}
        </section>
      </div>

      {announcements.length > 0 ? (
        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-lg font-bold text-espresso">Announcements</h2>
            <Link href="/announcements" className="text-sm font-semibold text-espresso underline">
              See all
            </Link>
          </div>

          <div>
            {announcements.map((announcement) => (
              <article
                key={announcement.announcement_id}
                className="mb-3 rounded-xl border border-sand bg-cream p-4 last:mb-0"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-warm-gray">
                    {announcement.posted_by_slack_user}
                  </p>
                  <p className="text-xs text-warm-gray">
                    {formatAnnouncementDate(announcement.posted_at)}
                  </p>
                </div>
                <p className="line-clamp-2 text-sm leading-6 text-brown-mid">
                  {announcement.content}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
