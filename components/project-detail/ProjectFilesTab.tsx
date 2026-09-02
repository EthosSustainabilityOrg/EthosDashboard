'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { File } from '@/types/files';
import { FileCard } from '@/components/files/FileCard';
import { Input } from '@/components/ui/Input';

type ProjectFile = File & {
  project_name: string | null;
  added_by_name: string;
};

type ProjectFilesTabProps = {
  files: ProjectFile[];
  actions?: ReactNode;
};

function matchesSearch(file: ProjectFile, search: string) {
  const term = search.trim().toLowerCase();
  if (!term) return true;

  return (
    file.file_name.toLowerCase().includes(term) ||
    (file.description ?? '').toLowerCase().includes(term)
  );
}

export function ProjectFilesTab({ files, actions = null }: ProjectFilesTabProps) {
  const [search, setSearch] = useState('');

  const filteredFiles = files.filter((file) => matchesSearch(file, search));

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <Input
          value={search}
          onChange={setSearch}
          ariaLabel="Search files"
          placeholder="Search files..."
          name="project-file-search"
        />
        {actions}
      </div>

      {filteredFiles.length > 0 ? (
        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredFiles.map((file) => (
            <FileCard key={file.file_id} file={file} />
          ))}
        </section>
      ) : (
        <p className="py-16 text-center text-sm text-warm-gray">
          No files for this project yet
        </p>
      )}
    </div>
  );
}
