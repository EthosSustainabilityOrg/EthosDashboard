'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Donation, FundraisingContact } from '@/types/fundraising';
import type { DonationListItem } from '@/components/fundraising/FundraisingDashboard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

type DonationFormSheetProps = {
  donation: DonationListItem | null;
  contacts: FundraisingContact[];
  onClose: () => void;
  onSaved: (donation: Donation) => void;
};

type DonationResponse = {
  data: Donation | null;
  error: { message: string } | null;
};

export function DonationFormSheet({ donation, contacts, onClose, onSaved }: DonationFormSheetProps) {
  const [contactId, setContactId] = useState(donation?.contact_id ?? '');
  const [amount, setAmount] = useState(donation ? String(donation.amount) : '');
  const [donatedAt, setDonatedAt] = useState(donation?.donated_at ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(donation?.notes ?? '');
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

  async function handleSave() {
    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a valid amount.');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    setIsSaving(true);
    setError(null);

    const response = await fetch(donation ? `/api/donations/${donation.donation_id}` : '/api/donations', {
      method: donation ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        contact_id: contactId || null,
        amount: parsedAmount,
        donated_at: donatedAt,
        notes: notes.trim() || null,
      }),
    });

    const body = (await response.json()) as DonationResponse;
    setIsSaving(false);

    if (!response.ok || body.error || !body.data) {
      setError(body.error?.message ?? 'Unable to save donation.');
      return;
    }

    onSaved(body.data);
  }

  return (
    <>
      <button type="button" aria-label="Close donation sheet" className="fixed inset-0 z-40 bg-espresso/20" onClick={onClose} />
      <section className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold text-espresso">{donation ? 'Edit Donation' : 'Add Donation'}</h2>
            <button type="button" className="text-2xl leading-none text-warm-gray" onClick={onClose}>x</button>
          </div>

          <Select
            label="Contact"
            value={contactId}
            onChange={setContactId}
            options={[
              { value: '', label: 'Anonymous' },
              ...contacts.map((contact) => ({ value: contact.contact_id, label: contact.name })),
            ]}
          />
          <Input label="Amount" type="number" value={amount} onChange={setAmount} name="donation-amount" required />
          <Input label="Date" type="date" value={donatedAt} onChange={setDonatedAt} name="donation-date" required />
          <Textarea label="Notes" value={notes} onChange={setNotes} name="donation-notes" />

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={isSaving}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Donation'}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
