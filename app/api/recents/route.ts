import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { PageType } from '@/types/recents';

type RecordRecentResponse = {
  recorded: true;
};

type RecordRecentInput = {
  page_type: PageType;
  reference_id: string;
};

type RecentIdRow = {
  recent_id: string;
};

const PAGE_TYPES: readonly PageType[] = ['Project', 'File'];

function isPageType(value: unknown): value is PageType {
  return typeof value === 'string' && PAGE_TYPES.includes(value as PageType);
}

function isRecordRecentInput(value: unknown): value is RecordRecentInput {
  if (!value || typeof value !== 'object') return false;

  const body = value as Record<string, unknown>;
  return isPageType(body.page_type) && typeof body.reference_id === 'string';
}

async function pruneOldRecents(userId: string): Promise<void> {
  const { data: recents } = await supabaseAdmin
    .from('recents')
    .select('recent_id')
    .eq('user_id', userId)
    .order('visited_at', { ascending: false })
    .returns<RecentIdRow[]>();

  const oldRecentIds = (recents ?? []).slice(20).map((recent) => recent.recent_id);
  if (oldRecentIds.length === 0) return;

  await supabaseAdmin
    .from('recents')
    .delete()
    .in('recent_id', oldRecentIds);
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<RecordRecentResponse>>> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
      { status: 401 }
    );
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  const claims = extractClaims(token);

  if (authError || !user || !claims?.sub) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
      { status: 401 }
    );
  }

  const rawBody: unknown = await req.json().catch(() => null);
  if (!isRecordRecentInput(rawBody)) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Page type and reference are required' } },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { data: existingRecent } = await supabaseAdmin
    .from('recents')
    .select('recent_id')
    .eq('user_id', claims.sub)
    .eq('reference_id', rawBody.reference_id)
    .maybeSingle<RecentIdRow>();

  const { error } = existingRecent
    ? await supabaseAdmin
      .from('recents')
      .update({
        page_type: rawBody.page_type,
        visited_at: now,
      })
      .eq('recent_id', existingRecent.recent_id)
    : await supabaseAdmin
      .from('recents')
      .insert({
        user_id: claims.sub,
        page_type: rawBody.page_type,
        reference_id: rawBody.reference_id,
        visited_at: now,
      });

  if (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: error.message } },
      { status: 400 }
    );
  }

  await pruneOldRecents(claims.sub);

  return NextResponse.json({
    data: { recorded: true },
    error: null,
  });
}
