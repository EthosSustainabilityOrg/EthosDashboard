'use client';

import type { Project } from '@/types/projects';
import type { ApplicationStatus } from '@/types/applications';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { formatDate } from '@/lib/format-date';

type ProjectWithOptionalShift = Project & {
  upcoming_shift?: {
    start_datetime: string;
    end_datetime: string;
  } | null;
};

type ProjectCardProps = {
  project: ProjectWithOptionalShift;
  openCallAppLevel: string | null;
  applicationStatus: ApplicationStatus | null;
  onApply: () => void;
  onJoin: () => void;
};

function getProjectType(projectTypeId: Project['project_type_id']) {
  if (projectTypeId === 1) return { label: 'Event', color: 'green' as const };
  if (projectTypeId === 2) return { label: 'Campaign', color: 'peach' as const };
  if (projectTypeId === 3) return { label: 'Program', color: 'blue' as const };
  return { label: 'HQ', color: 'sand' as const };
}

function formatShiftDate(startDatetime: string) {
  return formatDate(new Date(startDatetime), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusBadge(status: ApplicationStatus, isNoApp: boolean) {
  if (status === 'Pending') {
    return isNoApp
      ? { label: 'Joined', variant: 'success' as const }
      : { label: 'Applied', variant: 'peach' as const };
  }
  if (status === 'Approved') return { label: 'Approved', variant: 'success' as const };
  if (status === 'Rejected') return { label: 'Rejected', variant: 'neutral' as const };
  return { label: 'Withdrawn', variant: 'neutral' as const };
}

export function ProjectCard({
  project,
  openCallAppLevel,
  applicationStatus,
  onApply,
  onJoin,
}: ProjectCardProps) {
  const projectType = getProjectType(project.project_type_id);
  const isNoApp = openCallAppLevel === 'No App';
  const statusBadge = applicationStatus ? getStatusBadge(applicationStatus, isNoApp) : null;

  return (
    <article className="flex min-h-56 flex-col rounded-xl border border-sand bg-cream p-5 transition hover:shadow-md">
      <div className="mb-4">
        <Tag label={projectType.label} color={projectType.color} />
      </div>

      <h2 className="text-base font-semibold text-espresso">{project.name}</h2>

      <div className="mt-4 space-y-2 text-sm text-warm-gray">
        <p>
          {project.upcoming_shift
            ? formatShiftDate(project.upcoming_shift.start_datetime)
            : 'Schedule coming soon'}
        </p>
        <p>Up to {project.max_applications} volunteers</p>
      </div>

      <div className="mt-auto pt-4">
        {statusBadge ? (
          <Badge label={statusBadge.label} variant={statusBadge.variant} />
        ) : isNoApp ? (
          <Button variant="primary" size="sm" className="w-full" onClick={onJoin}>
            Join
          </Button>
        ) : (
          <Button variant="primary" size="sm" className="w-full" onClick={onApply}>
            Apply
          </Button>
        )}
      </div>
    </article>
  );
}
