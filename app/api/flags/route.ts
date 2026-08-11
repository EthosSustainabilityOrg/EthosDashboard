import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { VolunteerFlag } from '@/types/volunteer-flags';

type FlagsResponse = { flags: VolunteerFlag[]; total: number; page: number; per_page: number };
type CreateFlagInput = { user_id: string; project_id: string; shift_id?: string | null; reason?: string | null };

function parsePositiveInt(v: string | null, fallback: number, max: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

function parseBooleanParam(v: string | null): boolean | null {
  if (v === null) return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

function isCreateFlagInput(value: unknown): value is CreateFlagInput {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.user_id === 'string' &&
    typeof body.project_id === 'string' &&
    (body.shift_id === undefined || body.shift_id === null || typeof body.shift_id === 'string') &&
    (body.reason === undefined || body.reason === null || typeof body.reason === 'string')
  );
}

async function requireUser(req: NextRequest): Promise<{ userId: string; roleId: number } | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  const claims = extractClaims(token);
  if (error || !user || !claims?.sub) return null;

  const { data: roleData } = await supabaseAdmin
    .from('users')
    .select('org_role_id')
    .eq('user_id', claims.sub)
    .maybeSingle();

  return { userId: claims.sub, roleId: roleData?.org_role_id ?? 1 };
}

async function isApprovedOnProject(userId: string, projectId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('applications')
    .select('application_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('status', 'Approved')
    .maybeSingle<{ application_id: string }>();
  return Boolean(data);
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<VolunteerFlag>>> {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });
  if (auth.roleId !== 2 && auth.roleId !== 3) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Lead or Board only' } }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  if (!isCreateFlagInput(body)) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'A volunteer and project are required' } }, { status: 400 });

  const { data: project } = await supabaseAdmin
    .from('projects')
    .select('project_id, created_by')
    .eq('project_id', body.project_id)
    .maybeSingle<{ project_id: string; created_by: string }>();

  if (!project) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } }, { status: 404 });
  if (auth.roleId === 2 && project.created_by !== auth.userId) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Lead must own project' } }, { status: 403 });
  if (!(await isApprovedOnProject(body.user_id, body.project_id))) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Flagged user must be approved on project' } }, { status: 400 });

  if (body.shift_id) {
    const { data: shift } = await supabaseAdmin.from('shifts').select('shift_id').eq('shift_id', body.shift_id).eq('project_id', body.project_id).maybeSingle<{ shift_id: string }>();
    if (!shift) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'shift_id must belong to project' } }, { status: 400 });
  }

  const { data: flag, error } = await supabaseAdmin
    .from('volunteer_flags')
    .insert({ user_id: body.user_id, project_id: body.project_id, shift_id: body.shift_id ?? null, reason: body.reason ?? null, flagged_by: auth.userId })
    .select()
    .single<VolunteerFlag>();

  if (error || !flag) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error?.message || 'Failed to create flag' } }, { status: 400 });

  await supabaseAdmin.from('notifications').insert({
    user_id: body.user_id,
    sent_to_email: null,
    sent_to_slack_user_id: null,
    channel: 'InApp',
    event_type: 'General',
    subject: null,
    body: 'A volunteer flag was added to your record. Please contact your Project Lead if you have questions.',
    status: 'Sent',
  });

  return NextResponse.json({ data: flag, error: null }, { status: 201 });
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<FlagsResponse>>> {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });
  if (auth.roleId !== 3) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const resolvedParam = req.nextUrl.searchParams.get('resolved');
  const resolved = parseBooleanParam(resolvedParam);
  if (resolvedParam !== null && resolved === null) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'resolved must be true or false' } }, { status: 400 });

  const page = parsePositiveInt(req.nextUrl.searchParams.get('page'), 1, 1000);
  const perPage = parsePositiveInt(req.nextUrl.searchParams.get('per_page'), 20, 100);
  let query = supabaseAdmin.from('volunteer_flags').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * perPage, page * perPage - 1);
  if (resolved !== null) query = query.eq('resolved', resolved);
  if (req.nextUrl.searchParams.get('user_id')) query = query.eq('user_id', req.nextUrl.searchParams.get('user_id'));
  if (req.nextUrl.searchParams.get('project_id')) query = query.eq('project_id', req.nextUrl.searchParams.get('project_id'));

  const { data: flags, error, count } = await query.returns<VolunteerFlag[]>();
  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });
  return NextResponse.json({ data: { flags: flags ?? [], total: count ?? 0, page, per_page: perPage }, error: null });
}
