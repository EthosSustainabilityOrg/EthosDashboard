'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Task } from '@/types/tasks';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type ProjectTask = Task & {
  project_name?: string;
  assignee_name: string;
  created_by_name?: string;
};

type TaskDetailSheetProps = {
  task: ProjectTask;
  currentUserId: string;
  isLead: boolean;
  isBoard: boolean;
  onClose: () => void;
  onStatusUpdated: (task: ProjectTask) => void;
};

const statusOptions = [
  { value: 'Not Started', label: 'Not Started' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Awaiting Input', label: 'Awaiting Input' },
  { value: 'Complete', label: 'Complete' },
];

function formatDateTime(value: string) {
  return formatOrgDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(value: string | null) {
  if (!value) return null;
  return formatOrgDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function TaskDetailSheet({
  task,
  currentUserId,
  isLead,
  isBoard,
  onClose,
  onStatusUpdated,
}: TaskDetailSheetProps) {
  const [status, setStatus] = useState(task.status);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const canUpdateStatus = task.assigned_to === currentUserId || isLead || isBoard;
  const memberBlocked = task.assigned_to === currentUserId && !isLead && !isBoard && task.status === 'Awaiting Input';

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  async function updateStatus(nextStatus: string) {
    setError('');
    setIsSaving(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(`/api/tasks/${task.task_id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ status: nextStatus }),
    });

    const body = (await response.json()) as ApiResponse<ProjectTask>;

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Could not update task status.');
      setIsSaving(false);
      return;
    }

    setStatus(body.data.status);
    onStatusUpdated({
      ...task,
      ...body.data,
      assignee_name: body.data.assignee_name ?? task.assignee_name,
      created_by_name: body.data.created_by_name ?? task.created_by_name,
    });
    setIsSaving(false);
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-espresso/20"
        aria-label="Close task details"
        onClick={onClose}
      />

      <section className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 className="text-2xl font-bold text-espresso">{task.title}</h2>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>

          {task.description ? (
            <p className="mb-6 leading-7 text-espresso">{task.description}</p>
          ) : null}

          <dl className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="font-semibold text-espresso">Assigned to</dt>
              <dd className="mt-1 text-warm-gray">{task.assignee_name}</dd>
            </div>
            <div>
              <dt className="font-semibold text-espresso">Created by</dt>
              <dd className="mt-1 text-warm-gray">{task.created_by_name ?? 'Project Lead'}</dd>
            </div>
            {task.due_date ? (
              <div>
                <dt className="font-semibold text-espresso">Due date</dt>
                <dd className="mt-1 text-warm-gray">{formatDate(task.due_date)}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-6">
            <h3 className="mb-3 font-semibold text-espresso">Status</h3>
            {memberBlocked ? (
              <p className="rounded-lg bg-peach-light p-4 text-sm text-espresso">
                This task needs input from your Project Lead before you can continue.
              </p>
            ) : canUpdateStatus ? (
              <Select
                value={status}
                onChange={(value) => {
                  setStatus(value as Task['status']);
                  void updateStatus(value);
                }}
                options={statusOptions}
                disabled={isSaving}
                className="max-w-xs"
              />
            ) : (
              <p className="text-sm text-warm-gray">{status}</p>
            )}

            {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
          </div>

          <div className="mt-6 text-xs text-warm-gray">
            <p>Created {formatDateTime(task.created_at)}</p>
            <p className="mt-1">Updated {formatDateTime(task.updated_at)}</p>
          </div>
        </div>
      </section>
    </>
  );
}
