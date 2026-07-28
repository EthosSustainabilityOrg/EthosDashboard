import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Application } from '@/types/applications';
import type { ProjectRole } from '@/types/project-roles';
import { ApplicationInbox } from '@/components/lead/applications/ApplicationInbox';

type ApplicationsPageProps = {
  params: Promise<{
    project_id: string;
  }>;
};

type ProjectOwner = {
  name: string;
  created_by: string;
};

type ApplicationListItem = Application & {
  applicant_name: string;
  project_name?: string;
  project_role_name?: string | null;
};

type ApplicationsResponse = {
  applications: ApplicationListItem[];
  total: number;
  page: number;
  per_page: number;
};

type ProjectDetailResponse = {
  project_roles: ProjectRole[];
};

export default async function ProjectApplicationsPage({ params }: ApplicationsPageProps) {
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

  if (orgRoleId !== 2 && orgRoleId !== 3) {
    redirect('/home');
  }

  const { data: projectData } = await supabase
    .from('projects')
    .select('name, created_by')
    .eq('project_id', projectId)
    .maybeSingle();

  const project = projectData as ProjectOwner | null;

  if (!project || (orgRoleId === 2 && project.created_by !== authUser.id)) {
    redirect('/home');
  }

  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';
  const host = headerStore.get('host');

  if (!host) {
    redirect('/home');
  }

  const authHeaders = {
    Authorization: `Bearer ${session.access_token}`,
  };

  const [applicationsResponse, projectDetailResponse] = await Promise.all([
    fetch(`${protocol}://${host}/api/applications?project_id=${projectId}&per_page=100`, {
      headers: authHeaders,
      cache: 'no-store',
    }),
    fetch(`${protocol}://${host}/api/projects/${projectId}`, {
      headers: authHeaders,
      cache: 'no-store',
    }),
  ]);

  const applicationsBody =
    (await applicationsResponse.json()) as ApiResponse<ApplicationsResponse>;
  const projectDetailBody =
    (await projectDetailResponse.json()) as ApiResponse<ProjectDetailResponse>;

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-10">
      <header className="mb-8">
        <p className="text-sm font-semibold text-warm-gray">Application review</p>
        <h1 className="mt-2 text-3xl font-bold text-espresso">{project.name}</h1>
      </header>

      <ApplicationInbox
        applications={applicationsBody.data?.applications ?? []}
        projectId={projectId}
        projectRoles={projectDetailBody.data?.project_roles ?? []}
      />
    </div>
  );
}
