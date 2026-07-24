import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Application } from '@/types/applications';

type ReassignRoleInput = {
  project_role_id: string;
};

type ApplicationContext = Application & {
  projects: { created_by: string; name: string } | { created_by: string; name: string }[] | null;
};

type ProjectRoleContext = {
  project_role_id: string;
  project_id: string;
  role_name: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

function parseInput(value: unknown): ReassignRoleInput | null {
  if (!isRecord(value)) return null;
  return typeof value.project_role_id === 'string' && value.project_role_id.trim()
    ? { project_role_id: value.project_role_id }
    : null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ application_id: string }> },
): Promise<NextResponse<ApiResponse<Application>>> {
  try {
    const { application_id: applicationId } = await params;

    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
        { status: 401 },
      );
    }

    const token = authHeader.split(' ')[1];
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    const claims = extractClaims(token);

    if (authError || !user || !claims?.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 },
      );
    }

    const body = parseInput(await req.json().catch(() => null));
    if (!body) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'project_role_id is required' } },
        { status: 400 },
      );
    }

    const { data: application, error: applicationError } = await supabaseAdmin
      .from('applications')
      .select(`
        application_id,
        user_id,
        project_id,
        status,
        project_role_id,
        why_join,
        experience,
        availability_notes,
        reviewed_by,
        reviewed_at,
        rejection_reason,
        submitted_at,
        updated_at,
        projects!inner ( created_by, name )
      `)
      .eq('application_id', applicationId)
      .maybeSingle<ApplicationContext>();

    if (applicationError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: applicationError.message } },
        { status: 400 },
      );
    }

    if (!application) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Application not found' } },
        { status: 404 },
      );
    }

    const project = firstRow(application.projects);

    if (claims.org_role_id !== 3) {
      if (claims.org_role_id !== 2 || project?.created_by !== claims.sub) {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Cannot reassign roles for this project' } },
          { status: 403 },
        );
      }
    }

    if (application.status !== 'Approved') {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: 'Only approved applications can be reassigned' } },
        { status: 409 },
      );
    }

    const { data: projectRole, error: roleError } = await supabaseAdmin
      .from('project_roles')
      .select('project_role_id, project_id, role_name')
      .eq('project_role_id', body.project_role_id)
      .maybeSingle<ProjectRoleContext>();

    if (roleError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: roleError.message } },
        { status: 400 },
      );
    }

    if (!projectRole) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Project role not found' } },
        { status: 404 },
      );
    }

    if (projectRole.project_id !== application.project_id) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Project role must belong to the same project' } },
        { status: 400 },
      );
    }

    const { data: updatedApplication, error: updateError } = await supabaseAdmin
      .from('applications')
      .update({
        project_role_id: body.project_role_id,
        reviewed_by: claims.sub,
        reviewed_at: new Date().toISOString(),
      })
      .eq('application_id', applicationId)
      .select()
      .single<Application>();

    if (updateError || !updatedApplication) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: updateError?.message ?? 'Failed to reassign role',
          },
        },
        { status: 400 },
      );
    }

    void supabaseAdmin.from('notifications').insert({
      user_id: application.user_id,
      channel: 'InApp',
      event_type: 'Role Changed',
      subject: 'Project Role Changed',
      body: `Your role on ${project?.name ?? 'your project'} was changed to ${projectRole.role_name}.`,
      is_read: false,
      status: 'Sent',
    });

    return NextResponse.json({ data: updatedApplication, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 },
    );
  }
}
