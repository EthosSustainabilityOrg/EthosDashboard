import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';

type ReadAllResponse = {
  marked_read: number;
};

type UpdatedNotificationId = {
  notification_id: string;
};

export async function PATCH(req: NextRequest): Promise<NextResponse<ApiResponse<ReadAllResponse>>> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

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
