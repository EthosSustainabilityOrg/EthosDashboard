'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { BoardSystemLog } from '@/components/board/SystemLogsPanel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/format-date';

type SystemLogCardProps = {
  log: BoardSystemLog;
  onResolve: (logId: string) => void;
};

type ResolveResponse = {
  data: unknown;
  error: { message: string } | null;
};

function formatDateTime(value: string) {
  return formatDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function SystemLogCard({ log, onResolve }: SystemLogCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  async function handleResolve() {
    setIsSaving(true);
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch(`/api/system-logs/${log.log_id}/resolve`, {
      method: 'PATCH',
      headers,
    });

    const body = (await response.json()) as ResolveResponse;

    setIsSaving(false);

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Unable to resolve log.');
      return;
    }

    onResolve(log.log_id);
  }

  return (
    <article className="rounded-xl border border-sand bg-cream p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge label={log.integration} variant="neutral" />
            {log.resolved ? <Badge label="Resolved" variant="success" /> : null}
          </div>

          <h2 className="mt-3 font-semibold text-espresso">{log.error_type}</h2>

          <p className={`mt-2 text-sm leading-6 text-warm-gray ${expanded ? '' : 'line-clamp-2'}`}>
            {log.error_message}
          </p>

          {log.error_message.length > 120 ? (
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-espresso underline"
              onClick={() => setExpanded((current) => !current)}
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}

          <div className="mt-4 space-y-1 text-sm text-warm-gray">
            {log.affected_user_id && log.affected_user_name ? (
              <p>
                Affected user:{' '}
                <Link
                  href={`/directory/${log.affected_user_id}`}
                  className="font-semibold text-espresso underline-offset-4 hover:underline"
                >
                  {log.affected_user_name}
                </Link>
              </p>
            ) : null}
            <p>Occurred {formatDateTime(log.occurred_at)}</p>
            {log.resolved && log.resolved_at ? (
              <p>Resolved {formatDateTime(log.resolved_at)}</p>
            ) : null}
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>

        {!log.resolved ? (
          <Button variant="ghost" size="sm" onClick={handleResolve} disabled={isSaving}>
            {isSaving ? 'Resolving...' : 'Mark Resolved'}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
