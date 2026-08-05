/**
 * app/api/projects/[project_id]/publish/route.ts
 * POST /api/projects/:project_id/publish
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createChannel } from '@/lib/slack';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Project } from '@/types/projects';


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ project_id: string }> }
): Promise<NextResponse<ApiResponse<Project>>> {
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

    const { project_id: projectId } = await params;

    // 2. Fetch Project and Details
    const { data: p, error: projectError } = await supabaseAdmin
      .from('projects')
      .select(`
        project_id,
        name,
        description,
        is_published,
        created_by,
        closed_at,
        requested_budget,
        shifts ( shift_id ),
        project_roles ( project_role_id )
      `)
      .eq('project_id', projectId)
      .maybeSingle();

    if (projectError || !p) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 }
      );
    }

    if (p.closed_at !== null) {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: 'Cannot publish a closed project' } },
        { status: 409 }
      );
    }
    
    if (p.is_published) {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: 'Project is already published' } },
        { status: 409 }
      );
    }

    // 3. Enforce Scope: Board or (Project Lead AND created_by = self)
    const { data: roleData } = await supabaseAdmin
      .from('users')
      .select('org_role_id')
      .eq('user_id', claims.sub)
      .maybeSingle();

    const orgRoleId = roleData?.org_role_id ?? 1;

    if (orgRoleId !== 3) {
      if (orgRoleId !== 2 || p.created_by !== claims.sub) {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Cannot publish this project' } },
          { status: 403 }
        );
      }
    }

    // 4. Validate Publish Requirements
    if (!p.name || !p.description) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Project must have a name and description to publish' } },
        { status: 400 }
      );
    }
    if (!p.shifts || p.shifts.length === 0) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Project must have at least one shift to publish' } },
        { status: 400 }
      );
    }
    if (!p.project_roles || p.project_roles.length === 0) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Project must have at least one role to publish' } },
        { status: 400 }
      );
    }

    // 5. Create Slack Channel (fire-and-wait)
    let slackChannelId: string | null = null;
    try {
      const channelName = p.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 80);
      
      slackChannelId = await createChannel(channelName);
      
    } catch (slackError: unknown) {
      const message = slackError instanceof Error 
        ? slackError.message 
        : String(slackError);
        
      void supabaseAdmin.from('system_logs').insert({
        integration: 'Slack',
        error_type: 'Channel Creation Failed',
        error_message: `Failed to create channel for project ${projectId}: ${message}`,
        resolved: false
      });
    }

    // 6. Perform Publish Update
    const { data: updatedProject, error: updateError } = await supabaseAdmin
      .from('projects')
      .update({
        is_published: true,
        slack_channel_id: slackChannelId
      })
      .eq('project_id', projectId)
      .select()
      .single();

    if (updateError || !updatedProject) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: updateError?.message || 'Update failed' } },
        { status: 400 }
      );
    }

    // 7. Notify Board of Publish & Budget (fire-and-forget)
    void (async () => {
      const { data: boardMembers } = await supabaseAdmin
        .from('users')
        .select('user_id')
        .eq('org_role_id', 3);

      if (boardMembers && boardMembers.length > 0) {
        const notifications = boardMembers.map(b => ({
          user_id: b.user_id,
          channel: 'InApp',
          event_type: 'General',
          subject: 'New Project Published',
          body: `Project "${p.name}" has just been published.`,
          is_read: false,
          status: 'Sent'
        }));
        
        // Add budget notification if applicable
        if (p.requested_budget !== null) {
          boardMembers.forEach(b => {
            notifications.push({
              user_id: b.user_id,
              channel: 'InApp',
              event_type: 'General',
              subject: 'Budget Review Requested',
              body: `Project "${p.name}" has requested a budget of $${p.requested_budget}.`,
              is_read: false,
              status: 'Sent'
            });
          });
        }
        
        await supabaseAdmin.from('notifications').insert(notifications);
      }
    })();

    // 8. Return Success (Even if Slack failed, the publish operation succeeded)
    return NextResponse.json({
      data: updatedProject as Project,
      error: null
    });

  } catch (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
