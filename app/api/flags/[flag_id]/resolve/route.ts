import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authenticateBoard } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { VolunteerFlag } from '@/types/volunteer-flags';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ flag_id: string }> }): Promise<NextResponse<ApiResponse<VolunteerFlag>>> {
  const { flag_id: flagId } = await params;

  const board = await authenticateBoard(req);
  if (!board) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const { data: flag, error } = await supabaseAdmin
    .from('volunteer_flags')
    .update({ resolved: true, resolved_by: board.userId, resolved_at: new Date().toISOString() })
    .eq('flag_id', flagId)
    .select()
    .maybeSingle<VolunteerFlag>();

  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });
  if (!flag) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Flag not found' } }, { status: 404 });
  return NextResponse.json({ data: flag, error: null });
}
