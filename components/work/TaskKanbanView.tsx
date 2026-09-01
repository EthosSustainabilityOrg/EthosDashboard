'use client';

import type { Task } from '@/types/tasks';
import { Badge } from '@/components/ui/Badge';
import { Tag } from '@/components/ui/Tag';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type WorkTask = Task & {
  project_name: string;
  assignee_name: string;
};

type TaskKanbanViewProps = {
  tasks: WorkTask[];
};

const columns: Task['status'][] = [
  'Not Started',
  'In Progress',
  'Awaiting Input',
  'Complete',
];

function formatDate(value: string | null) {
  if (!value) return 'No due date';
  return formatOrgDate(new Date(value), {
    month: 'short',
    day: 'numeric',
  });
}

export function TaskKanbanView({ tasks }: TaskKanbanViewProps) {
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
            {/* TODO: wire drag-and-drop with @dnd-kit after npm is restored */}
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-espresso">{status}</h2>
              <Badge label={String(columnTasks.length)} variant="neutral" />
            </div>

            <div className="space-y-3">
              {columnTasks.map((task) => (
                <article key={task.task_id} className="rounded-lg border border-sand bg-cream p-3">
                  <h3 className="text-sm font-semibold text-espresso">{task.title}</h3>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Tag label={task.project_name} color="sand" />
                    <span className="text-xs text-warm-gray">{formatDate(task.due_date)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
