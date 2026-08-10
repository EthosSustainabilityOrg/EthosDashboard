'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Task, TaskStatus } from '@/types/tasks';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

type TeamMember = {
  user_id: string;
  first_name: string;
  last_name: string;
};

type ProjectRoleInfo = {
  project_role_id: string;
  role_name: string;
  description: string | null;
  capacity: number;
};

type NewTaskSheetProps = {
  projectId: string;
  projectRoles: ProjectRoleInfo[];
  teamMembers: TeamMember[];
  onClose: () => void;
  onCreated: (task: Task) => void;
};

const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: 'Not Started', label: 'Not Started' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Awaiting Input', label: 'Awaiting Input' },
  { value: 'Complete', label: 'Complete' },
];

type TaskCreateResponse = {
  data: Task | { task: Task } | null;
  error: { message: string } | null;
};

function extractTask(data: TaskCreateResponse['data']): Task | null {
  if (!data) return null;
  if ('task_id' in data) return data;
  return data.task;
}

export function NewTaskSheet(props: NewTaskSheetProps) {
  const { projectId, teamMembers, onClose, onCreated } = props;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [status, setStatus] = useState<TaskStatus>('Not Started');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  async function getAuthHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        project_id: projectId,
        assigned_to: assignedTo || null,
        title: title.trim(),
        description: description.trim() || null,
        status,
        due_date: dueDate || null,
      }),
    });

    const body = (await response.json()) as TaskCreateResponse;
    const task = extractTask(body.data);

    setIsSaving(false);

    if (!response.ok || body.error || !task) {
      setError(body.error?.message ?? 'Unable to create task.');
      return;
    }

    onCreated(task);
    onClose();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close new task sheet"
        className="fixed inset-0 z-40 bg-espresso/20"
        onClick={onClose}
      />
      <section className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold text-espresso">New Task</h2>
            <button type="button" className="text-2xl leading-none text-warm-gray" onClick={onClose}>
              x
            </button>
          </div>

          <div className="space-y-4">
            <Input label="Title" value={title} onChange={setTitle} name="task-title" required />
            <Textarea
              label="Description"
              value={description}
              onChange={setDescription}
              name="task-description"
              rows={4}
            />
            <Select
              label="Assign to"
              value={assignedTo}
              onChange={setAssignedTo}
              name="task-assignee"
              options={[
                { value: '', label: 'Unassigned' },
                ...teamMembers.map((member) => ({
                  value: member.user_id,
                  label: `${member.first_name} ${member.last_name}`,
                })),
              ]}
            />
            <Select
              label="Status"
              value={status}
              onChange={(value) => setStatus(value as TaskStatus)}
              name="task-status"
              options={statusOptions}
            />
            <Input label="Due date" type="date" value={dueDate} onChange={setDueDate} name="task-due-date" />

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? 'Creating...' : 'Create task'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
