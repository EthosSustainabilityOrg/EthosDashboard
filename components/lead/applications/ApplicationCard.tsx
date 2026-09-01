'use client';

import type { Application } from '@/types/applications';
import { Badge } from '@/components/ui/Badge';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type ApplicationCardApplication = Application & {
  applicant_name: string;
};

type ApplicationCardProps = {
  application: ApplicationCardApplication;
  onClick: () => void;
};

function statusVariant(status: Application['status']) {
  if (status === 'Pending') return 'warning';
  if (status === 'Approved') return 'success';
  return 'neutral';
}

function formatDate(value: string) {
  return formatOrgDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ApplicationCard({ application, onClick }: ApplicationCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-xl border border-sand bg-cream p-4 text-left transition hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-medium text-espresso">{application.applicant_name}</h2>
          <p className="mt-1 text-sm text-warm-gray">
            Submitted {formatDate(application.submitted_at)}
          </p>
        </div>

        <Badge label={application.status} variant={statusVariant(application.status)} />
      </div>
    </button>
  );
}
