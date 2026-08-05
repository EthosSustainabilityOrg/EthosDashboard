/**
 * app/api/projects/[project_id]/shifts/[shift_id]/route.ts
 * PATCH /api/projects/:project_id/shifts/:shift_id
 * DELETE /api/projects/:project_id/shifts/:shift_id
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Shift } from '@/types/shifts';

type DeleteShiftResponse = {
  deleted: boolean;
  warning?: string;
};


export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ project_id: string; shift_id: string }> }
): Promise<NextResponse<ApiResponse<Shift>>> {
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

    const { project_id: projectId, shift_id: shiftId } = await params;

    // 2. Fetch Project (check exists, permissions, closed status)
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
        { data: null, error: { code: 'CONFLICT', message: 'Cannot modify shifts on a closed project' } },
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

    // 4. Fetch existing shift to check past restriction
    const { data: existingShift, error: shiftError } = await supabaseAdmin
      .from('shifts')
      .select('start_datetime, end_datetime')
      .eq('shift_id', shiftId)
      .eq('project_id', projectId) // Ensures shift belongs to project
      .maybeSingle();

    if (shiftError || !existingShift) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Shift not found' } },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    if (existingShift.start_datetime < now) {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: 'Cannot edit a shift that has already started' } },
        { status: 409 }
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

    const allowedUpdates: Partial<Shift> = {};
    if (body.start_datetime !== undefined) allowedUpdates.start_datetime = body.start_datetime;
    if (body.end_datetime !== undefined) allowedUpdates.end_datetime = body.end_datetime;
    if (body.location !== undefined) allowedUpdates.location = body.location;
    if (body.capacity !== undefined) allowedUpdates.capacity = body.capacity;
    if (body.notes !== undefined) allowedUpdates.notes = body.notes;

    // Validate final start < end against the merged state
    const finalStart = allowedUpdates.start_datetime ?? existingShift.start_datetime;
    const finalEnd = allowedUpdates.end_datetime ?? existingShift.end_datetime;

    if (new Date(finalStart) >= new Date(finalEnd)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Start time must be before end time' } },
        { status: 400 }
      );
    }

    // 6. Perform Update
    const { data: updatedShift, error: updateError } = await supabaseAdmin
      .from('shifts')
      .update(allowedUpdates)
      .eq('shift_id', shiftId)
      .select()
      .single();

    if (updateError || !updatedShift) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: updateError?.message || 'Update failed' } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: updatedShift as Shift,
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
  { params }: { params: Promise<{ project_id: string; shift_id: string }> }
): Promise<NextResponse<ApiResponse<DeleteShiftResponse>>> {
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

    const { project_id: projectId, shift_id: shiftId } = await params;

    // 2. Fetch Project (check exists, permissions, published/closed status)
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
        { data: null, error: { code: 'CONFLICT', message: 'Cannot modify shifts on a closed project' } },
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

    // 4. Fetch Shift and Validate Past Restriction
    const { data: existingShift, error: shiftError } = await supabaseAdmin
      .from('shifts')
      .select('start_datetime')
      .eq('shift_id', shiftId)
      .eq('project_id', projectId) // Ensures shift belongs to project
      .maybeSingle();

    if (shiftError || !existingShift) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Shift not found' } },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    if (existingShift.start_datetime < now) {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: 'Cannot delete a shift that has already started' } },
        { status: 409 }
      );
    }

    // 5. Enforce Publish Rule: Cannot delete last shift if published
    if (p.is_published) {
      const { count: shiftCount, error: countError } = await supabaseAdmin
        .from('shifts')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId);

      if (countError) {
        return NextResponse.json(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'Failed to count remaining shifts' } },
          { status: 400 }
        );
      }

      if (shiftCount !== null && shiftCount <= 1) {
        return NextResponse.json(
          { data: null, error: { code: 'CONFLICT', message: 'Cannot delete the last shift on a published project. Add another shift first or close the project.' } },
          { status: 409 }
        );
      }
    }

    // 6. Delete Shift
    const { error: deleteError } = await supabaseAdmin
      .from('shifts')
      .delete()
      .eq('shift_id', shiftId);

    if (deleteError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: deleteError.message } },
        { status: 400 }
      );
    }

    // 7. Check for Approved Volunteers to return a warning
    const { count: approvedCount } = await supabaseAdmin
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'Approved');

    const warning = (approvedCount !== null && approvedCount > 0)
      ? 'Approved volunteers exist on this project. Deleting this shift might impact their participation. Consider notifying the team.'
      : undefined;

    return NextResponse.json({
      data: {
        deleted: true,
        ...(warning ? { warning } : {})
      },
      error: null
    });

  } catch (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
