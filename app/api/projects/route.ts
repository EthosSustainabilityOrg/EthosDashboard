/**
 * app/api/projects/route.ts
 * GET /api/projects
 * POST /api/projects
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { JwtClaims } from '@/types/auth';
import type { Project } from '@/types/projects';

type UpcomingShift = {
  shift_id: string;
  start_datetime: string;
  end_datetime: string;
};

type ProjectListItem = {
  project_id: string;
  name: string;
  type_name: string;
  chapter_name: string;
  is_hq: boolean;
  description: string;
  is_virtual: boolean;
  location: string | null;
  is_open_call: boolean;
  open_call_app_level: string | null;
  max_applications: number | null;
  spots_remaining: number | null;
  is_published: boolean;
  requested_budget: number | null;
  allocated_budget: number | null;
  slack_channel_id: string | null;
  upcoming_shift: UpcomingShift | null;
  created_at: string;
};

type RawProjectRow = {
  project_id: string;
  name: string;
  description: string;
  is_virtual: boolean;
  location: string | null;
  is_open_call: boolean;
  open_call_app_level: string | null;
  max_applications: number | null;
  is_published: boolean;
  requested_budget: number | null;
  allocated_budget: number | null;
  slack_channel_id: string | null;
  created_at: string;
  created_by: string;
  chapter_id: string;
  closed_at: string | null;
  chapters: { name: string; is_hq: boolean } | { name: string; is_hq: boolean }[];
  project_types: { type_name: string } | { type_name: string }[];
  shifts: UpcomingShift[];
};

type ProjectsResponse = {
  projects: ProjectListItem[];
  total: number;
  page: number;
  per_page: number;
};

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<ProjectsResponse>>> {
  try {
    // 1. Auth check — optional for this endpoint
    const authHeader = req.headers.get('authorization');
    let claims: JwtClaims | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (!authError && user) {
        claims = extractClaims(token);
      }
    }

    // 2. Parse Query Params
    const url = new URL(req.url);
    const chapterParam = url.searchParams.get('chapter_id');
    const typeParam = url.searchParams.get('type_id');
    const isOpenCallParam = url.searchParams.get('is_open_call');
    const search = url.searchParams.get('search');
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const perPage = Math.min(50, Math.max(1, parseInt(url.searchParams.get('per_page') || '20', 10)));

    // 3. Build Base Query
    let query = supabaseAdmin
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
        chapters!inner ( name, is_hq ),
        project_types!inner ( type_name ),
        shifts ( shift_id, start_datetime, end_datetime )
      `, { count: 'exact' });

    // 4. Enforce Scoping Rules
    // NOTE: claims.chapter_id and claims.sub come directly from the server-verified JWT.
    // They must never be replaced with user-supplied query parameters to ensure strict data scoping.
    if (!claims) {
      // Unauthenticated: Published only, never closed
      query = query.is('closed_at', null).eq('is_published', true);
      
    } else if (claims.org_role_id === 3) {
      // Board: All projects (no closed_at or is_published restrictions)
      
    } else if (claims.org_role_id === 2) {
      // Project Lead: Never closed. Own chapter published + Open calls published + Own unpublished drafts
      query = query.is('closed_at', null).or(
        `and(chapter_id.eq.${claims.chapter_id},is_published.eq.true),` +
        `and(is_open_call.eq.true,is_published.eq.true),` +
        `and(created_by.eq.${claims.sub},is_published.eq.false)`
      );
      
    } else {
      // Member: Never closed. Own chapter published + Open calls published
      query = query.is('closed_at', null).or(
        `and(chapter_id.eq.${claims.chapter_id},is_published.eq.true),` +
        `and(is_open_call.eq.true,is_published.eq.true)`
      );
    }

    // 5. Apply Query String Filters
    if (chapterParam) {
      query = query.eq('chapter_id', chapterParam);
    }
    
    if (typeParam) {
      const typeId = parseInt(typeParam, 10);
      if (!isNaN(typeId)) {
        query = query.eq('project_type_id', typeId);
      }
    }
    
    if (isOpenCallParam !== null) {
      query = query.eq('is_open_call', isOpenCallParam === 'true');
    }
    
    if (search) {
      // Uses the GIN index idx_projects_search from 006_projects.sql covering name + description
      query = query.textSearch('name || \' \' || description', search, {
        type: 'plain',
        config: 'english'
      });
      // Fallback if full-text search syntax fails during testing:
      // query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // 6. Paginate and Sort
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    query = query.range(from, to).order('created_at', { ascending: false });

    // Explicit type casting via returns() avoids `any` entirely
    const { data, error, count } = await query.returns<RawProjectRow[]>();

    if (error) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: error.message } },
        { status: 400 }
      );
    }

    // 7. Calculate spots_remaining
    let countsByProject: Record<string, number> = {};
    if (data && data.length > 0) {
      const projectIds = data.map(p => p.project_id);
      const { data: appCounts } = await supabaseAdmin
        .from('applications')
        .select('project_id')
        .in('project_id', projectIds)
        .eq('status', 'Approved');

      countsByProject = (appCounts || []).reduce<Record<string, number>>((acc, row) => {
        acc[row.project_id] = (acc[row.project_id] || 0) + 1;
        return acc;
      }, {});
    }

    // 8. Map to response shape
    const projects: ProjectListItem[] = (data || []).map((p) => {
      const chapterRow = Array.isArray(p.chapters) ? p.chapters[0] : p.chapters;
      const typeRow = Array.isArray(p.project_types) ? p.project_types[0] : p.project_types;
      
      const approvedCount = countsByProject[p.project_id] || 0;
      const spotsRemaining = p.max_applications !== null 
        ? Math.max(0, p.max_applications - approvedCount) 
        : null;

      // Find the next upcoming shift (soonest start_datetime in the future)
      const now = new Date().toISOString();
      const futureShifts = (p.shifts || [])
        .filter(s => s.start_datetime > now)
        .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

      const upcomingShift: UpcomingShift | null = futureShifts.length > 0
        ? {
            shift_id: futureShifts[0].shift_id,
            start_datetime: futureShifts[0].start_datetime,
            end_datetime: futureShifts[0].end_datetime
          }
        : null;

      return {
        project_id: p.project_id,
        name: p.name,
        type_name: typeRow?.type_name || '',
        chapter_name: chapterRow?.name || '',
        is_hq: chapterRow?.is_hq || false,
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
        upcoming_shift: upcomingShift,
        created_at: p.created_at
      };
    });

    return NextResponse.json({
      data: {
        projects,
        total: count || 0,
        page,
        per_page: perPage
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

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Project>>> {
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

    // 2. Enforce Scope: Project Lead or Board
    if (userData.org_role_id !== 2 && userData.org_role_id !== 3) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Project creation requires Project Lead or Board access' } },
        { status: 403 }
      );
    }

    // 3. Parse and Validate Body
    const body = await req.json().catch(() => null);
    if (!body || !body.name || !body.project_type_id || !body.chapter_id || typeof body.is_virtual !== 'boolean' || typeof body.is_open_call !== 'boolean') {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' } },
        { status: 400 }
      );
    }

    // 4. Enforce Chapter Scope
    if (userData.org_role_id === 2 && body.chapter_id !== userData.chapter_id) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Project Leads can only create projects for their own chapter' } },
        { status: 403 }
      );
    }

    // 5. Validate Constraints strictly before inserting
    if (!body.is_virtual && !body.location) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Location is required for non-virtual projects' } },
        { status: 400 }
      );
    }
    if (body.is_open_call && !body.open_call_app_level) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Application level is required for open calls' } },
        { status: 400 }
      );
    }

    // 6. Insert Draft Project
    const { data: newProject, error: insertError } = await supabaseAdmin
      .from('projects')
      .insert({
        name: body.name,
        project_type_id: body.project_type_id,
        chapter_id: body.chapter_id,
        description: body.description || '',
        is_virtual: body.is_virtual,
        location: body.is_virtual ? null : body.location,
        requested_budget: body.requested_budget || null,
        max_applications: body.max_applications,
        is_open_call: body.is_open_call,
        open_call_app_level: body.is_open_call ? body.open_call_app_level : null,
        is_published: false,
        created_by: user.id
      })
      .select()
      .single();

    if (insertError || !newProject) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: insertError?.message || 'Failed to create project' } },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { data: newProject as Project, error: null },
      { status: 201 }
    );

  } catch (error) {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
