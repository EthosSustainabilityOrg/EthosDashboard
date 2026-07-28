import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { File } from '@/types/files';
import type { Project } from '@/types/projects';
import type { ProjectUpdate } from '@/types/project-updates';
import type { Shift } from '@/types/shifts';
import type { Task } from '@/types/tasks';
import { ProjectDetailShell } from '@/components/project-detail/ProjectDetailShell';

type ProjectDetailPageProps = {
  params: Promise<{
    project_id: string;
  }>;
};

type ProjectRoleInfo = {
  project_role_id: string;
  role_name: string;
  description: string | null;
  capacity: number;
};

type TeamMember = {
  user_id: string;
  first_name: string;
  last_name: string;
  project_role_name: string | null;
  is_lead: boolean;
};

type ProjectFile = Pick<
  File,
  'file_id' | 'file_name' | 'file_type' | 'drive_url' | 'description' | 'created_at'
>;

type ProjectDetail = Project & {
  type_name: string;
  chapter_name: string;
  is_hq?: boolean;
  spots_remaining: number | null;
  shifts: Shift[];
  project_roles: ProjectRoleInfo[];
  team: TeamMember[];
  files: ProjectFile[];
};

type ProjectUpdatesResponse = {
  updates: ProjectUpdate[];
  total: number;
};

type ProjectTask = Task & {
  project_name: string | null;
  assignee_name: string | null;
};

type TasksResponse = {
  tasks: ProjectTask[];
  total: number;
  page: number;
  per_page: number;
};

type ProjectFileListItem = File & {
  project_name: string | null;
  added_by_name: string;
};

type FilesResponse = {
  files: ProjectFileListItem[];
  total: number;
  page: number;
  per_page: number;
};

type PendingApplicationsResponse = {
  applications: unknown[];
  total: number;
  page: number;
  per_page: number;
};

type ProjectOwnerRow = {
  created_by: string;
};

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { project_id: projectId } = await params;
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
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (!authUser || authError) {
    redirect('/login');
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const { data: userData } = await supabase
    .from('users')
    .select('org_role_id')
    .eq('user_id', authUser.id)
    .single();

  const orgRoleId = userData?.org_role_id ?? 1;

  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';
  const host = headerStore.get('host');

  if (!host) {
    redirect('/home');
  }

  const authHeaders = {
    Authorization: `Bearer ${session.access_token}`,
  };

  const [
    projectResponse,
    updatesResponse,
    tasksResponse,
    filesResponse,
    pendingResponse,
    ownerResult,
  ] = await Promise.all([
    fetch(`${protocol}://${host}/api/projects/${projectId}`, {
      headers: authHeaders,
      cache: 'no-store',
    }),
    fetch(`${protocol}://${host}/api/projects/${projectId}/updates?per_page=100`, {
      headers: authHeaders,
      cache: 'no-store',
    }),
    fetch(`${protocol}://${host}/api/tasks?project_id=${projectId}&per_page=100`, {
      headers: authHeaders,
      cache: 'no-store',
    }),
    fetch(`${protocol}://${host}/api/files?project_id=${projectId}&per_page=100`, {
      headers: authHeaders,
      cache: 'no-store',
    }),
    fetch(`${protocol}://${host}/api/applications?project_id=${projectId}&status=Pending&per_page=1`, {
      headers: authHeaders,
      cache: 'no-store',
    }),
    supabase
      .from('projects')
      .select('created_by')
      .eq('project_id', projectId)
      .maybeSingle(),
  ]);

  if (projectResponse.status === 403 || projectResponse.status === 404) {
    redirect('/home');
  }

  const projectBody = (await projectResponse.json()) as ApiResponse<ProjectDetail>;

  if (!projectBody.data) {
    redirect('/home');
  }

  const updatesBody = updatesResponse.ok
    ? ((await updatesResponse.json()) as ApiResponse<ProjectUpdatesResponse>)
    : null;
  const tasksBody = tasksResponse.ok
    ? ((await tasksResponse.json()) as ApiResponse<TasksResponse>)
    : null;
  const filesBody = filesResponse.ok
    ? ((await filesResponse.json()) as ApiResponse<FilesResponse>)
    : null;
  const pendingBody = pendingResponse.ok
    ? ((await pendingResponse.json()) as ApiResponse<PendingApplicationsResponse>)
    : null;
  const pendingCount = pendingBody?.data?.total ?? 0;

  const owner = ownerResult.data as ProjectOwnerRow | null;
  const project = projectBody.data;
  const isBoard = orgRoleId === 3;
  const isLead = orgRoleId === 2 && owner?.created_by === authUser.id;
  const isMember = project.team.some((member) => member.user_id === authUser.id);

  if (!isBoard && !isLead && !isMember) {
    redirect('/home');
  }

  return (
    <ProjectDetailShell
      project={project}
      tasks={(tasksBody?.data?.tasks ?? []).map((task) => ({
        ...task,
        project_name: task.project_name ?? project.name,
        assignee_name: task.assignee_name ?? 'Unassigned',
      }))}
      files={filesBody?.data?.files ?? []}
      updates={updatesBody?.data?.updates ?? []}
      currentUserId={authUser.id}
      isLead={isLead}
      isBoard={isBoard}
      isMember={isMember}
      pendingCount={pendingCount}
    />
  );
}
