import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authenticateBoard } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { SystemLog } from '@/types/system-logs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ log_id: string }> }): Promise<NextResponse<ApiResponse<SystemLog>>> {
  const { log_id: logId } = await params;

  if (!(await authenticateBoard(req))) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const { data: log, error } = await supabaseAdmin
    .from('system_logs')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('log_id', logId)
    .select()
    .maybeSingle<SystemLog>();

  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });
  if (!log) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'System log not found' } }, { status: 404 });
  return NextResponse.json({ data: log, error: null });
}
