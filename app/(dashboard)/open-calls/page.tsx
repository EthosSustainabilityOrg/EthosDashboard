import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { Application, ApplicationStatus } from '@/types/applications';
import type { Project } from '@/types/projects';
import type { Shift } from '@/types/shifts';
import { OpenCallsBoard } from '@/components/open-calls/OpenCallsBoard';
import type {
  OpenCallApplication,
  OpenCallProject,
  OpenCallUser,
} from '@/components/open-calls/OpenCallsBoard';

type ProjectRow = Project & {
  chapters: { name: string; is_hq: boolean } | null;
  project_types: { type_name: string } | null;
  shifts: Pick<Shift, 'start_datetime' | 'end_datetime'>[] | null;
};

type ApplicationRow = Pick<Application, 'application_id' | 'project_id' | 'status' | 'submitted_at'> & {
  projects: { name: string; chapters: { is_hq: boolean } | null } | null;
};

type UserRow = {
  first_name: string;
  last_name: string;
  chapter_id: string;
  active_login_email: string;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string | null;
};

function getUpcomingShift(shifts: ProjectRow['shifts']) {
  const now = Date.now();

  return (
    (shifts ?? [])
      .filter((shift) => new Date(shift.start_datetime).getTime() > now)
      .sort(
        (a, b) =>
          new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime(),
      )[0] ?? null
  );
}

export default async function OpenCallsPage() {
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

  const [projectsResult, applicationsResult, userResult] = await Promise.all([
    supabase
      .from('projects')
      .select('*, chapters(name, is_hq), project_types(type_name), shifts(start_datetime, end_datetime)')
      .eq('is_open_call', true)
      .eq('is_published', true)
      .is('closed_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('applications')
      .select('application_id, project_id, status, submitted_at, projects(name, chapters(is_hq))')
      .eq('user_id', session.user.id),
    supabase
      .from('users')
      .select('first_name, last_name, chapter_id, active_login_email, guardian_name, guardian_email, guardian_phone')
      .eq('user_id', session.user.id)
      .maybeSingle(),
  ]);

  const projectRows = (projectsResult.data ?? []) as ProjectRow[];
  const applicationRows = (applicationsResult.data ?? []) as ApplicationRow[];
  const userRow = userResult.data as UserRow | null;

  // Chapter comes from the users row, never from a JWT claim: the custom claims
  // hook is not reliably populated in production, and a null chapter here breaks
  // the "My Chapter"/"Nearby" filters into overlapping, wrong result sets.
  // Null is still expected for a brand-new sign-in with no users row yet.
  const userChapterId = userRow?.chapter_id ?? null;

  const projects: OpenCallProject[] = projectRows.map((project) => ({
    ...project,
    chapter_name: project.chapters?.name ?? 'Ethos',
    type_name: project.project_types?.type_name ?? 'Project',
    is_hq: project.chapters?.is_hq ?? false,
    upcoming_shift: getUpcomingShift(project.shifts),
  }));

  const userApplications: OpenCallApplication[] = applicationRows.map((application) => ({
    application_id: application.application_id,
    project_id: application.project_id,
    project_name: application.projects?.name ?? 'Project',
    status: application.status as ApplicationStatus,
    submitted_at: application.submitted_at,
  }));

  const activeProjectCount = userApplications.filter(
    (application) => application.status === 'Approved',
  ).length;
  const pendingApplicationCount = userApplications.filter(
    (application) => application.status === 'Pending',
  ).length;
  const isOnHqProject = applicationRows.some(
    (application) =>
      application.status === 'Approved' && application.projects?.chapters?.is_hq === true,
  );

  const user: OpenCallUser = {
    first_name: userRow?.first_name ?? '',
    last_name: userRow?.last_name ?? '',
    email: userRow?.active_login_email ?? session.user.email ?? '',
    phone: '',
    guardian_name: userRow?.guardian_name ?? '',
    guardian_email: userRow?.guardian_email ?? '',
    guardian_phone: userRow?.guardian_phone ?? null,
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <OpenCallsBoard
        projects={projects}
        userApplications={userApplications}
        activeProjectCount={activeProjectCount}
        pendingApplicationCount={pendingApplicationCount}
        isOnHqProject={isOnHqProject}
        userChapterId={userChapterId}
        user={user}
      />
    </div>
  );
}
