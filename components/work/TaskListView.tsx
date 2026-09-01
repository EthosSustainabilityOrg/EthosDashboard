'use client';

import type { Task } from '@/types/tasks';
import { Badge } from '@/components/ui/Badge';
import { Tag } from '@/components/ui/Tag';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type GroupBy = 'project' | 'status' | 'due_date';
type OrderBy = 'due_date' | 'updated' | 'alpha';

type WorkTask = Task & {
  project_name: string;
  assignee_name: string;
};

type TaskListViewProps = {
  tasks: WorkTask[];
  groupBy: GroupBy;
  orderBy: OrderBy;
};

function statusVariant(status: Task['status']) {
  if (status === 'Complete') return 'success';
  if (status === 'Awaiting Input') return 'warning';
  if (status === 'In Progress') return 'info';
  return 'neutral';
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

function formatDate(value: string | null) {
  if (!value) return 'No due date';
  return formatOrgDate(new Date(value), {
    month: 'short',
    day: 'numeric',
  });
}

function groupLabel(task: WorkTask, groupBy: GroupBy) {
  if (groupBy === 'project') return task.project_name;
  if (groupBy === 'status') return task.status;
  return task.due_date ? formatDate(task.due_date) : 'No due date';
}

function sortTasks(tasks: WorkTask[], orderBy: OrderBy) {
  return [...tasks].sort((a, b) => {
    if (a.status === 'Complete' && b.status !== 'Complete') return 1;
    if (a.status !== 'Complete' && b.status === 'Complete') return -1;

    if (orderBy === 'alpha') return a.title.localeCompare(b.title);
    if (orderBy === 'updated') return b.updated_at.localeCompare(a.updated_at);

    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date.localeCompare(b.due_date);
  });
}

function groupTasks(tasks: WorkTask[], groupBy: GroupBy, orderBy: OrderBy) {
  const grouped = new Map<string, WorkTask[]>();

  sortTasks(tasks, orderBy).forEach((task) => {
    const label = groupLabel(task, groupBy);
    grouped.set(label, [...(grouped.get(label) ?? []), task]);
  });

  return Array.from(grouped.entries());
}

function VisualCheckbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
        checked ? 'border-peach bg-peach text-espresso' : 'border-sand'
      }`}
      aria-hidden="true"
    >
      {checked ? <span className="text-xs font-bold">✓</span> : null}
    </div>
  );
}

export function TaskListView({ tasks, groupBy, orderBy }: TaskListViewProps) {
  const groups = groupTasks(tasks, groupBy, orderBy);

  if (groups.length === 0) {
    return <p className="py-16 text-center text-sm text-warm-gray">No tasks assigned yet</p>;
  }

  return (
    <div className="space-y-8">
      {groups.map(([label, groupTasksForLabel]) => (
        <section key={label}>
          <h2 className="mb-2 text-sm font-semibold text-warm-gray">{label}</h2>

          <div className="rounded-xl border border-sand bg-cream">
            {groupTasksForLabel.map((task) => (
              <div
                key={task.task_id}
                className={`flex items-center gap-3 border-b border-sand px-4 py-3 last:border-b-0 ${
                  task.status === 'Complete' ? 'opacity-50' : ''
                }`}
              >
                <VisualCheckbox checked={task.status === 'Complete'} />
                <p className="min-w-0 flex-1 text-sm font-semibold text-espresso">
                  {task.title}
                </p>
                <Tag label={task.project_name} color="sand" />
                <Badge label={task.status} variant={statusVariant(task.status)} />
                <span
                  className={`w-24 text-right text-sm ${
                    isOverdue(task.due_date) ? 'text-red-500' : 'text-warm-gray'
                  }`}
                >
                  {formatDate(task.due_date)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
