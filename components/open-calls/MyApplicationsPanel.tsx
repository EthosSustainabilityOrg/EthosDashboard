'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import type { ApplicationStatus } from '@/types/applications';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { OpenCallApplication } from '@/components/open-calls/OpenCallsBoard';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type MyApplicationsPanelProps = {
  applications: OpenCallApplication[];
  onWithdraw: (applicationId: string) => void;
};

function statusVariant(status: ApplicationStatus) {
  if (status === 'Approved') return 'success' as const;
  if (status === 'Pending') return 'warning' as const;
  return 'neutral' as const;
}

function formatDate(value: string) {
  return formatOrgDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MyApplicationsPanel({ applications, onWithdraw }: MyApplicationsPanelProps) {
  const [isOpen, setIsOpen] = useState(applications.length > 0);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  async function withdraw(applicationId: string) {
    setWithdrawingId(applicationId);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(`/api/applications/${applicationId}/withdraw`, {
      method: 'PATCH',
      headers: {
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
    });

    setWithdrawingId(null);

    if (response.ok) {
      onWithdraw(applicationId);
    }
  }

  return (
    <section className="rounded-xl border border-sand bg-cream">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-espresso">My Applications</span>
        <span className="text-sm text-warm-gray">{isOpen ? 'Hide' : 'Show'}</span>
      </button>

      {isOpen ? (
        <div className="border-t border-sand">
          {applications.length > 0 ? (
            applications.map((application) => (
              <div
                key={application.application_id}
                className="flex flex-col gap-3 border-b border-sand px-5 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  {application.status === 'Approved' ? (
                    <Link
                      href={`/projects/${application.project_id}`}
                      className="font-medium text-espresso hover:underline"
                    >
                      {application.project_name}
                    </Link>
                  ) : (
                    <p className="font-medium text-espresso">{application.project_name}</p>
                  )}
                  <p className="mt-1 text-sm text-warm-gray">
                    Applied {formatDate(application.submitted_at)}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <Badge label={application.status} variant={statusVariant(application.status)} />
                  {application.status === 'Pending' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void withdraw(application.application_id)}
                      disabled={withdrawingId === application.application_id}
                    >
                      {withdrawingId === application.application_id ? 'Withdrawing...' : 'Withdraw'}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          ) : (
            <p className="px-5 py-6 text-sm text-warm-gray">No applications yet.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
