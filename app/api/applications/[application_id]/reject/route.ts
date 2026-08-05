/**
 * app/api/applications/[application_id]/reject/route.ts
 * PATCH /api/applications/:application_id/reject
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Application } from '@/types/applications';

type RejectApplicationInput = {
  rejection_reason?: string | null;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ application_id: string }> }
): Promise<NextResponse<ApiResponse<Application>>> {
  try {
    // 1. Verify Auth
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
        { status: 401 }
      );
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }
    const claims = extractClaims(token);
    if (!claims?.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token payload' } },
        { status: 401 }
      );
    }

    const { data: roleData } = await supabaseAdmin
      .from('users')
      .select('org_role_id')
      .eq('user_id', claims.sub)
      .maybeSingle();

    const orgRoleId = roleData?.org_role_id ?? 1;

    const { application_id: applicationId } = await params;

    // 2. Fetch Application Context
    const { data: appData, error: appError } = await supabaseAdmin
      .from('applications')
      .select(`
        application_id,
        user_id,
        project_id,
        status,
        projects ( created_by )
      `)
      .eq('application_id', applicationId)
      .maybeSingle();

    if (appError || !appData) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Application not found' } },
        { status: 404 }
      );
    }

    // 3. Enforce Scope: Board or (Project Lead AND created_by = self)
    const projectRow = Array.isArray(appData.projects) ? appData.projects[0] : appData.projects;

    if (orgRoleId !== 3) {
      if (orgRoleId !== 2 || projectRow?.created_by !== claims.sub) {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Cannot reject applications for this project' } },
          { status: 403 }
        );
      }
    }

    // 4. Validate Status
    if (appData.status !== 'Pending') {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: `Application is already ${appData.status}` } },
        { status: 409 }
      );
    }

    // 5. Parse Body
    const body = await req.json().catch(() => null) as RejectApplicationInput | null;

    // 6. Perform Update
    const { data: updatedApp, error: updateError } = await supabaseAdmin
      .from('applications')
      .update({
        status: 'Rejected',
        rejection_reason: body?.rejection_reason || null,
        reviewed_by: claims.sub,
        reviewed_at: new Date().toISOString()
      })
      .eq('application_id', applicationId)
      .select()
      .single();

    if (updateError || !updatedApp) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: updateError?.message || 'Failed to reject application' } },
        { status: 400 }
      );
    }

    // 7. Send Notification
    void supabaseAdmin.from('notifications').insert({
      user_id: updatedApp.user_id,
      channel: 'InApp',
      event_type: 'Application Rejected',
      subject: 'Application Update',
      body: `Your application to the project has been reviewed. Unfortunately, it was not accepted at this time.`,
      is_read: false,
      status: 'Sent'
    });

    // 8. Return Response
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
