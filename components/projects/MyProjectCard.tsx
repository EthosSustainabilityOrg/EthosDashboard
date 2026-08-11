'use client';

import Link from 'next/link';
import type { Project } from '@/types/projects';
import { Tag } from '@/components/ui/Tag';

type ProjectCardProject = Project & {
  chapter_name: string;
  type_name: string;
  is_hq?: boolean;
};

type MyProjectCardProps = {
  project: ProjectCardProject;
  taskProgress: {
    complete: number;
    total: number;
  };
  teamCount: number;
  upcomingShift: {
    start_datetime: string;
    end_datetime: string;
  } | null;
};

function getProjectTag(project: ProjectCardProject) {
  if (project.project_type_id === 1) return { label: 'Event', color: 'green' as const };
  if (project.project_type_id === 2) return { label: 'Campaign', color: 'peach' as const };
  if (project.project_type_id === 3) return { label: 'Program', color: 'blue' as const };
  return { label: project.type_name || 'HQ', color: 'sand' as const };
}

function formatShiftDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function MyProjectCard({
  project,
  taskProgress,
  teamCount,
  upcomingShift,
}: MyProjectCardProps) {
  const projectTag = getProjectTag(project);
  const progressPercent =
    taskProgress.total > 0 ? (taskProgress.complete / taskProgress.total) * 100 : 0;

  return (
    <Link
      href={`/projects/${project.project_id}`}
      className="block rounded-xl border border-sand bg-cream p-5 transition hover:shadow-md"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Tag label={projectTag.label} color={projectTag.color} />
        {project.is_hq && project.project_type_id < 10 ? <Tag label="HQ" color="sand" /> : null}
      </div>

      <h2 className="text-lg font-semibold text-espresso">{project.name}</h2>
      <p className="mt-1 text-sm text-warm-gray">
        {project.is_hq ? 'HQ' : project.chapter_name}
      </p>

      <p className="mt-5 text-sm text-warm-gray">
        {upcomingShift ? formatShiftDate(upcomingShift.start_datetime) : 'No upcoming shifts'}
      </p>

      <div className="mt-5">
        <div className="h-2 rounded-full bg-sand">
          <div
            className="h-2 rounded-full bg-peach"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-warm-gray">
          {taskProgress.complete} of {taskProgress.total} tasks complete
        </p>
      </div>

      <p className="mt-4 text-sm text-warm-gray">{teamCount} members</p>
    </Link>
  );
}
