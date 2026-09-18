import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { Announcement } from '@/types/announcements';

type AnnouncementsResponse = {
  announcements: Announcement[];
  total: number;
  last_synced_at: string | null;
  page: number;
  per_page: number;
};

type LastSyncedRow = {
  synced_at: string;
};

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<AnnouncementsResponse>>> {
  // Any authenticated caller, deliberately. The RLS policy on this table is
  // `announcements_select_authenticated ... USING (true)`, so the database grants
  // read to every authenticated user, and the dashboard page reads through the
  // anon client under that policy. Requiring a provisioned member here would make
  // the API stricter than the database without actually hiding anything.
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const page = parsePositiveInt(req.nextUrl.searchParams.get('page'), 1, 1000);
  const perPage = parsePositiveInt(req.nextUrl.searchParams.get('per_page'), 20, 100);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data: announcements, error, count } = await supabaseAdmin
    .from('announcements')
    .select('*', { count: 'exact' })
    .order('posted_at', { ascending: false })
    .range(from, to)
    .returns<Announcement[]>();

  if (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: error.message } },
      { status: 400 }
    );
  }

  const { data: lastSynced } = await supabaseAdmin
    .from('announcements')
    .select('synced_at')
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle<LastSyncedRow>();

  return NextResponse.json({
    data: {
      announcements: announcements ?? [],
      total: count ?? 0,
      last_synced_at: lastSynced?.synced_at ?? null,
      page,
      per_page: perPage,
    },
    error: null,
  });
}
