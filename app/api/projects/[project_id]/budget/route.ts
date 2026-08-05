import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Project } from '@/types/projects';

type BudgetInput = { allocated_budget: number };

function isBudgetInput(value: unknown): value is BudgetInput {
  return Boolean(value && typeof value === 'object' && typeof (value as Record<string, unknown>).allocated_budget === 'number' && Number.isFinite((value as Record<string, unknown>).allocated_budget));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ project_id: string }> }
): Promise<NextResponse<ApiResponse<Project>>> {
  const { project_id: projectId } = await params;

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' } }, { status: 401 });

  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  const claims = extractClaims(token);
  if (authError || !user || !claims?.sub) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });

  const { data: roleData } = await supabaseAdmin
    .from('users')
    .select('org_role_id')
    .eq('user_id', claims.sub)
    .maybeSingle();

  const orgRoleId = roleData?.org_role_id ?? 1;

  if (orgRoleId !== 3) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  if (!isBudgetInput(body)) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'allocated_budget must be a number' } }, { status: 400 });

  const { data: project, error } = await supabaseAdmin
    .from('projects')
    .update({ allocated_budget: body.allocated_budget })
    .eq('project_id', projectId)
    .select()
    .maybeSingle<Project>();

  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });
  if (!project) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } }, { status: 404 });

  await supabaseAdmin.from('notifications').insert({
    user_id: project.created_by,
    sent_to_email: null,
    sent_to_slack_user_id: null,
    channel: 'InApp',
    event_type: 'General',
    subject: null,
    body: `Allocated budget updated for ${project.name}: $${body.allocated_budget.toFixed(2)}.`,
    status: 'Sent',
  });

  return NextResponse.json({ data: project, error: null });
}
