'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import type { WizardShift } from './CreateProjectWizard';

type ShiftsStepProps = {
  shifts: WizardShift[];
  onChange: (shifts: WizardShift[]) => void;
};

const emptyShift = {
  start_datetime: '',
  end_datetime: '',
  location: '',
  capacity: '',
  notes: '',
};

function createLocalId() {
  return crypto.randomUUID();
}

function formatDateRange(shift: WizardShift) {
  if (!shift.start_datetime || !shift.end_datetime) return 'Shift time not set';

  const start = new Date(shift.start_datetime);
  const end = new Date(shift.end_datetime);

  return `${start.toLocaleString()} - ${end.toLocaleTimeString()}`;
}

export function ShiftsStep({ shifts, onChange }: ShiftsStepProps) {
  const [draft, setDraft] = useState(emptyShift);

  function addShift() {
    if (!draft.start_datetime || !draft.end_datetime || !draft.capacity) return;

    onChange([
      ...shifts,
      {
        id: createLocalId(),
        ...draft,
      },
    ]);
    setDraft(emptyShift);
  }

  return (
    <div className="space-y-6">
      {shifts.length === 0 ? (
        <p className="rounded-lg bg-peach-light p-4 text-sm text-espresso">
          At least one shift is required before publishing.
        </p>
      ) : (
        <div className="space-y-3">
          {shifts.map((shift) => (
            <article key={shift.id} className="rounded-xl border border-sand bg-cream p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-espresso">{formatDateRange(shift)}</h3>
                  <p className="mt-1 text-sm text-warm-gray">
                    {shift.location || 'Project location'} · {shift.capacity} capacity
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(shifts.filter((item) => item.id !== shift.id))}
                >
                  Remove
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Start"
          type="datetime-local"
          value={draft.start_datetime}
          onChange={(value) => setDraft((current) => ({ ...current, start_datetime: value }))}
          name="shift-start"
          required
        />
        <Input
          label="End"
          type="datetime-local"
          value={draft.end_datetime}
          onChange={(value) => setDraft((current) => ({ ...current, end_datetime: value }))}
          name="shift-end"
          required
        />
        <Input
          label="Location"
          value={draft.location}
          onChange={(value) => setDraft((current) => ({ ...current, location: value }))}
          placeholder="Optional"
          name="shift-location"
        />
        <Input
          label="Capacity"
          type="number"
          value={draft.capacity}
          onChange={(value) => setDraft((current) => ({ ...current, capacity: value }))}
          name="shift-capacity"
          required
        />
      </div>

      <Textarea
        label="Notes"
        value={draft.notes}
        onChange={(value) => setDraft((current) => ({ ...current, notes: value }))}
        placeholder="Optional"
        name="shift-notes"
      />

      <Button onClick={addShift}>Save Shift</Button>
    </div>
  );
}
