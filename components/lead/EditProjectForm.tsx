'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { OpenCallAppLevel, Project } from '@/types/projects';
import type { ProjectRole } from '@/types/project-roles';
import type { Shift } from '@/types/shifts';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';

type EditProjectFormProps = {
  project: Project;
  shifts: Shift[];
  roles: ProjectRole[];
};

type ShiftDraft = {
  start_datetime: string;
  end_datetime: string;
  location: string;
  capacity: string;
  notes: string;
};

type RoleDraft = {
  role_name: string;
  description: string;
  capacity: string;
};

type DeleteTarget =
  | { type: 'shift'; id: string; label: string }
  | { type: 'role'; id: string; label: string }
  | null;

type ApiResponse<T> = {
  data: T | null;
  error: { message: string } | null;
};

const emptyShift: ShiftDraft = {
  start_datetime: '',
  end_datetime: '',
  location: '',
  capacity: '',
  notes: '',
};

const emptyRole: RoleDraft = {
  role_name: '',
  description: '',
  capacity: '',
};

const openCallOptions: Array<{ value: '' | OpenCallAppLevel; label: string }> = [
  { value: '', label: 'None' },
  { value: 'Full App', label: 'Full App' },
  { value: 'Mid App', label: 'Mid App' },
  { value: 'No App', label: 'No App' },
];

function toDatetimeLocal(value: string) {
  return value.slice(0, 16);
}

function toShiftDraft(shift: Shift): ShiftDraft {
  return {
    start_datetime: toDatetimeLocal(shift.start_datetime),
    end_datetime: toDatetimeLocal(shift.end_datetime),
    location: shift.location ?? '',
    capacity: String(shift.capacity),
    notes: shift.notes ?? '',
  };
}

function toRoleDraft(role: ProjectRole): RoleDraft {
  return {
    role_name: role.role_name,
    description: role.description ?? '',
    capacity: String(role.capacity),
  };
}

function formatShiftLabel(shift: Shift) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(shift.start_datetime));
}

export function EditProjectForm({ project, shifts, roles }: EditProjectFormProps) {
  const router = useRouter();
  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );
  const [description, setDescription] = useState(project.description);
  const [location, setLocation] = useState(project.location ?? '');
  const [isVirtual, setIsVirtual] = useState(project.is_virtual);
  const [requestedBudget, setRequestedBudget] = useState(
    project.requested_budget === null ? '' : String(project.requested_budget),
  );
  const [maxApplications, setMaxApplications] = useState(String(project.max_applications));
  const [isOpenCall, setIsOpenCall] = useState(project.is_open_call);
  const [openCallAppLevel, setOpenCallAppLevel] = useState<'' | OpenCallAppLevel>(
    project.open_call_app_level ?? '',
  );

  const [localShifts, setLocalShifts] = useState(shifts);
  const [localRoles, setLocalRoles] = useState(roles);
  const [shiftEdits, setShiftEdits] = useState<Record<string, ShiftDraft>>(
    Object.fromEntries(shifts.map((shift) => [shift.shift_id, toShiftDraft(shift)])),
  );
  const [roleEdits, setRoleEdits] = useState<Record<string, RoleDraft>>(
    Object.fromEntries(roles.map((role) => [role.project_role_id, toRoleDraft(role)])),
  );
  const [newShift, setNewShift] = useState<ShiftDraft>(emptyShift);
  const [newRole, setNewRole] = useState<RoleDraft>(emptyRole);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function getAuthHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return {
      'Content-Type': 'application/json',
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    };
  }

  async function saveProject() {
    setIsSaving(true);
    setMessage(null);
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch(`/api/projects/${project.project_id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        description,
        location: isVirtual ? null : location.trim(),
        is_virtual: isVirtual,
        requested_budget: requestedBudget ? Number(requestedBudget) : null,
        max_applications: Number(maxApplications),
        is_open_call: isOpenCall,
        open_call_app_level: isOpenCall ? openCallAppLevel || null : null,
      }),
    });

    const body = (await response.json()) as ApiResponse<Project>;
    setIsSaving(false);

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Unable to save project.');
      return;
    }

    setMessage('Project saved.');
    router.push(`/projects/${project.project_id}`);
  }

  async function addShift() {
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch(`/api/projects/${project.project_id}/shifts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        start_datetime: newShift.start_datetime,
        end_datetime: newShift.end_datetime,
        location: newShift.location.trim() || null,
        capacity: Number(newShift.capacity),
        notes: newShift.notes.trim() || null,
      }),
    });

    const body = (await response.json()) as ApiResponse<Shift>;

    if (!response.ok || body.error || !body.data) {
      setError(body.error?.message ?? 'Unable to add shift.');
      return;
    }

    const createdShift = body.data;
    setLocalShifts((current) => [...current, createdShift]);
    setShiftEdits((current) => ({ ...current, [createdShift.shift_id]: toShiftDraft(createdShift) }));
    setNewShift(emptyShift);
  }

  async function saveShift(shiftId: string) {
    const draft = shiftEdits[shiftId];
    if (!draft) return;

    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch(`/api/projects/${project.project_id}/shifts/${shiftId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        start_datetime: draft.start_datetime,
        end_datetime: draft.end_datetime,
        location: draft.location.trim() || null,
        capacity: Number(draft.capacity),
        notes: draft.notes.trim() || null,
      }),
    });

    const body = (await response.json()) as ApiResponse<Shift>;

    if (!response.ok || body.error || !body.data) {
      setError(body.error?.message ?? 'Unable to save shift.');
      return;
    }

    setLocalShifts((current) =>
      current.map((shift) => (shift.shift_id === shiftId ? (body.data as Shift) : shift)),
    );
    setMessage('Shift saved.');
  }

  async function addRole() {
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch(`/api/projects/${project.project_id}/roles`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        role_name: newRole.role_name.trim(),
        description: newRole.description.trim() || null,
        capacity: Number(newRole.capacity),
      }),
    });

    const body = (await response.json()) as ApiResponse<ProjectRole>;

    if (!response.ok || body.error || !body.data) {
      setError(body.error?.message ?? 'Unable to add role.');
      return;
    }

    const createdRole = body.data;
    setLocalRoles((current) => [...current, createdRole]);
    setRoleEdits((current) => ({ ...current, [createdRole.project_role_id]: toRoleDraft(createdRole) }));
    setNewRole(emptyRole);
  }

  async function saveRole(roleId: string) {
    const draft = roleEdits[roleId];
    if (!draft) return;

    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch(`/api/projects/${project.project_id}/roles/${roleId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        role_name: draft.role_name.trim(),
        description: draft.description.trim() || null,
        capacity: Number(draft.capacity),
      }),
    });

    const body = (await response.json()) as ApiResponse<ProjectRole>;

    if (!response.ok || body.error || !body.data) {
      setError(body.error?.message ?? 'Unable to save role.');
      return;
    }

    setLocalRoles((current) =>
      current.map((role) => (role.project_role_id === roleId ? (body.data as ProjectRole) : role)),
    );
    setMessage('Role saved.');
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    const path =
      deleteTarget.type === 'shift'
        ? `/api/projects/${project.project_id}/shifts/${deleteTarget.id}`
        : `/api/projects/${project.project_id}/roles/${deleteTarget.id}`;

    const headers = await getAuthHeaders();

    const response = await fetch(path, {
      method: 'DELETE',
      headers,
    });
    const body = (await response.json()) as ApiResponse<{ deleted: boolean }>;

    if (!response.ok || body.error) {
      setError(body.error?.message ?? 'Unable to delete item.');
      setDeleteTarget(null);
      return;
    }

    if (deleteTarget.type === 'shift') {
      setLocalShifts((current) => current.filter((shift) => shift.shift_id !== deleteTarget.id));
    } else {
      setLocalRoles((current) => current.filter((role) => role.project_role_id !== deleteTarget.id));
    }

    setDeleteTarget(null);
    setMessage('Item removed.');
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-espresso">Edit Project</h1>
        <p className="mt-1 text-sm text-warm-gray">Update the details volunteers see after publishing.</p>
      </div>

      <section className="rounded-2xl border border-sand bg-cream p-6">
        <h2 className="mb-5 text-lg font-semibold text-espresso">Read-only details</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Input label="Project name" value={project.name} onChange={() => undefined} readOnly />
          <Input label="Project type ID" value={String(project.project_type_id)} onChange={() => undefined} readOnly />
          <Input label="Chapter ID" value={project.chapter_id} onChange={() => undefined} readOnly />
        </div>
      </section>

      <section className="space-y-5 rounded-2xl border border-sand bg-cream p-6">
        <h2 className="text-lg font-semibold text-espresso">Editable details</h2>
        <Textarea label="Description" value={description} onChange={setDescription} name="project-description" />
        <Toggle checked={isVirtual} onChange={setIsVirtual} label="Virtual project" />
        {!isVirtual ? <Input label="Location" value={location} onChange={setLocation} name="project-location" /> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="Requested budget" value={requestedBudget} onChange={setRequestedBudget} name="requested-budget" />
          <Input label="Max volunteers" value={maxApplications} onChange={setMaxApplications} name="max-applications" />
        </div>
        <Toggle checked={isOpenCall} onChange={setIsOpenCall} label="Open call" />
        {isOpenCall ? (
          <Select
            label="Application level"
            value={openCallAppLevel}
            onChange={(value) => setOpenCallAppLevel(value as '' | OpenCallAppLevel)}
            options={openCallOptions}
            name="open-call-level"
          />
        ) : null}
      </section>

      <section className="space-y-5 rounded-2xl border border-sand bg-cream p-6">
        <h2 className="text-lg font-semibold text-espresso">Shifts</h2>
        {localShifts.map((shift) => {
          const draft = shiftEdits[shift.shift_id] ?? toShiftDraft(shift);
          return (
            <div key={shift.shift_id} className="rounded-xl border border-sand p-4">
              <p className="mb-3 text-sm font-semibold text-warm-gray">{formatShiftLabel(shift)}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-espresso">Start</span>
                  <input
                    type="datetime-local"
                    value={draft.start_datetime}
                    onChange={(event) =>
                      setShiftEdits((current) => ({
                        ...current,
                        [shift.shift_id]: { ...draft, start_datetime: event.target.value },
                      }))
                    }
                    className="h-11 w-full rounded-md border border-espresso/30 bg-cream px-3 text-sm text-espresso focus:outline-none focus:ring-2 focus:ring-peach"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-espresso">End</span>
                  <input
                    type="datetime-local"
                    value={draft.end_datetime}
                    onChange={(event) =>
                      setShiftEdits((current) => ({
                        ...current,
                        [shift.shift_id]: { ...draft, end_datetime: event.target.value },
                      }))
                    }
                    className="h-11 w-full rounded-md border border-espresso/30 bg-cream px-3 text-sm text-espresso focus:outline-none focus:ring-2 focus:ring-peach"
                  />
                </label>
                <Input
                  label="Location"
                  value={draft.location}
                  onChange={(value) =>
                    setShiftEdits((current) => ({
                      ...current,
                      [shift.shift_id]: { ...draft, location: value },
                    }))
                  }
                />
                <Input
                  label="Capacity"
                  value={draft.capacity}
                  onChange={(value) =>
                    setShiftEdits((current) => ({
                      ...current,
                      [shift.shift_id]: { ...draft, capacity: value },
                    }))
                  }
                />
              </div>
              <Textarea
                label="Notes"
                value={draft.notes}
                onChange={(value) =>
                  setShiftEdits((current) => ({
                    ...current,
                    [shift.shift_id]: { ...draft, notes: value },
                  }))
                }
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteTarget({ type: 'shift', id: shift.shift_id, label: formatShiftLabel(shift) })}
                >
                  Remove
                </Button>
                <Button variant="secondary" size="sm" onClick={() => saveShift(shift.shift_id)}>
                  Save shift
                </Button>
              </div>
            </div>
          );
        })}

        <div className="rounded-xl bg-sand/30 p-4">
          <h3 className="mb-3 font-semibold text-espresso">Add shift</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-espresso">Start</span>
              <input
                type="datetime-local"
                value={newShift.start_datetime}
                onChange={(event) => setNewShift((current) => ({ ...current, start_datetime: event.target.value }))}
                className="h-11 w-full rounded-md border border-espresso/30 bg-cream px-3 text-sm text-espresso focus:outline-none focus:ring-2 focus:ring-peach"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-espresso">End</span>
              <input
                type="datetime-local"
                value={newShift.end_datetime}
                onChange={(event) => setNewShift((current) => ({ ...current, end_datetime: event.target.value }))}
                className="h-11 w-full rounded-md border border-espresso/30 bg-cream px-3 text-sm text-espresso focus:outline-none focus:ring-2 focus:ring-peach"
              />
            </label>
            <Input label="Location" value={newShift.location} onChange={(value) => setNewShift((current) => ({ ...current, location: value }))} />
            <Input label="Capacity" value={newShift.capacity} onChange={(value) => setNewShift((current) => ({ ...current, capacity: value }))} />
          </div>
          <Textarea label="Notes" value={newShift.notes} onChange={(value) => setNewShift((current) => ({ ...current, notes: value }))} />
          <Button variant="primary" size="sm" onClick={addShift}>
            Add shift
          </Button>
        </div>
      </section>

      <section className="space-y-5 rounded-2xl border border-sand bg-cream p-6">
        <h2 className="text-lg font-semibold text-espresso">Roles</h2>
        {localRoles.map((role) => {
          const draft = roleEdits[role.project_role_id] ?? toRoleDraft(role);
          return (
            <div key={role.project_role_id} className="rounded-xl border border-sand p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Role name" value={draft.role_name} onChange={(value) => setRoleEdits((current) => ({ ...current, [role.project_role_id]: { ...draft, role_name: value } }))} />
                <Input label="Capacity" value={draft.capacity} onChange={(value) => setRoleEdits((current) => ({ ...current, [role.project_role_id]: { ...draft, capacity: value } }))} />
              </div>
              <Textarea label="Description" value={draft.description} onChange={(value) => setRoleEdits((current) => ({ ...current, [role.project_role_id]: { ...draft, description: value } }))} />
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ type: 'role', id: role.project_role_id, label: role.role_name })}>
                  Remove
                </Button>
                <Button variant="secondary" size="sm" onClick={() => saveRole(role.project_role_id)}>
                  Save role
                </Button>
              </div>
            </div>
          );
        })}

        <div className="rounded-xl bg-sand/30 p-4">
          <h3 className="mb-3 font-semibold text-espresso">Add role</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Role name" value={newRole.role_name} onChange={(value) => setNewRole((current) => ({ ...current, role_name: value }))} />
            <Input label="Capacity" value={newRole.capacity} onChange={(value) => setNewRole((current) => ({ ...current, capacity: value }))} />
          </div>
          <Textarea label="Description" value={newRole.description} onChange={(value) => setNewRole((current) => ({ ...current, description: value }))} />
          <Button variant="primary" size="sm" onClick={addRole}>
            Add role
          </Button>
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-green-700">{message}</p> : null}

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => router.push(`/projects/${project.project_id}`)}>
          Cancel
        </Button>
        <Button variant="primary" onClick={saveProject} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Remove item?"
        message={`This will remove ${deleteTarget?.label ?? 'this item'} from the project.`}
        confirmLabel="Remove"
        confirmVariant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
