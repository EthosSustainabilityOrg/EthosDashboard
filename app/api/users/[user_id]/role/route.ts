/**
 * app/api/users/[user_id]/role/route.ts
 * PATCH /api/users/:user_id/role
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authenticate } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { User } from '@/types/users';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ user_id: string }> }
): Promise<NextResponse<ApiResponse<User>>> {
  try {
    // 1. Verify Auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
        { status: 401 }
      );
    }
    const auth = await authenticate(req);

    if (!auth) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    // 2. Enforce Scope: Board only
    if (auth.orgRoleId !== 3) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Board access required' } },
        { status: 403 }
      );
    }

    // 3. Parse Body
    const body = await req.json().catch(() => null);
    if (!body || typeof body.org_role_id !== 'number' || ![1, 2, 3].includes(body.org_role_id)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid or missing org_role_id' } },
        { status: 400 }
      );
    }

    const { user_id: targetUserId } = await params;

    // 4. Check Target User
    const { data: targetUser } = await supabaseAdmin
      .from('users')
      .select('org_role_id')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (!targetUser) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 }
      );
    }

    // 5. Board cannot demote another Board member
    if (targetUser.org_role_id === 3 && body.org_role_id !== 3) {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: 'Cannot demote a Board member' } },
        { status: 409 }
      );
    }

    // 6. Perform Update
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update({ org_role_id: body.org_role_id })
      .eq('user_id', targetUserId)
      .select()
      .single();

    if (updateError || !updatedUser) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: updateError?.message || 'Update failed' } },
        { status: 400 }
      );
    }

    // 7. Log to system_logs (fire and forget — not blocking response)
    void supabaseAdmin.from('system_logs').insert({
      integration: 'Supabase',
      error_type: 'Audit Log - Role Change',
      error_message: `User ${auth.userId} changed role of ${targetUserId} from ${targetUser.org_role_id} to ${body.org_role_id}`,
      affected_user_id: targetUserId,
      resolved: true
    });

    // 8. Insert in-app notification (fire and forget)
    void supabaseAdmin.from('notifications').insert({
      user_id: targetUserId,
      channel: 'InApp',
      event_type: 'Role Changed',
      subject: 'Your Role Has Been Updated',
      body: `Your organizational role has been updated to role ID ${body.org_role_id}.`,
      is_read: false,
      status: 'Sent'
    });

    return NextResponse.json({
      data: updatedUser as User,
      error: null
    });
    
  } catch (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
