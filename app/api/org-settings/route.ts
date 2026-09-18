import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';

type OrgSettingsResponse = {
  settings: Array<{ key: string; value: string }>;
};

type OrgSettingListRow = {
  key: string;
  value: string;
};

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<OrgSettingsResponse>>> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { data: settings, error } = await supabaseAdmin
    .from('org_settings')
    .select('key, value')
    .order('key', { ascending: true })
    .returns<OrgSettingListRow[]>();

  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });

  return NextResponse.json({ data: { settings: settings ?? [] }, error: null });
}
