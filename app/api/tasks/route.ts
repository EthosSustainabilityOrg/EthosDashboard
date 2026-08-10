/**
 * app/api/tasks/route.ts
 * GET /api/tasks
 * POST /api/tasks
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { Task, TaskStatus } from '@/types/tasks';

type TaskListItem = Task & {
  project_name: string | null;
  assignee_name: string | null;
};

type TasksResponse = PaginatedResponse<TaskListItem> & {
  tasks: TaskListItem[];
};

type CreateTaskInput = {
  project_id: string;
  assigned_to?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  due_date?: string | null;
};

type ProjectPermissionRow = {
  project_id: string;
  name: string;
  created_by: string;
};

type ApprovedApplicationRow = {
  project_id: string;
};

type UserNameRow = {
  user_id: string;
  first_name: string;
  last_name: string;
};

const TASK_STATUSES: readonly TaskStatus[] = [
  'Not Started',
  'In Progress',
  'Awaiting Input',
  'Complete',
];

function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && TASK_STATUSES.includes(value as TaskStatus);
}

function isUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function isCreateTaskInput(value: unknown): value is CreateTaskInput {
  if (!value || typeof value !== 'object') return false;

  const body = value as Record<string, unknown>;
  const statusIsValid = body.status === undefined || isTaskStatus(body.status);
  const assignedToIsValid =
    body.assigned_to === undefined || body.assigned_to === null || typeof body.assigned_to === 'string';

  return (
    typeof body.project_id === 'string' &&
    assignedToIsValid &&
    typeof body.title === 'string' &&
    body.title.trim().length > 0 &&
    statusIsValid
  );
}

async function getAuthorizedProjectIds(userId: string, roleId: number, projectId: string | null): Promise<string[] | null> {
  if (roleId === 3) return projectId ? [projectId] : null;

  if (roleId === 2) {
    const query = supabaseAdmin
      .from('projects')
      .select('project_id')
      .eq('created_by', userId);

    const { data } = projectId
      ? await query.eq('project_id', projectId).returns<Array<{ project_id: string }>>()
      : await query.returns<Array<{ project_id: string }>>();

    return data?.map((project) => project.project_id) ?? [];
  }

  if (!projectId) return [];

  const { data } = await supabaseAdmin
    .from('applications')
    .select('project_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('status', 'Approved')
    .returns<ApprovedApplicationRow[]>();

  return data?.map((application) => application.project_id) ?? [];
}

async function hydrateTasks(tasks: Task[]): Promise<TaskListItem[]> {
  if (tasks.length === 0) {
    return [];
  }

  const projectIds = Array.from(new Set(tasks.map((task) => task.project_id)));
  const assigneeIds = Array.from(new Set(tasks.flatMap((task) => task.assigned_to ? [task.assigned_to] : [])));

  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select('project_id, name')
    .in('project_id', projectIds)
    .returns<Array<{ project_id: string; name: string }>>();

  const { data: users } = assigneeIds.length > 0
    ? await supabaseAdmin
      .from('users')
      .select('user_id, first_name, last_name')
      .in('user_id', assigneeIds)
      .returns<UserNameRow[]>()
    : { data: [] as UserNameRow[] };

  const projectNames = new Map((projects ?? []).map((project) => [project.project_id, project.name]));
  const userNames = new Map((users ?? []).map((user) => [user.user_id, `${user.first_name} ${user.last_name}`]));

  return tasks.map((task) => ({
    ...task,
    project_name: projectNames.get(task.project_id) ?? null,
    assignee_name: task.assigned_to ? userNames.get(task.assigned_to) ?? null : null,
  }));
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<TasksResponse>>> {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    const claims = extractClaims(token);

    if (authError || !user || !claims?.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    const { data: roleData } = await supabaseAdmin
      .from('users')
      .select('org_role_id')
      .eq('user_id', claims.sub)
      .maybeSingle();

    const orgRoleId = roleData?.org_role_id ?? 1;

    const searchParams = req.nextUrl.searchParams;
    const projectId = searchParams.get('project_id');
    const assignedTo = searchParams.get('assigned_to');
    const status = searchParams.get('status');
    const page = parsePositiveInt(searchParams.get('page'), 1, 1000);
    const perPage = parsePositiveInt(searchParams.get('per_page'), 50, 100);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    if (projectId !== null && !isUuid(projectId)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid project_id' } },
        { status: 400 }
      );
    }

    if (assignedTo !== null && !isUuid(assignedTo)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid assigned_to' } },
        { status: 400 }
      );
    }

    if (status !== null && !isTaskStatus(status)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid status' } },
        { status: 400 }
      );
    }

    if (orgRoleId === 1 && !projectId) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Members must provide project_id' } },
        { status: 403 }
      );
    }

    if (orgRoleId === 1 && assignedTo && assignedTo !== claims.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Members can only filter assigned_to by themselves' } },
        { status: 403 }
      );
    }

    const authorizedProjectIds = await getAuthorizedProjectIds(claims.sub, orgRoleId, projectId);

    if (authorizedProjectIds !== null && authorizedProjectIds.length === 0) {
      return NextResponse.json({
        data: { items: [], tasks: [], total: 0, page, per_page: perPage },
        error: null,
      });
    }

    let query = supabaseAdmin
      .from('tasks')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (authorizedProjectIds !== null) query = query.in('project_id', authorizedProjectIds);
    if (assignedTo) query = query.eq('assigned_to', assignedTo);
    if (status) query = query.eq('status', status);

    const { data: tasks, error, count } = await query.returns<Task[]>();

    if (error) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: error.message } },
        { status: 400 }
      );
    }

    const hydratedTasks = await hydrateTasks(tasks ?? []);

    return NextResponse.json({
      data: {
        items: hydratedTasks,
        tasks: hydratedTasks,
        total: count ?? hydratedTasks.length,
        page,
        per_page: perPage,
      },
      error: null,
    });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Task>>> {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    const claims = extractClaims(token);

    if (authError || !user || !claims?.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    const { data: roleData } = await supabaseAdmin
      .from('users')
      .select('org_role_id')
      .eq('user_id', claims.sub)
      .maybeSingle();

    const orgRoleId = roleData?.org_role_id ?? 1;

    if (orgRoleId !== 2 && orgRoleId !== 3) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Only Project Leads and Board can create tasks' } },
        { status: 403 }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    if (!isCreateTaskInput(body)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'A title is required to create a task' } },
        { status: 400 }
      );
    }

    const assignedTo = body.assigned_to ?? null;

    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('project_id, name, created_by')
      .eq('project_id', body.project_id)
      .maybeSingle<ProjectPermissionRow>();

    if (!project) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 }
      );
    }

    if (orgRoleId === 2 && project.created_by !== claims.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Cannot create tasks for this project' } },
        { status: 403 }
      );
    }

    if (assignedTo) {
      const { data: approvedMember } = await supabaseAdmin
        .from('applications')
        .select('application_id')
        .eq('project_id', body.project_id)
        .eq('user_id', assignedTo)
        .eq('status', 'Approved')
        .maybeSingle<{ application_id: string }>();

      if (!approvedMember) {
        return NextResponse.json(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'assigned_to must be an approved member on the project' } },
          { status: 400 }
        );
      }
    }

    const { data: task, error: insertError } = await supabaseAdmin
      .from('tasks')
      .insert({
        project_id: body.project_id,
        assigned_to: assignedTo,
        created_by: claims.sub,
        title: body.title.trim(),
        description: body.description ?? null,
        status: body.status ?? 'Not Started',
        due_date: body.due_date ?? null,
      })
      .select()
      .single<Task>();

    if (insertError || !task) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: insertError?.message || 'Failed to create task' } },
        { status: 400 }
      );
    }

    if (assignedTo) {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: assignedTo,
          sent_to_email: null,
          sent_to_slack_user_id: null,
          channel: 'InApp',
          event_type: 'Task Assigned',
          subject: null,
          body: `You were assigned a task for ${project.name}: ${task.title}`,
          status: 'Sent',
        });
    }

    return NextResponse.json({ data: task, error: null }, { status: 201 });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
