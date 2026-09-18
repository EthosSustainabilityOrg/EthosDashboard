/**
 * app/api/applications/[application_id]/withdraw/route.ts
 * PATCH /api/applications/:application_id/withdraw
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { Application } from '@/types/applications';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ application_id: string }> }
): Promise<NextResponse<ApiResponse<Application>>> {
  try {
    // 1. Verify Auth
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { application_id: applicationId } = await params;

    // 2. Fetch Application Context
    const { data: appData, error: appError } = await supabaseAdmin
      .from('applications')
      .select('application_id, user_id, status')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (appError || !appData) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Application not found' } },
        { status: 404 }
      );
    }

    // 3. Enforce Scope: Applicant only
    if (appData.user_id !== auth.userId) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'You can only withdraw your own applications' } },
        { status: 403 }
      );
    }

    // 4. Validate Status: Can only withdraw Pending applications
    if (appData.status !== 'Pending') {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: `Cannot withdraw an application that is already ${appData.status}` } },
        { status: 409 }
      );
    }

    // 5. Perform Update
    const { data: updatedApp, error: updateError } = await supabaseAdmin
      .from('applications')
      .update({
        status: 'Withdrawn'
        // No reviewed_by/reviewed_at/rejection_reason updates needed (it's the user's action)
      })
      .eq('application_id', applicationId)
      .select()
      .single();

    if (updateError || !updatedApp) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: updateError?.message || 'Failed to withdraw application' } },
        { status: 400 }
      );
    }

    // Note: No notification or Slack integration required for withdrawal.

    // 6. Return Response
    return NextResponse.json({
      data: updatedApp as Application,
      error: null
    });

  } catch (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
