/**
 * app/api/projects/[project_id]/roles/route.ts
 * POST /api/projects/:project_id/roles
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { ProjectRole } from '@/types/project-roles';


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ project_id: string }> }
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

    const { project_id: projectId } = await params;

    // 2. Fetch Project
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

    // 4. Parse & Validate Body
    const body = await req.json().catch(() => null);
    if (!body || !body.role_name || typeof body.capacity !== 'number') {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields (role_name, capacity)' } },
        { status: 400 }
      );
    }

    if (body.capacity < 1) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Capacity must be at least 1' } },
        { status: 400 }
      );
    }

    // 5. Insert Role
    const { data: newRole, error: insertError } = await supabaseAdmin
      .from('project_roles')
      .insert({
        project_id: projectId,
        role_name: body.role_name,
        description: body.description || null,
        capacity: body.capacity
      })
      .select()
      .single();

    if (insertError || !newRole) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: insertError?.message || 'Failed to create role' } },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { data: newRole as ProjectRole, error: null },
      { status: 201 }
    );

  } catch (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
