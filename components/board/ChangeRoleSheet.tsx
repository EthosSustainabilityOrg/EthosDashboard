'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { OrgRoleId } from '@/types/auth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

type RoleManagedMember = {
  user_id: string;
  first_name: string;
  last_name: string;
  org_role_id: OrgRoleId;
  org_role_name: string;
  chapter_id: string;
  chapter_name: string;
};

type ChangeRoleSheetProps = {
  member: RoleManagedMember;
  onClose: () => void;
  onRoleChanged: (userId: string, newRoleId: number) => void;
};

type RoleChangeResponse = {
  data: unknown;
  error: { message: string } | null;
};

function roleBadgeVariant(roleId: OrgRoleId) {
  if (roleId === 3) return 'peach' as const;
  if (roleId === 2) return 'info' as const;
  return 'neutral' as const;
}

export function ChangeRoleSheet({ member, onClose, onRoleChanged }: ChangeRoleSheetProps) {
  const [selectedRole, setSelectedRole] = useState(String(member.org_role_id));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isBoardMember = member.org_role_id === 3;
  const selectedRoleId = Number(selectedRole);

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

  async function handleConfirm() {
    if (selectedRoleId === member.org_role_id || isBoardMember) return;

    setIsSaving(true);
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch(`/api/users/${member.user_id}/role`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ org_role_id: selectedRoleId }),
    });

    const body = (await response.json()) as RoleChangeResponse;

    setIsSaving(false);

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Unable to change role.');
      return;
    }

    onRoleChanged(member.user_id, selectedRoleId);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close change role sheet"
        className="fixed inset-0 z-40 bg-espresso/20"
        onClick={onClose}
      />
      <section className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-espresso">
                {member.first_name} {member.last_name}
              </h2>
              <div className="mt-2">
                <Badge label={member.org_role_name} variant={roleBadgeVariant(member.org_role_id)} />
              </div>
            </div>
            <button type="button" aria-label="Close" className="text-2xl leading-none text-warm-gray" onClick={onClose}>
              x
            </button>
          </div>

          {isBoardMember ? (
            <div className="rounded-xl border border-sand bg-sand/40 p-4">
              <p className="text-sm font-semibold text-espresso">
                Board members cannot be demoted via the app.
              </p>
              <p className="mt-1 text-sm text-warm-gray">
                Use the Supabase dashboard for Board-to-Board role changes.
              </p>
            </div>
          ) : (
            <Select
              label="New role"
              value={selectedRole}
              onChange={setSelectedRole}
              disabled={isBoardMember}
              options={[
                { value: '1', label: 'Member' },
                { value: '2', label: 'Project Lead' },
                { value: '3', label: 'Board' },
              ]}
              name="new-role"
            />
          )}

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={isBoardMember || selectedRoleId === member.org_role_id || isSaving}
            >
              {isSaving ? 'Saving...' : 'Confirm'}
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
