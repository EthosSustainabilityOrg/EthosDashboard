'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { BudgetProject } from '@/components/board/BudgetRequestsPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type BudgetReviewSheetProps = {
  project: BudgetProject;
  onClose: () => void;
  onAllocated: (projectId: string, amount: number) => void;
};

type BudgetResponse = {
  data: unknown;
  error: { message: string } | null;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function BudgetReviewSheet({ project, onClose, onAllocated }: BudgetReviewSheetProps) {
  const [allocatedAmount, setAllocatedAmount] = useState(
    String(project.allocated_budget ?? project.requested_budget),
  );
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
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

  async function handleSubmit() {
    const amount = Number(allocatedAmount);

    if (!Number.isFinite(amount) || amount < 0) {
      setError('Enter a valid allocated amount.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch(`/api/projects/${project.project_id}/budget`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ allocated_budget: amount }),
    });

    const body = (await response.json()) as BudgetResponse;

    setIsSaving(false);

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Unable to allocate budget.');
      return;
    }

    onAllocated(project.project_id, amount);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close budget review sheet"
        className="fixed inset-0 z-40 bg-espresso/20"
        onClick={onClose}
      />
      <section className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-espresso">{project.name}</h2>
              <p className="mt-1 text-sm text-warm-gray">
                {project.chapter_name} · Lead: {project.lead_name}
              </p>
            </div>
            <button type="button" aria-label="Close" className="text-2xl leading-none text-warm-gray" onClick={onClose}>
              x
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <p
                className={`text-sm leading-6 text-espresso ${
                  descriptionExpanded ? '' : 'line-clamp-3'
                }`}
              >
                {project.description}
              </p>
              {project.description.length > 180 ? (
                <button
                  type="button"
                  className="mt-2 text-sm font-semibold text-espresso underline"
                  onClick={() => setDescriptionExpanded((current) => !current)}
                >
                  {descriptionExpanded ? 'Show less' : 'Show more'}
                </button>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-sand p-4">
                <p className="text-sm text-warm-gray">Requested amount</p>
                <p className="mt-1 text-lg font-bold text-espresso">
                  {formatMoney(project.requested_budget)}
                </p>
              </div>
              <div className="rounded-xl border border-sand p-4">
                <p className="text-sm text-warm-gray">Current allocated amount</p>
                <p className="mt-1 text-lg font-bold text-espresso">
                  {project.allocated_budget === null
                    ? 'Not yet allocated'
                    : formatMoney(project.allocated_budget)}
                </p>
              </div>
            </div>

            <Input
              label="Allocated amount"
              type="number"
              value={allocatedAmount}
              onChange={setAllocatedAmount}
              name="allocated-amount"
            />

            <p className="text-sm text-warm-gray">
              The Project Lead will be notified of the allocated amount.
            </p>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? 'Allocating...' : 'Allocate Budget'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
