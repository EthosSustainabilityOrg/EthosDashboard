import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { OrgSetting } from '@/types/org-settings';

type PatchOrgSettingInput = {
  value: string;
};

function isPatchOrgSettingInput(value: unknown): value is PatchOrgSettingInput {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return typeof body.value === 'string';
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
): Promise<NextResponse<ApiResponse<OrgSetting>>> {
  const { key } = await params;

  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const orgRoleId = auth.orgRoleId;

  if (orgRoleId !== 3) {
    return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  if (!isPatchOrgSettingInput(body)) {
    return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'value is required' } }, { status: 400 });
  }

  const { data: setting, error } = await supabaseAdmin
    .from('org_settings')
    .update({
      value: body.value,
      updated_by: auth.userId,
    })
    .eq('key', decodeURIComponent(key))
    .select()
    .maybeSingle<OrgSetting>();

  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });
  if (!setting) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Setting not found' } }, { status: 404 });

  return NextResponse.json({ data: setting, error: null });
}
