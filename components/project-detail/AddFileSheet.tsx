'use client';

import { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { File } from '@/types/files';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

type AddFileSheetProps = {
  projectId?: string | null;
  forceCategory?: 'Project' | 'Universal';
  forceIsPolicy?: boolean;
  onClose: () => void;
  onAdded: (file: File) => void;
};

type FileCreateResponse = {
  data: File | { file: File } | null;
  error: { message: string } | null;
};

function extractFile(data: FileCreateResponse['data']): File | null {
  if (!data) return null;
  if ('file_id' in data) return data;
  return data.file;
}

function nameFromUrl(value: string) {
  try {
    const url = new URL(value);
    const lastPart = url.pathname.split('/').filter(Boolean).at(-1);
    return lastPart ? decodeURIComponent(lastPart).replace(/[-_]/g, ' ') : '';
  } catch {
    return '';
  }
}

export function AddFileSheet({
  projectId = null,
  forceCategory,
  forceIsPolicy = false,
  onClose,
  onAdded,
}: AddFileSheetProps) {
  const [driveUrl, setDriveUrl] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('PDF');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const category = forceCategory ?? 'Project';

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

  function handleDriveUrlChange(value: string) {
    setDriveUrl(value);
    if (!fileName.trim()) {
      setFileName(nameFromUrl(value));
    }
  }

  async function handleSubmit() {
    if (!driveUrl.trim() || !fileName.trim()) {
      setError('Google Drive URL and file name are required.');
      return;
    }

    if (category === 'Project' && !projectId) {
      setError('Project files require a project.');
      return;
    }

    setIsSaving(true);
    setError(null);

    const headers = await getAuthHeaders();

    const response = await fetch('/api/files', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        project_id: category === 'Project' ? projectId : null,
        drive_url: driveUrl.trim(),
        file_name: fileName.trim(),
        file_type: fileType,
        category,
        description: description.trim() || null,
        ...(forceIsPolicy ? { is_policy: true } : {}),
      }),
    });

    const body = (await response.json()) as FileCreateResponse;
    const file = extractFile(body.data);

    setIsSaving(false);

    if (!response.ok || body.error || !file) {
      setError(body.error?.message ?? 'Unable to add file.');
      return;
    }

    onAdded(file);
    onClose();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close add file sheet"
        className="fixed inset-0 z-40 bg-espresso/20"
        onClick={onClose}
      />
      <section className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 flex items-start justify-between gap-4">
            <h2 className="text-xl font-bold text-espresso">Add File</h2>
            <button type="button" aria-label="Close" className="text-2xl leading-none text-warm-gray" onClick={onClose}>
              x
            </button>
          </div>

          <div className="space-y-4">
            <Input label="Google Drive URL" value={driveUrl} onChange={handleDriveUrlChange} name="drive-url" required />
            <Input label="File name" value={fileName} onChange={setFileName} name="file-name" required />
            <Select
              label="File type"
              value={fileType}
              onChange={setFileType}
              name="file-type"
              required
              options={['PDF', 'Google Doc', 'Sheet', 'Slide', 'Image', 'Other'].map((type) => ({
                value: type,
                label: type,
              }))}
            />
            <Textarea label="Description" value={description} onChange={setDescription} name="file-description" />

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmit} disabled={isSaving}>
                {isSaving ? 'Adding...' : 'Add file'}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
