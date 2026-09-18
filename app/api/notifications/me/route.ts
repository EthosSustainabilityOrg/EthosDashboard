import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { Notification } from '@/types/notifications';

type NotificationsResponse = {
  notifications: Notification[];
  unread_count: number;
  total: number;
  page: number;
  per_page: number;
};

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseBooleanParam(value: string | null): boolean | null {
  if (value === null) return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<NotificationsResponse>>> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const isReadParam = req.nextUrl.searchParams.get('is_read');
  const isRead = parseBooleanParam(isReadParam);
  const page = parsePositiveInt(req.nextUrl.searchParams.get('page'), 1, 1000);
  const perPage = parsePositiveInt(req.nextUrl.searchParams.get('per_page'), 20, 100);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  if (isReadParam !== null && isRead === null) {
    return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'is_read must be true or false' } }, { status: 400 });
  }

  let query = supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', auth.userId)
    .order('sent_at', { ascending: false })
    .range(from, to);

  if (isRead !== null) query = query.eq('is_read', isRead);

  const { data: notifications, error, count } = await query.returns<Notification[]>();
  if (error) {
    return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });
  }

  const { count: unreadCount, error: unreadError } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .eq('is_read', false);

  if (unreadError) {
    return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: unreadError.message } }, { status: 400 });
  }

  return NextResponse.json({
    data: {
      notifications: notifications ?? [],
      unread_count: unreadCount ?? 0,
      total: count ?? 0,
      page,
      per_page: perPage,
    },
    error: null,
  });
}
