'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Shift } from '@/types/shifts';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { formatDate } from '@/lib/format-date';

type Volunteer = {
  user_id: string;
  first_name: string;
  last_name: string;
};

type FlagVolunteerSheetProps = {
  projectId: string;
  shifts: Shift[];
  volunteer: Volunteer;
  onClose: () => void;
  onFlagged: () => void;
};

function formatShift(shift: Shift) {
  return formatDate(new Date(shift.start_datetime), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function FlagVolunteerSheet({
  projectId,
  shifts,
  volunteer,
  onClose,
  onFlagged,
}: FlagVolunteerSheetProps) {
  const [shiftId, setShiftId] = useState('');
  const [reason, setReason] = useState('');
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
    setIsSaving(true);
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch('/api/flags', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: volunteer.user_id,
        project_id: projectId,
        shift_id: shiftId || null,
        reason: reason.trim() || null,
      }),
    });

    const body = (await response.json()) as { error: { message: string } | null };

    setIsSaving(false);

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Unable to flag volunteer.');
      return;
    }

    onFlagged();
    onClose();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close flag volunteer sheet"
        className="fixed inset-0 z-40 bg-espresso/20"
        onClick={onClose}
      />
      <section className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold text-espresso">Flag Volunteer</h2>
            <button type="button" className="text-2xl leading-none text-warm-gray" onClick={onClose}>
              x
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-warm-gray">Volunteer</p>
              <p className="mt-1 text-base font-semibold text-espresso">
                {volunteer.first_name} {volunteer.last_name}
              </p>
            </div>

            <Select
              label="Shift"
              value={shiftId}
              onChange={setShiftId}
              name="flag-shift"
              options={[
                { value: '', label: 'Not tied to specific shift' },
                ...shifts.map((shift) => ({
                  value: shift.shift_id,
                  label: formatShift(shift),
                })),
              ]}
            />

            <Textarea label="Reason" value={reason} onChange={setReason} name="flag-reason" rows={5} />

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Flag volunteer'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
