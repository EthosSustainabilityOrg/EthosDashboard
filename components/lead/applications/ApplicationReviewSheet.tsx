'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Application } from '@/types/applications';
import type { ProjectRole } from '@/types/project-roles';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { formatDate } from '@/lib/format-date';

type ReviewApplication = Application & {
  applicant_name: string;
};

type ApplicationReviewSheetProps = {
  application: ReviewApplication;
  projectRoles: ProjectRole[];
  onClose: () => void;
  onApproved: (updated: Application) => void;
  onRejected: (updated: Application) => void;
};

function statusVariant(status: Application['status']) {
  if (status === 'Pending') return 'warning';
  if (status === 'Approved') return 'success';
  return 'neutral';
}

function formatDateTime(value: string | null) {
  if (!value) return null;

  return formatDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ApplicationReviewSheet({
  application,
  projectRoles,
  onClose,
  onApproved,
  onRejected,
}: ApplicationReviewSheetProps) {
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [activeAction, setActiveAction] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');

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

  async function approveApplication() {
    if (!selectedRoleId) {
      setError('Choose a role before approving.');
      return;
    }

    setError('');
    setActiveAction('approve');

    const response = await fetch(`/api/applications/${application.application_id}/approve`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ project_role_id: selectedRoleId }),
    });

    const body = (await response.json()) as ApiResponse<Application>;

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Could not approve this application.');
      setActiveAction(null);
      return;
    }

    onApproved(body.data);
    setActiveAction(null);
  }

  async function rejectApplication() {
    setError('');
    setActiveAction('reject');

    const response = await fetch(`/api/applications/${application.application_id}/reject`, {
      method: 'PATCH',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ rejection_reason: rejectionReason || null }),
    });

    const body = (await response.json()) as ApiResponse<Application>;

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Could not reject this application.');
      setActiveAction(null);
      return;
    }

    onRejected(body.data);
    setActiveAction(null);
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-espresso/20"
        aria-label="Close application review"
        onClick={onClose}
      />

      <section className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <h2 className="text-2xl font-bold text-espresso">{application.applicant_name}</h2>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>

          <div className="space-y-5">
            <section>
              <h3 className="font-semibold text-espresso">Why join</h3>
              <p className="mt-2 text-sm leading-6 text-warm-gray">{application.why_join}</p>
            </section>

            <section>
              <h3 className="font-semibold text-espresso">Experience</h3>
              <p className="mt-2 text-sm leading-6 text-warm-gray">
                {application.experience || 'No experience provided'}
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-espresso">Availability</h3>
              <p className="mt-2 text-sm leading-6 text-warm-gray">
                {application.availability_notes || 'No availability notes provided'}
              </p>
            </section>

            <p className="text-xs text-warm-gray">
              Submitted {formatDateTime(application.submitted_at)}
            </p>
          </div>

          {application.status === 'Pending' ? (
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              <section className="rounded-xl border border-sand p-4">
                <h3 className="mb-4 font-semibold text-espresso">Approve</h3>
                <Select
                  label="Project role"
                  value={selectedRoleId}
                  onChange={setSelectedRoleId}
                  options={[
                    { value: '', label: 'Select role' },
                    ...projectRoles.map((role) => ({
                      value: role.project_role_id,
                      label: role.role_name,
                    })),
                  ]}
                />
                <Button
                  className="mt-4 w-full"
                  onClick={() => {
                    void approveApplication();
                  }}
                  disabled={activeAction !== null}
                >
                  {activeAction === 'approve' ? 'Approving...' : 'Approve'}
                </Button>
              </section>

              <section className="rounded-xl border border-sand p-4">
                <h3 className="mb-4 font-semibold text-espresso">Reject</h3>
                <Textarea
                  label="Reason"
                  value={rejectionReason}
                  onChange={setRejectionReason}
                  placeholder="Optional"
                  rows={4}
                />
                <button
                  type="button"
                  onClick={() => {
                    void rejectApplication();
                  }}
                  disabled={activeAction !== null}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {activeAction === 'reject' ? 'Rejecting...' : 'Reject'}
                </button>
              </section>
            </div>
          ) : (
            <div className="mt-8 rounded-xl border border-sand p-4">
              <Badge label={application.status} variant={statusVariant(application.status)} />
              {application.reviewed_at ? (
                <p className="mt-3 text-sm text-warm-gray">
                  Reviewed {formatDateTime(application.reviewed_at)}
                </p>
              ) : null}
              {application.rejection_reason ? (
                <p className="mt-3 text-sm leading-6 text-warm-gray">
                  {application.rejection_reason}
                </p>
              ) : null}
            </div>
          )}

          {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}
        </div>
      </section>
    </>
  );
}
