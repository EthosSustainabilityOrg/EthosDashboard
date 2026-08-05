import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { VolunteerFlag } from '@/types/volunteer-flags';

async function requireBoard(req: NextRequest): Promise<string | null> {
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

  return (roleData?.org_role_id ?? 1) === 3 ? claims.sub : null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ flag_id: string }> }): Promise<NextResponse<ApiResponse<VolunteerFlag>>> {
  const { flag_id: flagId } = await params;

  const boardId = await requireBoard(req);
  if (!boardId) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const { data: flag, error } = await supabaseAdmin
    .from('volunteer_flags')
    .update({ resolved: true, resolved_by: boardId, resolved_at: new Date().toISOString() })
    .eq('flag_id', flagId)
    .select()
    .maybeSingle<VolunteerFlag>();

  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });
  if (!flag) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Flag not found' } }, { status: 404 });
  return NextResponse.json({ data: flag, error: null });
}
