'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { Badge, BadgeCategory } from '@/types/badges';
import type { ManagedBadge } from '@/components/board/badges/BadgeManagement';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

type ProjectOption = {
  project_id: string;
  name: string;
};

type CreateBadgeSheetProps = {
  onClose: () => void;
  onCreated: (badge: ManagedBadge) => void;
  projects: ProjectOption[];
};

type CreateBadgeResponse = {
  data: Badge | null;
  error: { message: string } | null;
};

export function CreateBadgeSheet({ onClose, onCreated, projects }: CreateBadgeSheetProps) {
  const [category, setCategory] = useState<BadgeCategory>('Participation');
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
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
    if (!name.trim()) {
      setError('Badge name is required.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch('/api/badges', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        badge_category: category,
        project_id: category === 'Participation' ? projectId || null : null,
        name: name.trim(),
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
      }),
    });

    const body = (await response.json()) as CreateBadgeResponse;

    setIsSaving(false);

    if (!response.ok || body.error || !body.data) {
      setError(body.error?.message ?? 'Unable to create badge.');
      return;
    }

    const projectName =
      body.data.project_id && category === 'Participation'
        ? projects.find((project) => project.project_id === body.data?.project_id)?.name ?? null
        : null;

    onCreated({
      ...body.data,
      project_name: projectName,
    });
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close create badge sheet"
        className="fixed inset-0 z-40 bg-espresso/20"
        onClick={onClose}
      />
      <section className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold text-espresso">New Badge</h2>
            <button type="button" aria-label="Close" className="text-2xl leading-none text-warm-gray" onClick={onClose}>
              x
            </button>
          </div>

          <div className="space-y-5">
            <div>
              <p className="mb-2 text-sm font-semibold text-espresso">Category</p>
              <div className="inline-flex rounded-full bg-sand p-1">
                {(['Participation', 'Achievement'] as BadgeCategory[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      category === item
                        ? 'bg-espresso text-cream'
                        : 'text-warm-gray hover:text-espresso'
                    }`}
                    onClick={() => setCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {category === 'Participation' ? (
              <Select
                label="Project"
                value={projectId}
                onChange={setProjectId}
                name="badge-project"
                options={[
                  { value: '', label: 'No specific project' },
                  ...projects.map((project) => ({
                    value: project.project_id,
                    label: project.name,
                  })),
                ]}
              />
            ) : null}

            <Input label="Name" value={name} onChange={setName} name="badge-name" />
            <Textarea
              label="Description"
              value={description}
              onChange={setDescription}
              name="badge-description"
            />
            <Input
              label="Image URL"
              value={imageUrl}
              onChange={setImageUrl}
              placeholder="Google Drive image link"
              name="badge-image-url"
            />

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? 'Creating...' : 'Create Badge'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
