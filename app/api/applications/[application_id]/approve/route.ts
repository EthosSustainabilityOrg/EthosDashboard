/**
 * app/api/applications/[application_id]/approve/route.ts
 * PATCH /api/applications/:application_id/approve
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import { inviteToChannel } from '@/lib/slack';
import { unlockOnboardingIfApproved } from '@/lib/onboarding';
import type { ApiResponse } from '@/types/api';
import type { Application } from '@/types/applications';

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
        projects ( created_by, slack_channel_id ),
        users!applications_user_id_fkey ( slack_user_id )
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
    const userRow = Array.isArray(appData.users) ? appData.users[0] : appData.users;

    if (orgRoleId !== 3) {
      if (orgRoleId !== 2 || projectRow?.created_by !== claims.sub) {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Cannot approve applications for this project' } },
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
    const body = await req.json().catch(() => null);
    if (!body || !body.project_role_id) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Please select a role for this volunteer' } },
        { status: 400 }
      );
    }

    // 6. Perform Update
    const { data: updatedApp, error: updateError } = await supabaseAdmin
      .from('applications')
      .update({
        status: 'Approved',
        project_role_id: body.project_role_id,
        reviewed_by: claims.sub,
        reviewed_at: new Date().toISOString()
      })
      .eq('application_id', applicationId)
      .select()
      .single();

    if (updateError || !updatedApp) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: updateError?.message || 'Failed to approve application' } },
        { status: 400 }
      );
    }

    const applicantId = updatedApp.user_id;

    // 7. Unlock the App (Chunk 1 checklist step 6 — project lead review is the final step).
    // No-op until the onboarding record is complete; the consent webhook and orientation
    // route call this too, so whichever half lands last performs the unlock.
    await unlockOnboardingIfApproved(applicantId, 'Supabase');

    // 8. Profile & Preference Initialization (Fire-and-forget logic using upsert ignoring duplicates)
    void supabaseAdmin
      .from('notification_preferences')
      .upsert({ user_id: applicantId }, { onConflict: 'user_id', ignoreDuplicates: true });

    void supabaseAdmin
      .from('directory_profiles')
      .upsert({ user_id: applicantId }, { onConflict: 'user_id', ignoreDuplicates: true });

    // 9. Add Applicant to Slack Channel
    const slackUserId = userRow?.slack_user_id;
    const slackChannelId = projectRow?.slack_channel_id;

    if (slackUserId && slackChannelId) {
      inviteToChannel(slackChannelId, [slackUserId]).catch(async (slackErr: unknown) => {
        const message = slackErr instanceof Error ? slackErr.message : String(slackErr);
        await supabaseAdmin.from('system_logs').insert({
          integration: 'Slack',
          error_type: 'Channel Invite Failed',
          error_message: `Failed to add user ${slackUserId} to channel ${slackChannelId}: ${message}`,
          affected_user_id: applicantId,
          resolved: false
        });
      });
    }

    // 10. Send Notification
    void supabaseAdmin.from('notifications').insert({
      user_id: applicantId,
      channel: 'InApp',
      event_type: 'Application Approved',
      subject: 'Application Approved',
      body: `Your application has been approved and you have been added to the team!`,
      is_read: false,
      status: 'Sent'
    });

    // 11. Return Response
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
