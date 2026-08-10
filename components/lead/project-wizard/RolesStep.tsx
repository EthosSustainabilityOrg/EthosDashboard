'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import type { WizardRole } from './CreateProjectWizard';

type RolesStepProps = {
  roles: WizardRole[];
  onChange: (roles: WizardRole[]) => void;
};

const emptyRole = {
  role_name: '',
  description: '',
  capacity: '',
};

function createLocalId() {
  return crypto.randomUUID();
}

export function RolesStep({ roles, onChange }: RolesStepProps) {
  const [draft, setDraft] = useState(emptyRole);
  const [error, setError] = useState<string | null>(null);

  function addRole() {
    if (!draft.role_name || !draft.capacity) {
      setError('Please fill in all required fields.');
      return;
    }

    setError(null);
    onChange([
      ...roles,
      {
        id: createLocalId(),
        ...draft,
      },
    ]);
    setDraft(emptyRole);
  }

  return (
    <div className="space-y-6">
      {roles.length === 0 ? (
        <p className="rounded-lg bg-peach-light p-4 text-sm text-espresso">
          At least one role is required before publishing.
        </p>
      ) : (
        <div className="space-y-3">
          {roles.map((role) => (
            <article key={role.id} className="rounded-xl border border-sand bg-cream p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-espresso">{role.role_name}</h3>
                  <p className="mt-1 text-sm text-warm-gray">
                    {role.capacity} capacity
                  </p>
                  {role.description ? (
                    <p className="mt-2 text-sm text-brown-mid">{role.description}</p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(roles.filter((item) => item.id !== role.id))}
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
          label="Role name"
          value={draft.role_name}
          onChange={(value) => setDraft((current) => ({ ...current, role_name: value }))}
          placeholder="Site Lead"
          name="role-name"
          required
        />
        <Input
          label="Capacity"
          type="number"
          value={draft.capacity}
          onChange={(value) => setDraft((current) => ({ ...current, capacity: value }))}
          name="role-capacity"
          required
        />
      </div>

      <Textarea
        label="Description"
        value={draft.description}
        onChange={(value) => setDraft((current) => ({ ...current, description: value }))}
        placeholder="Optional"
        name="role-description"
      />

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <Button onClick={addRole}>Save Role</Button>
    </div>
  );
}
