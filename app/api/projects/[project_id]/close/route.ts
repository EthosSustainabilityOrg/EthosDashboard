/**
 * app/api/projects/[project_id]/close/route.ts
 * POST /api/projects/:project_id/close
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
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

    // 2. Fetch Project
    const { data: p, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('name, created_by, closed_at')
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
        { data: null, error: { code: 'CONFLICT', message: 'Project is already closed' } },
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
          { data: null, error: { code: 'FORBIDDEN', message: 'Cannot close this project' } },
          { status: 403 }
        );
      }
    }

    // 4. Find all Pending applications to reject
    const { data: pendingApps } = await supabaseAdmin
      .from('applications')
      .select('application_id, user_id')
      .eq('project_id', projectId)
      .eq('status', 'Pending');

    // 5. Update Project (closed_at = now, is_published = false, is_open_call = false)
    const { data: closedProject, error: updateError } = await supabaseAdmin
      .from('projects')
      .update({
        is_published: false,
        is_open_call: false,
        closed_at: new Date().toISOString()
      })
      .eq('project_id', projectId)
      .select()
      .single();

    if (updateError || !closedProject) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: updateError?.message || 'Failed to close project' } },
        { status: 400 }
      );
    }

    // 6. Reject pending applications and notify (fire-and-forget)
    if (pendingApps && pendingApps.length > 0) {
      void (async () => {
        const appIds = pendingApps.map(a => a.application_id);
        
        // Bulk reject
        await supabaseAdmin
          .from('applications')
          .update({ 
            status: 'Rejected', 
            reviewed_by: claims.sub, 
            reviewed_at: new Date().toISOString() 
          })
          .in('application_id', appIds);

        // Notify applicants
        const notifications = pendingApps.map(app => ({
          user_id: app.user_id,
          channel: 'InApp',
          event_type: 'Application Rejected',
          subject: 'Application Status Update',
          body: `Your application to "${p.name}" has been rejected because the project has been closed.`,
          is_read: false,
          status: 'Sent'
        }));
        
        await supabaseAdmin.from('notifications').insert(notifications);
      })();
    }

    return NextResponse.json({
      data: closedProject as Project,
      error: null
    });

  } catch (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
