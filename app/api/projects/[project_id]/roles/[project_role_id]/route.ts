/**
 * app/api/projects/[project_id]/roles/[project_role_id]/route.ts
 * PATCH /api/projects/:project_id/roles/:project_role_id
 * DELETE /api/projects/:project_id/roles/:project_role_id
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { ProjectRole } from '@/types/project-roles';

type DeleteRoleResponse = {
  deleted: boolean;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ project_id: string; project_role_id: string }> }
): Promise<NextResponse<ApiResponse<ProjectRole>>> {
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

    const { project_id: projectId, project_role_id: projectRoleId } = await params;

    // 2. Fetch Project (permissions + closed check)
    const { data: p, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('created_by, closed_at')
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
        { data: null, error: { code: 'CONFLICT', message: 'Cannot modify roles on a closed project' } },
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
          { data: null, error: { code: 'FORBIDDEN', message: 'Cannot modify this project' } },
          { status: 403 }
        );
      }
    }

    // 4. Fetch existing role — confirm it belongs to this project
    const { data: existingRole, error: roleError } = await supabaseAdmin
      .from('project_roles')
      .select('capacity')
      .eq('project_role_id', projectRoleId)
      .eq('project_id', projectId) // Ensures role belongs to project
      .maybeSingle();

    if (roleError || !existingRole) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Role not found' } },
        { status: 404 }
      );
    }

    // 5. Parse & Validate Body
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' } },
        { status: 400 }
      );
    }

    const allowedUpdates: Partial<ProjectRole> = {};
    if (body.role_name !== undefined) allowedUpdates.role_name = body.role_name;
    if (body.description !== undefined) allowedUpdates.description = body.description;
    if (body.capacity !== undefined) allowedUpdates.capacity = body.capacity;

    // 6. Capacity-reduction check: new capacity must be >= approved count for this role
    if (allowedUpdates.capacity !== undefined && allowedUpdates.capacity < existingRole.capacity) {
      const { count: assignedCount, error: countError } = await supabaseAdmin
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .eq('project_role_id', projectRoleId)
        .eq('status', 'Approved');

      if (countError) {
        return NextResponse.json(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'Failed to check approved volunteer count' } },
          { status: 400 }
        );
      }

      if (assignedCount !== null && allowedUpdates.capacity < assignedCount) {
        return NextResponse.json(
          {
            data: null,
            error: {
              code: 'CONFLICT',
              message: `Cannot reduce capacity below ${assignedCount} — that many volunteers are already approved for this role.`
            }
          },
          { status: 409 }
        );
      }
    }

    // 7. Perform Update
    const { data: updatedRole, error: updateError } = await supabaseAdmin
      .from('project_roles')
      .update(allowedUpdates)
      .eq('project_role_id', projectRoleId)
      .select()
      .single();

    if (updateError || !updatedRole) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: updateError?.message || 'Update failed' } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: updatedRole as ProjectRole,
      error: null
    });

  } catch (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ project_id: string; project_role_id: string }> }
): Promise<NextResponse<ApiResponse<DeleteRoleResponse>>> {
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

    const { project_id: projectId, project_role_id: projectRoleId } = await params;

    // 2. Fetch Project (permissions + closed + published check)
    const { data: p, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('created_by, closed_at, is_published')
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
        { data: null, error: { code: 'CONFLICT', message: 'Cannot modify roles on a closed project' } },
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
          { data: null, error: { code: 'FORBIDDEN', message: 'Cannot modify this project' } },
          { status: 403 }
        );
      }
    }

    // 4. Confirm role belongs to this project
    const { data: existingRole, error: roleError } = await supabaseAdmin
      .from('project_roles')
      .select('project_role_id')
      .eq('project_role_id', projectRoleId)
      .eq('project_id', projectId) // Ensures role belongs to project
      .maybeSingle();

    if (roleError || !existingRole) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Role not found' } },
        { status: 404 }
      );
    }

    // 5. Hard block: Cannot delete if any approved volunteers have this role
    const { count: assignedCount, error: assignedError } = await supabaseAdmin
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('project_role_id', projectRoleId)
      .eq('status', 'Approved');

    if (assignedError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Failed to check approved volunteers for this role' } },
        { status: 400 }
      );
    }

    if (assignedCount !== null && assignedCount > 0) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'CONFLICT',
            message: `Cannot delete this role — ${assignedCount} approved volunteer(s) are currently assigned to it.`
          }
        },
        { status: 409 }
      );
    }

    // 6. Cannot delete last role on a published project
    if (p.is_published) {
      const { count: roleCount, error: countError } = await supabaseAdmin
        .from('project_roles')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId);

      if (countError) {
        return NextResponse.json(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'Failed to count remaining roles' } },
          { status: 400 }
        );
      }

      if (roleCount !== null && roleCount <= 1) {
        return NextResponse.json(
          {
            data: null,
            error: {
              code: 'CONFLICT',
              message: 'Cannot delete the last role on a published project. Add another role first or close the project.'
            }
          },
          { status: 409 }
        );
      }
    }

    // 7. Delete Role
    const { error: deleteError } = await supabaseAdmin
      .from('project_roles')
      .delete()
      .eq('project_role_id', projectRoleId);

    if (deleteError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: deleteError.message } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: { deleted: true },
      error: null
    });

  } catch (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
