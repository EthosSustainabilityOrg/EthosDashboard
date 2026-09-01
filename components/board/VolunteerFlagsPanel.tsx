'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type FlagFilter = 'All' | 'Unresolved' | 'Resolved';

export type BoardVolunteerFlag = {
  flag_id: string;
  volunteer_name: string;
  volunteer_id: string;
  project_name: string;
  project_id: string;
  lead_name: string;
  shift_date: string | null;
  reason: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

type VolunteerFlagsPanelProps = {
  flags: BoardVolunteerFlag[];
};

type ResolveResponse = {
  data: unknown;
  error: { message: string } | null;
};

const filters: FlagFilter[] = ['All', 'Unresolved', 'Resolved'];

function formatDate(value: string) {
  return formatOrgDate(new Date(value), {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function matchesFilter(flag: BoardVolunteerFlag, filter: FlagFilter) {
  if (filter === 'Resolved') return flag.resolved;
  if (filter === 'Unresolved') return !flag.resolved;
  return true;
}

export function VolunteerFlagsPanel({ flags }: VolunteerFlagsPanelProps) {
  const router = useRouter();
  const [localFlags, setLocalFlags] = useState(flags);
  const [filter, setFilter] = useState<FlagFilter>('All');
  const [error, setError] = useState<string | null>(null);

  const filteredFlags = useMemo(
    () => localFlags.filter((flag) => matchesFilter(flag, filter)),
    [localFlags, filter],
  );

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

  async function markResolved(flagId: string) {
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch(`/api/flags/${flagId}/resolve`, {
      method: 'PATCH',
      headers,
    });

    const body = (await response.json()) as ResolveResponse;

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Unable to resolve flag.');
      return;
    }

    setLocalFlags((current) =>
      current.map((flag) =>
        flag.flag_id === flagId
          ? { ...flag, resolved: true, resolved_at: new Date().toISOString() }
          : flag,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Chip
            key={item}
            label={item}
            active={filter === item}
            onClick={() => setFilter(item)}
          />
        ))}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="grid gap-4">
        {filteredFlags.length > 0 ? (
          filteredFlags.map((flag) => (
            <article key={flag.flag_id} className="rounded-xl border border-sand bg-cream p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/directory/${flag.volunteer_id}`}
                      className="font-semibold text-espresso underline-offset-4 hover:underline"
                    >
                      {flag.volunteer_name}
                    </Link>
                    {flag.resolved ? (
                      <Badge label="Resolved" variant="success" />
                    ) : (
                      <Badge label="Unresolved" variant="peach" />
                    )}
                  </div>

                  <p className="mt-2 text-sm text-warm-gray">{flag.project_name}</p>
                  <p className="mt-1 text-sm text-warm-gray">Flagged by {flag.lead_name}</p>
                  <p className="mt-1 text-sm text-warm-gray">
                    Shift: {flag.shift_date ?? 'No specific shift'}
                  </p>
                  <p className="mt-1 text-sm text-warm-gray">
                    Created {formatDate(flag.created_at)}
                  </p>

                  {flag.reason ? (
                    <div className="mt-4 rounded-lg bg-sand/40 p-4 text-sm leading-6 text-espresso">
                      {flag.reason}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 gap-2">
                  {!flag.resolved ? (
                    <Button variant="ghost" size="sm" onClick={() => markResolved(flag.flag_id)}>
                      Mark Resolved
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/directory/${flag.volunteer_id}`)}
                  >
                    View Profile
                  </Button>
                </div>
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-xl border border-sand bg-cream px-5 py-12 text-center text-sm text-warm-gray">
            No {filter.toLowerCase()} flags found
          </p>
        )}
      </section>
    </div>
  );
}
