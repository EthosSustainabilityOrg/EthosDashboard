'use client';

import type { Task } from '@/types/tasks';
import { Badge } from '@/components/ui/Badge';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type GroupBy = 'status' | 'due_date' | 'ungrouped';
type OrderBy = 'due_date' | 'updated' | 'alpha';

type ProjectTask = Task & {
  project_name?: string;
  assignee_name: string;
  created_by_name?: string;
};

type ProjectTaskListViewProps = {
  tasks: ProjectTask[];
  groupBy: GroupBy;
  orderBy: OrderBy;
  onTaskClick: (task: ProjectTask) => void;
  currentUserId: string;
};

function statusVariant(status: Task['status']) {
  if (status === 'Complete') return 'success';
  if (status === 'Awaiting Input') return 'warning';
  if (status === 'In Progress') return 'info';
  return 'neutral';
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
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

function groupLabel(task: ProjectTask, groupBy: GroupBy) {
  if (groupBy === 'status') return task.status;
  if (groupBy === 'due_date') return task.due_date ? formatDate(task.due_date) : 'No due date';
  return 'All tasks';
}

function sortTasks(tasks: ProjectTask[], orderBy: OrderBy) {
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

function groupTasks(tasks: ProjectTask[], groupBy: GroupBy, orderBy: OrderBy) {
  const grouped = new Map<string, ProjectTask[]>();

  sortTasks(tasks, orderBy).forEach((task) => {
    const label = groupLabel(task, groupBy);
    grouped.set(label, [...(grouped.get(label) ?? []), task]);
  });

  return Array.from(grouped.entries());
}

export function ProjectTaskListView({
  tasks,
  groupBy,
  orderBy,
  onTaskClick,
}: ProjectTaskListViewProps) {
  const groups = groupTasks(tasks, groupBy, orderBy);

  if (groups.length === 0) {
    return <p className="py-16 text-center text-sm text-warm-gray">No tasks yet</p>;
  }

  return (
    <div className="space-y-8">
      {groups.map(([label, groupedTasks]) => (
        <section key={label}>
          <h2 className="mb-2 text-sm font-semibold text-warm-gray">{label}</h2>

          <div className="rounded-xl border border-sand bg-cream">
            {groupedTasks.map((task) => (
              <button
                key={task.task_id}
                type="button"
                onClick={() => onTaskClick(task)}
                className={`flex w-full items-center gap-3 border-b border-sand px-4 py-3 text-left transition hover:bg-sand/30 last:border-b-0 ${
                  task.status === 'Complete' ? 'opacity-50' : ''
                }`}
              >
                <p className="min-w-0 flex-1 text-sm font-semibold text-espresso">
                  {task.title}
                </p>

                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-peach text-xs font-bold text-espresso">
                    {initials(task.assignee_name)}
                  </span>
                  <span className="hidden text-sm text-warm-gray md:inline">{task.assignee_name}</span>
                </div>

                <Badge label={task.status} variant={statusVariant(task.status)} />

                <span
                  className={`w-24 text-right text-sm ${
                    isOverdue(task.due_date) ? 'text-red-500' : 'text-warm-gray'
                  }`}
                >
                  {formatDate(task.due_date)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
