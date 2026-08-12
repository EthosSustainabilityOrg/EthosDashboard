'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { Project } from '@/types/projects';
import type { ApiResponse } from '@/types/api';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Tag } from '@/components/ui/Tag';
import type { ProjectDetailTab } from '@/components/project-detail/ProjectDetailShell';

type ProjectHeaderProject = Project & {
  type_name: string;
  chapter_name: string;
  is_hq?: boolean;
};

type ProjectHeaderProps = {
  project: ProjectHeaderProject;
  activeTab: ProjectDetailTab;
  onTabChange: (tab: ProjectDetailTab) => void;
  taskCount: number;
  isLead: boolean;
  isBoard: boolean;
};

const tabs: Array<{ id: ProjectDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'files', label: 'Files' },
  { id: 'updates', label: 'Updates' },
];

function getProjectTag(project: ProjectHeaderProject) {
  if (project.project_type_id === 1) return { label: 'Event', color: 'green' as const };
  if (project.project_type_id === 2) return { label: 'Campaign', color: 'peach' as const };
  if (project.project_type_id === 3) return { label: 'Program', color: 'blue' as const };
  return { label: project.type_name || 'HQ', color: 'sand' as const };
}

export function ProjectHeader({
  project,
  activeTab,
  onTabChange,
  taskCount,
  isLead,
  isBoard,
}: ProjectHeaderProps) {
  const router = useRouter();
  const projectTag = getProjectTag(project);
  const isDraft = !project.is_published && project.closed_at === null;
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

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

  async function handlePublish() {
    setIsPublishing(true);
    setPublishError(null);

    const headers = await getAuthHeaders();

    const response = await fetch(`/api/projects/${project.project_id}/publish`, {
      method: 'POST',
      headers,
    });

    const body = (await response.json()) as ApiResponse<Project>;

    if (!response.ok || body.error) {
      setPublishError(body.error?.message ?? 'Unable to publish this project.');
      setIsPublishing(false);
      return;
    }

    router.refresh();
  }

  return (
    <header>
      <div className="mb-6 flex items-start justify-between gap-4">
        <Link href={isLead || isBoard ? '/lead-projects' : '/my-projects'}>
          <Button variant="ghost">← Back</Button>
        </Link>

        {isLead || isBoard ? (
          <div className="flex items-center gap-2">
            {isDraft ? (
              <Button variant="primary" size="sm" onClick={handlePublish} disabled={isPublishing}>
                {isPublishing ? 'Publishing...' : 'Publish'}
              </Button>
            ) : null}
            <Link href={`/projects/${project.project_id}/edit`}>
              <Button variant="ghost" size="sm">
                Edit
              </Button>
            </Link>
          </div>
        ) : null}
      </div>

      {publishError ? <p className="mb-4 text-sm text-red-500">{publishError}</p> : null}

      <div>
        <h1 className="text-2xl font-bold text-espresso">{project.name}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Tag label={projectTag.label} color={projectTag.color} />
          {project.is_hq && project.project_type_id < 10 ? <Tag label="HQ" color="sand" /> : null}
          <span className="text-sm text-warm-gray">{project.chapter_name}</span>
        </div>
      </div>

      <nav className="mt-8 flex gap-6 border-b border-sand" aria-label="Project sections">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`border-b-2 px-1 pb-3 text-sm font-semibold transition ${
                isActive
                  ? 'border-peach text-espresso'
                  : 'border-transparent text-warm-gray hover:text-espresso'
              }`}
            >
              <span>{tab.label}</span>
              {tab.id === 'tasks' && taskCount > 0 ? (
                <Badge label={String(taskCount)} variant="peach" />
              ) : null}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
