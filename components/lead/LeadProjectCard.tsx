'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Project } from '@/types/projects';
import { Badge } from '@/components/ui/Badge';
import { Tag } from '@/components/ui/Tag';

type LeadProjectCardProps = {
  project: Project;
  pendingCount: number;
  taskProgress: {
    complete: number;
    total: number;
  };
  upcomingShift: {
    start_datetime: string;
  } | null;
  isHq: boolean;
  applicationsUrl: string;
};

function getStatusBadge(project: Project) {
  if (project.closed_at !== null) {
    return <Badge label="Closed" variant="neutral" />;
  }

  if (project.is_published) {
    return <Badge label="Active" variant="success" />;
  }

  return <Badge label="Draft" variant="warning" />;
}

function getProjectTag(project: Project) {
  if (project.project_type_id === 1) return { label: 'Event', color: 'green' as const };
  if (project.project_type_id === 2) return { label: 'Campaign', color: 'peach' as const };
  if (project.project_type_id === 3) return { label: 'Program', color: 'blue' as const };
  return { label: 'HQ', color: 'sand' as const };
}

function formatShiftDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function LeadProjectCard({
  project,
  pendingCount,
  taskProgress,
  upcomingShift,
  isHq,
  applicationsUrl,
}: LeadProjectCardProps) {
  const router = useRouter();
  const projectTag = getProjectTag(project);
  const progressPercent =
    taskProgress.total > 0 ? (taskProgress.complete / taskProgress.total) * 100 : 0;

  return (
    <Link
      href={`/projects/${project.project_id}`}
      className={`block rounded-xl border border-sand bg-cream p-5 transition hover:shadow-md ${
        project.closed_at ? 'opacity-60' : ''
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tag label={projectTag.label} color={projectTag.color} />
        {isHq && project.project_type_id < 10 ? <Tag label="HQ" color="sand" /> : null}
        {getStatusBadge(project)}
      </div>

      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-espresso">{project.name}</h2>

        {pendingCount > 0 ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              router.push(applicationsUrl);
            }}
            className="shrink-0 rounded-full bg-peach-light px-2.5 py-1 text-xs font-semibold text-espresso transition hover:bg-peach"
          >
            {pendingCount} pending
          </button>
        ) : null}
      </div>

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

      {project.requested_budget !== null ? (
        <p className="mt-4 text-sm text-warm-gray">
          {formatMoney(project.requested_budget)} requested ·{' '}
          {project.allocated_budget !== null
            ? `${formatMoney(project.allocated_budget)} allocated`
            : 'Pending allocation'}
        </p>
      ) : null}
    </Link>
  );
}
