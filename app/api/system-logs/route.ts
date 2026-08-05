import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { IntegrationType, SystemLog } from '@/types/system-logs';

type SystemLogsResponse = { logs: SystemLog[]; total: number; page: number; per_page: number };
const INTEGRATIONS: readonly IntegrationType[] = ['Supabase', 'OpenSign', 'Slack', 'Resend', 'GoogleDrive'];

function isIntegration(v: unknown): v is IntegrationType {
  return typeof v === 'string' && INTEGRATIONS.includes(v as IntegrationType);
}

function parseBooleanParam(v: string | null): boolean | null {
  if (v === null) return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

function parsePositiveInt(v: string | null, fallback: number, max: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}

async function requireBoard(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  const claims = extractClaims(token);
  if (error || !user || !claims?.sub) return false;

  const { data: roleData } = await supabaseAdmin
    .from('users')
    .select('org_role_id')
    .eq('user_id', claims.sub)
    .maybeSingle();

  return (roleData?.org_role_id ?? 1) === 3;
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<SystemLogsResponse>>> {
  if (!(await requireBoard(req))) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const resolvedParam = req.nextUrl.searchParams.get('resolved');
  const resolved = parseBooleanParam(resolvedParam);
  const integration = req.nextUrl.searchParams.get('integration');
  if (resolvedParam !== null && resolved === null) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'resolved must be true or false' } }, { status: 400 });
  if (integration !== null && !isIntegration(integration)) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid integration' } }, { status: 400 });

  const page = parsePositiveInt(req.nextUrl.searchParams.get('page'), 1, 1000);
  const perPage = parsePositiveInt(req.nextUrl.searchParams.get('per_page'), 20, 100);
  let query = supabaseAdmin.from('system_logs').select('*', { count: 'exact' }).order('occurred_at', { ascending: false }).range((page - 1) * perPage, page * perPage - 1);
  if (resolved !== null) query = query.eq('resolved', resolved);
  if (integration) query = query.eq('integration', integration);

  const { data: logs, error, count } = await query.returns<SystemLog[]>();
  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });
  return NextResponse.json({ data: { logs: logs ?? [], total: count ?? 0, page, per_page: perPage }, error: null });
}
