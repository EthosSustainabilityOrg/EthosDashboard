'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { DonationListItem } from '@/components/fundraising/FundraisingDashboard';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type DonationListProps = {
  donations: DonationListItem[];
  isBoard: boolean;
  onAdd: () => void;
  onEdit: (donation: DonationListItem) => void;
  onDeleted: (donationId: string) => void;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return formatOrgDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function DonationList({ donations, isBoard, onAdd, onEdit, onDeleted }: DonationListProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const totalRaised = useMemo(
    () => donations.reduce((total, donation) => total + donation.amount, 0),
    [donations],
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

  async function confirmDelete() {
    if (!deleteId) return;

    const headers = await getAuthHeaders();
    const response = await fetch(`/api/donations/${deleteId}`, { method: 'DELETE', headers });
    const body = (await response.json()) as { error: { message: string } | null };

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Unable to delete donation.');
      setDeleteId(null);
      return;
    }

    onDeleted(deleteId);
    setDeleteId(null);
  }

  return (
    <section className="rounded-xl border border-sand bg-cream">
      <div className="flex items-center justify-between gap-4 border-b border-sand px-5 py-4">
        <div>
          <h2 className="text-lg font-bold text-espresso">Donations</h2>
          <p className="mt-1 text-sm text-warm-gray">{formatMoney(totalRaised)} total raised</p>
        </div>
        {isBoard ? (
          <Button variant="primary" size="sm" onClick={onAdd}>
            Add Donation
          </Button>
        ) : null}
      </div>

      {error ? <p className="border-b border-sand px-5 py-3 text-sm text-red-600">{error}</p> : null}

      {donations.length > 0 ? (
        donations.map((donation) => (
          <div
            key={donation.donation_id}
            className="flex flex-col gap-3 border-b border-sand px-5 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between"
          >
            <div>
              <p className="font-semibold text-espresso">{donation.donor_name ?? 'Anonymous'}</p>
              <p className="mt-1 text-sm text-warm-gray">{formatDate(donation.donated_at)}</p>
            </div>

            <div className="flex items-center gap-3">
              <p className="font-bold text-espresso">{formatMoney(donation.amount)}</p>
              {isBoard ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(donation)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(donation.donation_id)}>
                    Delete
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ))
      ) : (
        <p className="px-5 py-10 text-center text-sm text-warm-gray">No donations recorded yet</p>
      )}

      <ConfirmDialog
        isOpen={deleteId !== null}
        title="Delete donation?"
        message="This removes the donation record from the app."
        confirmLabel="Delete"
        confirmVariant="danger"
        onCancel={() => setDeleteId(null)}
        onConfirm={confirmDelete}
      />
    </section>
  );
}
