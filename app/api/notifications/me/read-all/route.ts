import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authenticate } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';

type ReadAllResponse = {
  marked_read: number;
};

type UpdatedNotificationId = {
  notification_id: string;
};

export async function PATCH(req: NextRequest): Promise<NextResponse<ApiResponse<ReadAllResponse>>> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } }, { status: 401 });
  }

  const auth = await authenticate(req);
  if (!auth) {
    return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });
  }

  const { data: updatedNotifications, error } = await supabaseAdmin
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', auth.userId)
    .eq('is_read', false)
    .select('notification_id')
    .returns<UpdatedNotificationId[]>();

  if (error) {
    return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });
  }

  return NextResponse.json({
    data: { marked_read: updatedNotifications?.length ?? 0 },
    error: null,
  });
}
