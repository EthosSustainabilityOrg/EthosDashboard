/**
 * app/api/applications/route.ts
 * GET /api/applications
 * POST /api/applications
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Application, ApplicationStatus } from '@/types/applications';
import type { JwtClaims } from '@/types/auth';

type ApplicationListItem = Application & {
  applicant_name: string;
  project_name: string;
  project_role_name: string | null;
};

type ApplicationsResponse = {
  applications: ApplicationListItem[];
  total: number;
  page: number;
  per_page: number;
};

type RawApplicationRow = Application & {
  users: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
  projects: { name: string; created_by: string } | { name: string; created_by: string }[] | null;
  project_roles: { role_name: string } | { role_name: string }[] | null;
};

type CreateApplicationInput = {
  project_id: string;
  why_join: string;
  experience?: string | null;
  availability_notes?: string | null;
};

type ProjectForApplication = {
  project_id: string;
  name: string;
  created_by: string;
  project_type_id: number;
  is_published: boolean;
  closed_at: string | null;
};

type ExistingApplicationRow = {
  application_id: string;
  status: ApplicationStatus;
};

type RawUserApp = {
  application_id: string;
  project_id: string;
  status: ApplicationStatus;
  projects: { project_type_id: number } | { project_type_id: number }[] | null;
};

type AuthContext = {
  claims: JwtClaims;
};

const applicationStatuses: ApplicationStatus[] = ['Pending', 'Approved', 'Rejected', 'Withdrawn'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstRow<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value ?? null;
}

function isApplicationStatus(value: string): value is ApplicationStatus {
  return applicationStatuses.includes(value as ApplicationStatus);
}

function isHqProjectType(projectTypeId: number) {
  return projectTypeId >= 10 && projectTypeId <= 16;
}

function parsePositiveInteger(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function parseCreateApplicationInput(value: unknown): CreateApplicationInput | null {
  if (!isRecord(value)) return null;

  const projectId = value.project_id;
  const whyJoin = value.why_join;
  const experience = value.experience;
  const availabilityNotes = value.availability_notes;

  if (typeof projectId !== 'string' || !projectId.trim()) return null;
  if (typeof whyJoin !== 'string' || !whyJoin.trim()) return null;

  return {
    project_id: projectId,
    why_join: whyJoin.trim(),
    experience: typeof experience === 'string' && experience.trim() ? experience.trim() : null,
    availability_notes:
      typeof availabilityNotes === 'string' && availabilityNotes.trim()
        ? availabilityNotes.trim()
        : null,
  };
}

async function requireAuth(req: NextRequest): Promise<AuthContext | NextResponse<ApiResponse<never>>> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
      { status: 401 },
    );
  }

  const token = authHeader.split(' ')[1];
  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
      { status: 401 },
    );
  }

  const claims = extractClaims(token);

  if (!claims?.sub) {
    return NextResponse.json(
      { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token payload' } },
      { status: 401 },
    );
  }

  return { claims };
}

function mapApplication(row: RawApplicationRow): ApplicationListItem {
  const applicant = firstRow(row.users);
  const project = firstRow(row.projects);
  const projectRole = firstRow(row.project_roles);

  return {
    application_id: row.application_id,
    user_id: row.user_id,
    applicant_name: applicant ? `${applicant.first_name} ${applicant.last_name}` : 'Unknown applicant',
    project_id: row.project_id,
    project_name: project?.name ?? 'Unknown project',
    status: row.status,
    project_role_id: row.project_role_id,
    project_role_name: projectRole?.role_name ?? null,
    why_join: row.why_join,
    experience: row.experience,
    availability_notes: row.availability_notes,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    rejection_reason: row.rejection_reason,
    submitted_at: row.submitted_at,
    updated_at: row.updated_at,
  };
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<ApplicationsResponse>>> {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { claims } = auth;

    const { data: roleData } = await supabaseAdmin
      .from('users')
      .select('org_role_id')
      .eq('user_id', claims.sub)
      .maybeSingle();

    const orgRoleId = roleData?.org_role_id ?? 1;

    const url = new URL(req.url);
    const projectId = url.searchParams.get('project_id');
    const status = url.searchParams.get('status');
    const userId = url.searchParams.get('user_id');
    const page = parsePositiveInteger(url.searchParams.get('page'), 1, 10_000);
    const perPage = parsePositiveInteger(url.searchParams.get('per_page'), 20, 50);

    if (status && !isApplicationStatus(status)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid application status' } },
        { status: 400 },
      );
    }

    if (userId && orgRoleId !== 3) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Only Board can filter applications by user_id' } },
        { status: 403 },
      );
    }

    let query = supabaseAdmin
      .from('applications')
      .select(
        `
          application_id,
          user_id,
          project_id,
          status,
          project_role_id,
          why_join,
          experience,
          availability_notes,
          reviewed_by,
          reviewed_at,
          rejection_reason,
          submitted_at,
          updated_at,
          users!inner ( first_name, last_name ),
          projects!inner ( name, created_by ),
          project_roles ( role_name )
        `,
        { count: 'exact' },
      );

    if (orgRoleId === 1) {
      query = query.eq('user_id', claims.sub);
    } else if (orgRoleId === 2) {
      const { data: ownProjects, error: projectsError } = await supabaseAdmin
        .from('projects')
        .select('project_id')
        .eq('created_by', claims.sub);

      if (projectsError) {
        return NextResponse.json(
          { data: null, error: { code: 'VALIDATION_ERROR', message: projectsError.message } },
          { status: 400 },
        );
      }

      const ownProjectIds = (ownProjects ?? []).map((project) => project.project_id);

      if (ownProjectIds.length === 0) {
        return NextResponse.json({
          data: {
            applications: [],
            total: 0,
            page,
            per_page: perPage,
          },
          error: null,
        });
      }

      query = query.in('project_id', ownProjectIds);
    }

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data, error, count } = await query
      .order('submitted_at', { ascending: false })
      .range(from, to)
      .returns<RawApplicationRow[]>();

    if (error) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: error.message } },
        { status: 400 },
      );
    }

    return NextResponse.json({
      data: {
        applications: (data ?? []).map(mapApplication),
        total: count ?? 0,
        page,
        per_page: perPage,
      },
      error: null,
    });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Application>>> {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { claims } = auth;
    const body = parseCreateApplicationInput(await req.json().catch(() => null));

    if (!body) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Missing required application fields' } },
        { status: 400 },
      );
    }

    const { data: projectData, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('project_id, name, created_by, project_type_id, is_published, closed_at')
      .eq('project_id', body.project_id)
      .maybeSingle();

    const project = projectData as ProjectForApplication | null;

    if (projectError || !project) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 },
      );
    }

    if (!project.is_published || project.closed_at !== null) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Project is not accepting applications' } },
        { status: 400 },
      );
    }

    const { count: pendingCount, error: pendingError } = await supabaseAdmin
      .from('applications')
      .select('application_id', { count: 'exact', head: true })
      .eq('user_id', claims.sub)
      .eq('status', 'Pending');

    if (pendingError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: pendingError.message } },
        { status: 400 },
      );
    }

    if ((pendingCount ?? 0) >= 3) {
      return NextResponse.json(
        { data: null, error: { code: 'LIMIT_REACHED', message: 'You already have 3 pending applications' } },
        { status: 409 },
      );
    }

    const { data: approvedApplications, error: approvedError } = await supabaseAdmin
      .from('applications')
      .select('application_id, project_id, status, projects!inner ( project_type_id )')
      .eq('user_id', claims.sub)
      .eq('status', 'Approved')
      .returns<RawUserApp[]>();

    if (approvedError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: approvedError.message } },
        { status: 400 },
      );
    }

    const activeApplications = approvedApplications ?? [];

    if (activeApplications.length >= 3) {
      return NextResponse.json(
        { data: null, error: { code: 'LIMIT_REACHED', message: 'You already have 3 active projects' } },
        { status: 409 },
      );
    }

    const targetIsHq = isHqProjectType(project.project_type_id);
    const hasApprovedHqProject = activeApplications.some((application) => {
      const activeProject = firstRow(application.projects);
      return activeProject ? isHqProjectType(activeProject.project_type_id) : false;
    });

    if (hasApprovedHqProject && !targetIsHq) {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: 'HQ project members cannot join another project' } },
        { status: 409 },
      );
    }

    if (targetIsHq && activeApplications.length > 0) {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: 'HQ projects must be your only active project' } },
        { status: 409 },
      );
    }

    const { data: existingApplication, error: existingError } = await supabaseAdmin
      .from('applications')
      .select('application_id, status')
      .eq('user_id', claims.sub)
      .eq('project_id', body.project_id)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: existingError.message } },
        { status: 400 },
      );
    }

    const existing = existingApplication as ExistingApplicationRow | null;

    if (existing) {
      const message =
        existing.status === 'Rejected'
          ? 'You were already rejected from this project in the current cycle'
          : existing.status === 'Approved'
            ? 'You are already on this project'
            : 'You already applied to this project';

      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message } },
        { status: 409 },
      );
    }

    const { data: newApplication, error: insertError } = await supabaseAdmin
      .from('applications')
      .insert({
        user_id: claims.sub,
        project_id: body.project_id,
        status: 'Pending',
        why_join: body.why_join,
        experience: body.experience ?? null,
        availability_notes: body.availability_notes ?? null,
      })
      .select()
      .single();

    if (insertError || !newApplication) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: insertError?.message ?? 'Failed to submit application',
          },
        },
        { status: 400 },
      );
    }

    void supabaseAdmin.from('notifications').insert([
      {
        user_id: claims.sub,
        channel: 'InApp',
        event_type: 'Application Received',
        subject: 'Application Received',
        body: `Your application to ${project.name} was received.`,
        is_read: false,
        status: 'Sent',
      },
      {
        user_id: project.created_by,
        channel: 'InApp',
        event_type: 'Application Received',
        subject: 'Application Received',
        body: `A new application was received for ${project.name}.`,
        is_read: false,
        status: 'Sent',
      },
    ]);

    return NextResponse.json(
      {
        data: newApplication as Application,
        error: null,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 },
    );
  }
}
