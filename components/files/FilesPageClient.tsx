'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Application } from '@/types/applications';
import type { File } from '@/types/files';
import { FileCard } from '@/components/files/FileCard';
import { FileFilters } from '@/components/files/FileFilters';
import { AddFileSheet } from '@/components/project-detail/AddFileSheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type FileCategoryFilter = 'all' | 'Project' | 'Universal';

type FileListItem = File & {
  project_name: string | null;
  added_by_name: string;
};

type FilesResponse = {
  files: FileListItem[];
  total: number;
  page: number;
  per_page: number;
};

type ApplicationListItem = Application & {
  project_name?: string;
};

type ApplicationsResponse = {
  applications: ApplicationListItem[];
  total: number;
  page: number;
  per_page: number;
};

type ProjectFilterOption = {
  project_id: string;
  name: string;
};

type FilesPageClientProps = {
  isBoard: boolean;
};

function matchesSearch(file: FileListItem, search: string) {
  const term = search.trim().toLowerCase();
  if (!term) return true;

  return (
    file.file_name.toLowerCase().includes(term) ||
    (file.description ?? '').toLowerCase().includes(term)
  );
}

export function FilesPageClient({ isBoard }: FilesPageClientProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<FileCategoryFilter>('all');
  const [activeProject, setActiveProject] = useState<string | null>(null);
  const [files, setFiles] = useState<FileListItem[]>([]);
  const [projects, setProjects] = useState<ProjectFilterOption[]>([]);
  const [addUniversalOpen, setAddUniversalOpen] = useState(false);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  useEffect(() => {
    async function loadFilesAndProjects() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const headers = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined;

      const [filesResponse, applicationsResponse] = await Promise.all([
        fetch('/api/files?per_page=100', { headers }),
        fetch('/api/applications?status=Approved&per_page=100', { headers }),
      ]);

      const filesBody = (await filesResponse.json()) as ApiResponse<FilesResponse>;
      const applicationsBody =
        (await applicationsResponse.json()) as ApiResponse<ApplicationsResponse>;

      setFiles(filesBody.data?.files ?? []);

      const projectOptions = (applicationsBody.data?.applications ?? []).map((application) => ({
        project_id: application.project_id,
        name: application.project_name ?? 'Project',
      }));

      setProjects(
        Array.from(
          new Map(projectOptions.map((project) => [project.project_id, project])).values(),
        ),
      );
    }

    void loadFilesAndProjects();
  }, [supabase]);

  const filteredFiles = files.filter((file) => {
    const categoryMatches = activeCategory === 'all' || file.category === activeCategory;
    const projectMatches =
      activeCategory !== 'Project' || activeProject === null || file.project_id === activeProject;

    return categoryMatches && projectMatches && matchesSearch(file, search);
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-3xl font-bold text-espresso">Files</h1>
        {isBoard ? (
          <Button variant="primary" onClick={() => setAddUniversalOpen(true)}>
            Add Universal File
          </Button>
        ) : null}
      </header>

      <div className="mb-6">
        <Input
          value={search}
          onChange={setSearch}
          placeholder="Search files..."
          name="file-search"
        />
      </div>

      <div className="mb-8">
        <FileFilters
          activeCategory={activeCategory}
          onCategoryChange={(category) => {
            setActiveCategory(category);
            if (category !== 'Project') setActiveProject(null);
          }}
          activeProject={activeProject}
          onProjectChange={setActiveProject}
          projects={projects}
        />
      </div>

      {filteredFiles.length > 0 ? (
        <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredFiles.map((file) => (
            <FileCard key={file.file_id} file={file} />
          ))}
        </section>
      ) : (
        <p className="py-16 text-center text-sm text-warm-gray">No files found</p>
      )}

      {addUniversalOpen ? (
        <AddFileSheet
          forceCategory="Universal"
          onClose={() => setAddUniversalOpen(false)}
          onAdded={(file) => {
            setFiles((current) => [{ ...file, project_name: null, added_by_name: 'You' }, ...current]);
            setAddUniversalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
