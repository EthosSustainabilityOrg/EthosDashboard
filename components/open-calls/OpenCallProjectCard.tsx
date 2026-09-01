'use client';

import type { ApplicationStatus } from '@/types/applications';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import type { OpenCallProject } from '@/components/open-calls/OpenCallsBoard';
import { formatDate } from '@/lib/format-date';

type OpenCallProjectCardProps = {
  project: OpenCallProject;
  applicationStatus: ApplicationStatus | null;
  canApply: boolean;
  isOnHqProject: boolean;
  onApply: () => void;
};

function typeTag(project: OpenCallProject) {
  if (project.project_type_id === 1) return { label: project.type_name, color: 'green' as const };
  if (project.project_type_id === 2) return { label: project.type_name, color: 'peach' as const };
  if (project.project_type_id === 3) return { label: project.type_name, color: 'blue' as const };
  return { label: project.type_name, color: 'sand' as const };
}

function statusVariant(status: ApplicationStatus) {
  if (status === 'Approved') return 'success' as const;
  if (status === 'Pending') return 'warning' as const;
  return 'neutral' as const;
}

function formatShift(value: string) {
  return formatDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function OpenCallProjectCard({
  project,
  applicationStatus,
  canApply,
  isOnHqProject,
  onApply,
}: OpenCallProjectCardProps) {
  const tag = typeTag(project);
  const hqBlocked = isOnHqProject && !project.is_hq;

  return (
    <article className="flex h-full flex-col rounded-xl border border-sand bg-cream p-5 transition hover:shadow-md">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tag label={tag.label} color={tag.color} />
        {project.is_hq && project.project_type_id < 10 ? <Tag label="HQ" color="sand" /> : null}
        {project.open_call_app_level ? (
          <Badge label={project.open_call_app_level} variant="peach" />
        ) : null}
      </div>

      <h2 className="text-lg font-semibold text-espresso">{project.name}</h2>
      <p className="mt-1 text-sm text-warm-gray">{project.is_hq ? 'HQ' : project.chapter_name}</p>

      <div className="mt-4 space-y-2 text-sm text-brown-mid">
        <p>{project.upcoming_shift ? formatShift(project.upcoming_shift.start_datetime) : 'Remote'}</p>
        <p>Up to {project.max_applications} volunteers</p>
      </div>

      <div className="mt-6 flex flex-1 items-end">
        {applicationStatus ? (
          <Badge label={applicationStatus} variant={statusVariant(applicationStatus)} />
        ) : hqBlocked ? (
          <Button disabled className="w-full">
            HQ project limit reached
          </Button>
        ) : !canApply ? (
          <Button disabled className="w-full">
            Project limit reached
          </Button>
        ) : (
          <Button onClick={onApply} className="w-full">
            {project.open_call_app_level === 'No App' ? 'Join' : 'Apply'}
          </Button>
        )}
      </div>
    </article>
  );
}
