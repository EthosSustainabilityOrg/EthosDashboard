import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { User } from '@/types/users';
import type { OrgRoleName } from '@/types/auth';

type MeResponse = User & {
  org_role_name: OrgRoleName;
  chapter_name: string;
};

type RawMeRow = User & {
  org_roles: { role_name: OrgRoleName } | { role_name: OrgRoleName }[] | null;
  chapters: { name: string } | { name: string }[] | null;
};

type PatchMeInput = {
  first_name?: string;
  last_name?: string;
  guardian_name?: string;
  guardian_email?: string;
  guardian_phone?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

function mapMe(row: RawMeRow): MeResponse {
  const role = firstRow(row.org_roles);
  const chapter = firstRow(row.chapters);

  return {
    user_id: row.user_id,
    first_name: row.first_name,
    last_name: row.last_name,
    date_of_birth: row.date_of_birth,
    personal_email: row.personal_email,
    ethos_email: row.ethos_email,
    active_login_email: row.active_login_email,
    slack_user_id: row.slack_user_id,
    guardian_name: row.guardian_name,
    guardian_email: row.guardian_email,
    guardian_phone: row.guardian_phone,
    org_role_id: row.org_role_id,
    org_role_name: role?.role_name ?? 'Member',
    chapter_id: row.chapter_id,
    chapter_name: chapter?.name ?? '',
    onboarding_complete: row.onboarding_complete,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parsePatchInput(value: unknown): PatchMeInput | null {
  if (!isRecord(value)) return null;

  const allowed = ['first_name', 'last_name', 'guardian_name', 'guardian_email', 'guardian_phone'];
  const input: PatchMeInput = {};

  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      return null;
    }
  }

  if ('first_name' in value) {
    if (typeof value.first_name !== 'string' || !value.first_name.trim()) return null;
    input.first_name = value.first_name.trim();
  }

  if ('last_name' in value) {
    if (typeof value.last_name !== 'string' || !value.last_name.trim()) return null;
    input.last_name = value.last_name.trim();
  }

  if ('guardian_name' in value) {
    if (typeof value.guardian_name !== 'string' || !value.guardian_name.trim()) return null;
    input.guardian_name = value.guardian_name.trim();
  }

  if ('guardian_email' in value) {
    if (typeof value.guardian_email !== 'string' || !value.guardian_email.trim()) return null;
    input.guardian_email = value.guardian_email.trim();
  }

  if ('guardian_phone' in value) {
    if (value.guardian_phone !== null && typeof value.guardian_phone !== 'string') return null;
    input.guardian_phone =
      typeof value.guardian_phone === 'string' && value.guardian_phone.trim()
        ? value.guardian_phone.trim()
        : null;
  }

  return input;
}

async function requireUserId(req: NextRequest): Promise<string | NextResponse<ApiResponse<never>>> {
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

  return claims.sub;
}

async function fetchMe(userId: string): Promise<MeResponse | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select(`
      user_id,
      first_name,
      last_name,
      date_of_birth,
      personal_email,
      ethos_email,
      active_login_email,
      slack_user_id,
      guardian_name,
      guardian_email,
      guardian_phone,
      org_role_id,
      chapter_id,
      onboarding_complete,
      created_at,
      updated_at,
      org_roles!inner ( role_name ),
      chapters!inner ( name )
    `)
    .eq('user_id', userId)
    .maybeSingle<RawMeRow>();

  return data ? mapMe(data) : null;
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<MeResponse>>> {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;

    const me = await fetchMe(userId);

    if (!me) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: me, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse<ApiResponse<MeResponse>>> {
  try {
    const userId = await requireUserId(req);
    if (userId instanceof NextResponse) return userId;

    const body = parsePatchInput(await req.json().catch(() => null));
    if (!body) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Only editable profile fields may be updated' } },
        { status: 400 },
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update(body)
      .eq('user_id', userId);

    if (updateError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: updateError.message } },
        { status: 400 },
      );
    }

    const me = await fetchMe(userId);

    if (!me) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: me, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 },
    );
  }
}
