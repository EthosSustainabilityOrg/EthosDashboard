/**
 * app/api/projects/[project_id]/route.ts
 * GET /api/projects/:project_id
 * PATCH /api/projects/:project_id
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Project } from '@/types/projects';

type ShiftInfo = {
  shift_id: string;
  start_datetime: string;
  end_datetime: string;
  location: string | null;
  capacity: number;
  notes: string | null;
};

type RoleInfo = {
  project_role_id: string;
  role_name: string;
  description: string | null;
  capacity: number;
};

type TeamMember = {
  user_id: string;
  first_name: string;
  last_name: string;
  project_role_name: string | null;
  is_lead: boolean;
};

type FileInfo = {
  file_id: string;
  file_name: string;
  file_type: string;
  drive_url: string;
  description: string | null;
  created_at: string;
};

type ProjectDetailResponse = {
  project_id: string;
  name: string;
  type_name: string;
  chapter_name: string;
  description: string;
  is_virtual: boolean;
  location: string | null;
  is_open_call: boolean;
  open_call_app_level: string | null;
  max_applications: number;
  spots_remaining: number | null;
  is_published: boolean;
  requested_budget: number | null;
  allocated_budget: number | null;
  slack_channel_id: string | null;
  shifts: ShiftInfo[];
  project_roles: RoleInfo[];
  team: TeamMember[];
  files: FileInfo[];
  created_at: string;
};

type RawTeamApp = {
  user_id: string;
  project_role_id: string | null;
  users: { first_name: string; last_name: string } | 
         { first_name: string; last_name: string }[];
  project_roles: { role_name: string } | 
                 { role_name: string }[] | null;
};


export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ project_id: string }> }
): Promise<NextResponse<ApiResponse<ProjectDetailResponse>>> {
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
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('org_role_id, chapter_id')
      .eq('user_id', user.id)
      .single();

    if (userError || !userData) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'User profile not found' } },
        { status: 401 }
      );
    }

    const { project_id: projectId } = await params;

    // 2. Fetch Project Data
    const { data: p, error: projectError } = await supabaseAdmin
      .from('projects')
      .select(`
        project_id,
        name,
        description,
        is_virtual,
        location,
        is_open_call,
        open_call_app_level,
        max_applications,
        is_published,
        requested_budget,
        allocated_budget,
        slack_channel_id,
        created_at,
        created_by,
        chapter_id,
        closed_at,
        chapters!inner ( name ),
        project_types!inner ( type_name ),
        shifts ( shift_id, start_datetime, end_datetime, location, capacity, notes ),
        project_roles ( project_role_id, role_name, description, capacity ),
        files ( file_id, file_name, file_type, drive_url, description, created_at )
      `)
      .eq('project_id', projectId)
      .maybeSingle();

    if (projectError || !p) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 }
      );
    }

    // 3. Enforce Visibility Scope
    if (userData.org_role_id !== 3) {
      if (p.closed_at !== null) {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Project is closed' } },
          { status: 403 }
        );
      }
      
      if (userData.org_role_id === 2) {
        // Project Lead
        const canView =
          p.chapter_id === userData.chapter_id ||
          p.is_open_call ||
          p.created_by === user.id;
        if (!canView) {
          return NextResponse.json(
            { data: null, error: { code: 'FORBIDDEN', message: 'Cannot view this project' } },
            { status: 403 }
          );
        }
        // If not published, only the creator can view
        if (!p.is_published && p.created_by !== user.id) {
          return NextResponse.json(
            { data: null, error: { code: 'FORBIDDEN', message: 'Cannot view unpublished projects' } },
            { status: 403 }
          );
        }
      } else {
        // Member
        const canView =
          (p.chapter_id === userData.chapter_id && p.is_published) ||
          (p.is_open_call && p.is_published);
        if (!canView) {
          return NextResponse.json(
            { data: null, error: { code: 'FORBIDDEN', message: 'Cannot view this project' } },
            { status: 403 }
          );
        }
      }
    }

    // 4. Fetch Approved Team Members (Applications)
    const { data: teamApps } = await supabaseAdmin
      .from('applications')
      .select(`
        user_id,
        project_role_id,
        users!inner ( first_name, last_name ),
        project_roles ( role_name )
      `)
      .eq('project_id', projectId)
      .eq('status', 'Approved')
      .returns<RawTeamApp[]>();

    const approvedCount = teamApps?.length || 0;
    const spotsRemaining = Math.max(0, p.max_applications - approvedCount);

    // Construct team array matching the spec exactly
    const team: TeamMember[] = (teamApps || []).map((app) => {
      const userRow = Array.isArray(app.users) ? app.users[0] : app.users;
      const roleRow = app.project_roles ? (Array.isArray(app.project_roles) ? app.project_roles[0] : app.project_roles) : null;
      
      return {
        user_id: app.user_id,
        first_name: userRow?.first_name || '',
        last_name: userRow?.last_name || '',
        project_role_name: roleRow?.role_name || null,
        is_lead: app.user_id === p.created_by
      };
    });

    // Extract names from joined tables safely
    const chapterRow = Array.isArray(p.chapters) ? p.chapters[0] : p.chapters;
    const typeRow = Array.isArray(p.project_types) ? p.project_types[0] : p.project_types;

    // 5. Construct Response
    const responseData: ProjectDetailResponse = {
      project_id: p.project_id,
      name: p.name,
      type_name: typeRow?.type_name || '',
      chapter_name: chapterRow?.name || '',
      description: p.description,
      is_virtual: p.is_virtual,
      location: p.location,
      is_open_call: p.is_open_call,
      open_call_app_level: p.open_call_app_level,
      max_applications: p.max_applications,
      spots_remaining: spotsRemaining,
      is_published: p.is_published,
      requested_budget: p.requested_budget,
      allocated_budget: p.allocated_budget,
      slack_channel_id: p.slack_channel_id,
      shifts: p.shifts as ShiftInfo[],
      project_roles: p.project_roles as RoleInfo[],
      team,
      files: p.files as FileInfo[],
      created_at: p.created_at
    };

    return NextResponse.json({
      data: responseData,
      error: null
    });

  } catch (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

    // 2. Fetch existing project to check permissions and closed_at
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('projects')
      .select('name, created_by, closed_at, requested_budget, is_virtual, location, is_open_call, open_call_app_level')
      .eq('project_id', projectId)
      .maybeSingle();

    if (existingError || !existing) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 }
      );
    }

    if (existing.closed_at !== null) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Cannot update a closed project' } },
        { status: 400 }
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
      if (orgRoleId !== 2 || existing.created_by !== claims.sub) {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Cannot update this project' } },
          { status: 403 }
        );
      }
    }

    // 4. Parse Body and filter allowed fields
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' } },
        { status: 400 }
      );
    }

    const allowedUpdates: Partial<Project> = {};
    if (body.description !== undefined) allowedUpdates.description = body.description;
    if (body.location !== undefined) allowedUpdates.location = body.location;
    if (body.requested_budget !== undefined) allowedUpdates.requested_budget = body.requested_budget;
    if (body.max_applications !== undefined) allowedUpdates.max_applications = body.max_applications;
    if (body.is_open_call !== undefined) allowedUpdates.is_open_call = body.is_open_call;
    if (body.open_call_app_level !== undefined) allowedUpdates.open_call_app_level = body.open_call_app_level;
    if (body.is_virtual !== undefined) allowedUpdates.is_virtual = body.is_virtual;

    // 5. Enforce Constraints against simulated final state
    const finalIsVirtual = allowedUpdates.is_virtual !== undefined ? allowedUpdates.is_virtual : existing.is_virtual;
    const finalLocation = allowedUpdates.location !== undefined ? allowedUpdates.location : existing.location;
    
    if (!finalIsVirtual && !finalLocation) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Location is required for non-virtual projects' } },
        { status: 400 }
      );
    }

    const finalIsOpenCall = allowedUpdates.is_open_call !== undefined ? allowedUpdates.is_open_call : existing.is_open_call;
    const finalAppLevel = allowedUpdates.open_call_app_level !== undefined ? allowedUpdates.open_call_app_level : existing.open_call_app_level;

    if (finalIsOpenCall && !finalAppLevel) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Application level is required for open calls' } },
        { status: 400 }
      );
    }
    if (!finalIsOpenCall) {
      allowedUpdates.open_call_app_level = null;
    }

    // 6. Perform Update
    const { data: updatedProject, error: updateError } = await supabaseAdmin
      .from('projects')
      .update(allowedUpdates)
      .eq('project_id', projectId)
      .select()
      .single();

    if (updateError || !updatedProject) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: updateError?.message || 'Update failed' } },
        { status: 400 }
      );
    }

    // 7. Check if requested_budget changed and notify Board
    if (allowedUpdates.requested_budget !== undefined && allowedUpdates.requested_budget !== existing.requested_budget) {
      const { data: boardMembers } = await supabaseAdmin
        .from('users')
        .select('user_id')
        .eq('org_role_id', 3);

      if (boardMembers) {
        const notifications = boardMembers.map(b => ({
          user_id: b.user_id,
          channel: 'InApp',
          event_type: 'General',
          subject: 'Project Budget Updated',
          body: `The requested budget for project "${existing.name}" has been updated to $${allowedUpdates.requested_budget}.`,
          is_read: false,
          status: 'Sent'
        }));
        void supabaseAdmin.from('notifications').insert(notifications);
      }
    }

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
