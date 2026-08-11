'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Application } from '@/types/applications';
import type { Task } from '@/types/tasks';
import { TaskControls } from '@/components/work/TaskControls';
import { TaskKanbanView } from '@/components/work/TaskKanbanView';
import { TaskListView } from '@/components/work/TaskListView';

type ViewMode = 'list' | 'kanban';
type GroupBy = 'project' | 'status' | 'due_date';
type OrderBy = 'due_date' | 'updated' | 'alpha';

type WorkTask = Task & {
  project_name: string;
  assignee_name: string;
};

type ApplicationListItem = Application & {
  project_name?: string;
};

type ApplicationsResponse = {
  applications: ApplicationListItem[];
  total: number;
  page: number;
  per_page: number;
};

type TasksResponse = {
  tasks: WorkTask[];
  total: number;
  page: number;
  per_page: number;
};

export default function WorkPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [groupBy, setGroupBy] = useState<GroupBy>('project');
  const [orderBy, setOrderBy] = useState<OrderBy>('due_date');
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  useEffect(() => {
    async function loadTasks() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const applicationsResponse = await fetch('/api/applications?status=Approved', {
        headers,
      });

      const applicationsBody =
        (await applicationsResponse.json()) as ApiResponse<ApplicationsResponse>;

      const projectIds = [
        ...new Set(
          (applicationsBody.data?.applications ?? []).map((application) => application.project_id),
        ),
      ];

      if (projectIds.length === 0) {
        setTasks([]);
        setIsLoading(false);
        return;
      }

      const taskResponses = await Promise.all(
        projectIds.map((projectId) =>
          fetch(`/api/tasks?project_id=${projectId}&per_page=100`, {
            headers,
          }),
        ),
      );

      const taskBodies = await Promise.all(
        taskResponses.map((response) => response.json() as Promise<ApiResponse<TasksResponse>>),
      );

      const mergedTasks = taskBodies.flatMap((body) => body.data?.tasks ?? []);
      setTasks(mergedTasks);
      setIsLoading(false);
    }

    void loadTasks();
  }, [supabase]);

  const incompleteCount = tasks.filter((task) => task.status !== 'Complete').length;

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-espresso">My Work</h1>
          <p className="mt-2 text-sm text-warm-gray">
            {incompleteCount} tasks remaining
          </p>
        </div>
      </header>

      <div className="mb-8">
        <TaskControls
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          orderBy={orderBy}
          onOrderByChange={setOrderBy}
        />
      </div>

      {isLoading ? (
        <p className="text-warm-gray">Loading...</p>
      ) : viewMode === 'list' ? (
        <TaskListView tasks={tasks} groupBy={groupBy} orderBy={orderBy} />
      ) : (
        <TaskKanbanView tasks={tasks} />
      )}
    </div>
  );
}
