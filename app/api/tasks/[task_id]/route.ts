/**
 * app/api/tasks/[task_id]/route.ts
 * PATCH /api/tasks/:task_id
 * DELETE /api/tasks/:task_id
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Task, TaskStatus } from '@/types/tasks';

type DeleteTaskResponse = {
  deleted: boolean;
};

type PatchTaskInput = {
  assigned_to?: string | null;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  due_date?: string | null;
};

type TaskWithProjectOwner = Task & {
  projects: {
    created_by: string;
  } | null;
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

function isPatchTaskInput(value: unknown): value is PatchTaskInput {
  if (!value || typeof value !== 'object') return false;

  const body = value as Record<string, unknown>;
  return (
    (body.assigned_to === undefined || body.assigned_to === null || typeof body.assigned_to === 'string') &&
    (body.title === undefined || typeof body.title === 'string') &&
    (body.description === undefined || body.description === null || typeof body.description === 'string') &&
    (body.status === undefined || isTaskStatus(body.status)) &&
    (body.due_date === undefined || body.due_date === null || typeof body.due_date === 'string')
  );
}

function changedKeys(body: PatchTaskInput): string[] {
  return Object.entries(body)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

function buildLeadBoardUpdates(body: PatchTaskInput): Partial<Task> {
  const updates: Partial<Task> = {};

  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) updates.status = body.status;
  if (body.due_date !== undefined) updates.due_date = body.due_date;

  return updates;
}

async function fetchTask(taskId: string): Promise<TaskWithProjectOwner | null> {
  const { data } = await supabaseAdmin
    .from('tasks')
    .select(`
      task_id,
      project_id,
      assigned_to,
      created_by,
      title,
      description,
      status,
      due_date,
      created_at,
      updated_at,
      projects (
        created_by
      )
    `)
    .eq('task_id', taskId)
    .maybeSingle<TaskWithProjectOwner>();

  return data;
}

async function assigneeIsApproved(projectId: string, assigneeId: string | null | undefined): Promise<boolean> {
  if (!assigneeId) return true;

  const { data } = await supabaseAdmin
    .from('applications')
    .select('application_id')
    .eq('project_id', projectId)
    .eq('user_id', assigneeId)
    .eq('status', 'Approved')
    .maybeSingle<{ application_id: string }>();

  return Boolean(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ task_id: string }> }
): Promise<NextResponse<ApiResponse<Task>>> {
  try {
    const { task_id: taskId } = await params;

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

    const body: unknown = await req.json().catch(() => null);
    if (!isPatchTaskInput(body)) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid task update body' } },
        { status: 400 }
      );
    }

    const task = await fetchTask(taskId);
    if (!task) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } },
        { status: 404 }
      );
    }

    const { data: roleData } = await supabaseAdmin
      .from('users')
      .select('org_role_id')
      .eq('user_id', claims.sub)
      .maybeSingle();

    const orgRoleId = roleData?.org_role_id ?? 1;

    const isBoard = orgRoleId === 3;
    const isLeadOnProject = orgRoleId === 2 && task.projects?.created_by === claims.sub;
    const isAssignedMember = task.assigned_to === claims.sub;

    if (!isBoard && !isLeadOnProject && !isAssignedMember) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Cannot update this task' } },
        { status: 403 }
      );
    }

    let updates: Partial<Task>;

    if (!isBoard && !isLeadOnProject) {
      const keys = changedKeys(body);
      if (keys.some((key) => key !== 'status')) {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Members can only update task status' } },
          { status: 403 }
        );
      }

      if (!body.status) {
        return NextResponse.json(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'status is required for member task updates' } },
          { status: 400 }
        );
      }

      if (task.status === 'Awaiting Input') {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Members cannot unblock tasks awaiting input' } },
          { status: 403 }
        );
      }

      if (body.status === 'Awaiting Input') {
        return NextResponse.json(
          { data: null, error: { code: 'FORBIDDEN', message: 'Members cannot set tasks to Awaiting Input' } },
          { status: 403 }
        );
      }

      updates = { status: body.status };
    } else {
      if (!(await assigneeIsApproved(task.project_id, body.assigned_to))) {
        return NextResponse.json(
          { data: null, error: { code: 'VALIDATION_ERROR', message: 'assigned_to must be an approved member on the project' } },
          { status: 400 }
        );
      }

      updates = buildLeadBoardUpdates(body);
    }

    const { data: updatedTask, error: updateError } = await supabaseAdmin
      .from('tasks')
      .update(updates)
      .eq('task_id', taskId)
      .select()
      .single<Task>();

    if (updateError || !updatedTask) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: updateError?.message || 'Failed to update task' } },
        { status: 400 }
      );
    }

    if (body.status && body.status !== task.status && task.created_by !== claims.sub) {
      await supabaseAdmin
        .from('notifications')
        .insert({
          user_id: task.created_by,
          sent_to_email: null,
          sent_to_slack_user_id: null,
          channel: 'InApp',
          event_type: 'Task Updated',
          subject: null,
          body: `Task status updated: ${updatedTask.title}`,
          status: 'Sent',
        });
    }

    return NextResponse.json({ data: updatedTask, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ task_id: string }> }
): Promise<NextResponse<ApiResponse<DeleteTaskResponse>>> {
  try {
    const { task_id: taskId } = await params;

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

    const task = await fetchTask(taskId);
    if (!task) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Task not found' } },
        { status: 404 }
      );
    }

    const { data: roleData } = await supabaseAdmin
      .from('users')
      .select('org_role_id')
      .eq('user_id', claims.sub)
      .maybeSingle();

    const orgRoleId = roleData?.org_role_id ?? 1;

    const isBoard = orgRoleId === 3;
    const isLeadOnProject = orgRoleId === 2 && task.projects?.created_by === claims.sub;

    if (!isBoard && !isLeadOnProject) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Cannot delete this task' } },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabaseAdmin
      .from('tasks')
      .delete()
      .eq('task_id', taskId);

    if (deleteError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: deleteError.message } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: { deleted: true },
      error: null,
    });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
