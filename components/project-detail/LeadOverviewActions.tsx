'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

type LeadOverviewActionsProps = {
  projectId: string;
  pendingCount: number;
};

export function LeadOverviewActions({ projectId, pendingCount }: LeadOverviewActionsProps) {
  const router = useRouter();

  return (
    <div className="mb-4 rounded-xl border border-sand bg-peach-light p-4">
      {pendingCount > 0 ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push(`/projects/${projectId}/applications`)}
        >
          Review Applications ({pendingCount} pending)
        </Button>
      ) : (
        <p className="text-sm text-warm-gray">No pending applications</p>
      )}
    </div>
  );
}
