import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { Project } from '@/types/projects';
import type { ProjectRole } from '@/types/project-roles';
import type { Shift } from '@/types/shifts';
import { EditProjectForm } from '@/components/lead/EditProjectForm';

type EditProjectPageProps = {
  params: Promise<{ project_id: string }>;
};

export default async function EditProjectPage({ params }: EditProjectPageProps) {
  const { project_id: projectId } = await params;
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

  const orgRoleId = userData?.org_role_id ?? 1;

  if (orgRoleId !== 2 && orgRoleId !== 3) {
    redirect('/home');
  }

  const [projectResult, shiftsResult, rolesResult] = await Promise.all([
    supabase.from('projects').select('*').eq('project_id', projectId).maybeSingle(),
    supabase
      .from('shifts')
      .select('*')
      .eq('project_id', projectId)
      .order('start_datetime', { ascending: true }),
    supabase
      .from('project_roles')
      .select('*')
      .eq('project_id', projectId)
      .order('role_name', { ascending: true }),
  ]);

  const project = projectResult.data as Project | null;

  if (!project) {
    redirect('/home');
  }

  const isBoard = orgRoleId === 3;
  const isLead = orgRoleId === 2 && project.created_by === authUser.id;

  if (!isBoard && !isLead) {
    redirect('/home');
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-10">
      <EditProjectForm
        project={project}
        shifts={(shiftsResult.data ?? []) as Shift[]}
        roles={(rolesResult.data ?? []) as ProjectRole[]}
      />
    </div>
  );
}
