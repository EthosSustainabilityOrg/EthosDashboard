import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { ProjectUpdate } from '@/types/project-updates';

type ProjectUpdatesResponse = {
  updates: ProjectUpdate[];
  total: number;
};

type ProjectOwnerRow = {
  project_id: string;
  created_by: string;
};

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

async function isApprovedMember(userId: string, projectId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('applications')
    .select('application_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('status', 'Approved')
    .maybeSingle<{ application_id: string }>();

  return Boolean(data);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ project_id: string }> }
): Promise<NextResponse<ApiResponse<ProjectUpdatesResponse>>> {
  const { project_id: projectId } = await params;

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
      { status: 401 }
    );
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  const claims = extractClaims(token);

  if (authError || !user || !claims?.sub) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
      { status: 401 }
    );
  }

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('project_id, created_by')
    .eq('project_id', projectId)
    .maybeSingle<ProjectOwnerRow>();

  if (!project) {
    return NextResponse.json(
      { data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } },
      { status: 404 }
    );
  }

  const { data: roleData } = await supabaseAdmin
    .from('users')
    .select('org_role_id')
    .eq('user_id', claims.sub)
    .maybeSingle();

  const orgRoleId = roleData?.org_role_id ?? 1;

  const canRead =
    orgRoleId === 3 ||
    project.created_by === claims.sub ||
    await isApprovedMember(claims.sub, projectId);

  if (!canRead) {
    return NextResponse.json(
      { data: null, error: { code: 'FORBIDDEN', message: 'Cannot read updates for this project' } },
      { status: 403 }
    );
  }

  const page = parsePositiveInt(req.nextUrl.searchParams.get('page'), 1, 1000);
  const perPage = parsePositiveInt(req.nextUrl.searchParams.get('per_page'), 50, 100);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data: updates, error, count } = await supabaseAdmin
    .from('project_updates')
    .select('*', { count: 'exact' })
    .eq('project_id', projectId)
    .order('posted_at', { ascending: false })
    .range(from, to)
    .returns<ProjectUpdate[]>();

  if (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: error.message } },
      { status: 400 }
    );
  }

  return NextResponse.json({
    data: {
      updates: updates ?? [],
      total: count ?? 0,
    },
    error: null,
  });
}
