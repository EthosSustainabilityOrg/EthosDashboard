'use client';

import type { Task } from '@/types/tasks';
import { Badge } from '@/components/ui/Badge';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type ProjectTask = Task & {
  project_name?: string;
  assignee_name: string;
  created_by_name?: string;
};

type ProjectTaskKanbanViewProps = {
  tasks: ProjectTask[];
  onTaskClick: (task: ProjectTask) => void;
};

const columns: Task['status'][] = [
  'Not Started',
  'In Progress',
  'Awaiting Input',
  'Complete',
];

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) return 'No due date';
  return formatOrgDate(new Date(value), {
    month: 'short',
    day: 'numeric',
  });
}

export function ProjectTaskKanbanView({ tasks, onTaskClick }: ProjectTaskKanbanViewProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-4">
      {columns.map((status) => {
        const columnTasks = tasks.filter((task) => task.status === status);

        return (
          <section
            key={status}
            className={`min-h-96 rounded-xl border border-sand p-4 ${
              status === 'Awaiting Input' ? 'bg-peach-light' : 'bg-cream'
            }`}
          >
            {/* TODO: wire drag-and-drop status updates after interaction hardening */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-espresso">{status}</h2>
              <Badge label={String(columnTasks.length)} variant="neutral" />
            </div>

            <div className="space-y-3">
              {columnTasks.map((task) => (
                <button
                  key={task.task_id}
                  type="button"
                  onClick={() => onTaskClick(task)}
                  className="block w-full rounded-lg border border-sand bg-cream p-3 text-left transition hover:shadow-md"
                >
                  <h3 className="text-sm font-semibold text-espresso">{task.title}</h3>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-peach text-xs font-bold text-espresso">
                      {initials(task.assignee_name)}
                    </span>
                    <span className="text-xs text-warm-gray">{formatDate(task.due_date)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
