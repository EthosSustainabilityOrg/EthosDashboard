'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Chapter } from '@/types/chapters';
import type { Project } from '@/types/projects';
import { Input } from '@/components/ui/Input';
import { ProjectCard } from '@/components/onboarding/ProjectCard';
import { ProjectFilters } from '@/components/onboarding/ProjectFilters';

type ProjectBoardProject = Project & {
  upcoming_shift?: {
    start_datetime: string;
    end_datetime: string;
  } | null;
};

type ChaptersResponse = {
  chapters: Pick<Chapter, 'chapter_id' | 'name' | 'is_hq' | 'location'>[];
};

type ProjectsResponse = {
  projects: ProjectBoardProject[];
  total: number;
  page: number;
  per_page: number;
};

function typeIdForFilter(filter: string) {
  if (filter === 'Events') return 1;
  if (filter === 'Campaigns') return 2;
  if (filter === 'Programs') return 3;
  return null;
}

function matchesSearch(project: ProjectBoardProject, search: string) {
  const term = search.trim().toLowerCase();
  if (!term) return true;

  return (
    project.name.toLowerCase().includes(term) ||
    project.description.toLowerCase().includes(term)
  );
}

export function ProjectBoard() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [chapters, setChapters] = useState<ChaptersResponse['chapters']>([]);
  const [projects, setProjects] = useState<ProjectBoardProject[]>([]);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  useEffect(() => {
    async function loadChapters() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch('/api/chapters', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      const body = (await response.json()) as ApiResponse<ChaptersResponse>;
      setChapters(body.data?.chapters ?? []);
    }

    void loadChapters();
  }, [supabase]);

  useEffect(() => {
    async function loadProjects() {
      if (!selectedChapterId) {
        setProjects([]);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const params = new URLSearchParams({
        chapter_id: selectedChapterId,
        is_published: 'true',
        per_page: '50',
      });

      const response = await fetch(`/api/projects?${params.toString()}`, {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      const body = (await response.json()) as ApiResponse<ProjectsResponse>;
      setProjects(body.data?.projects ?? []);
    }

    void loadProjects();
  }, [selectedChapterId, supabase]);

  const filteredProjects = projects.filter((project) => {
    const typeId = typeIdForFilter(activeFilter);

    return (
      matchesSearch(project, search) &&
      (typeId === null || project.project_type_id === typeId)
    );
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-espresso">Find a project</h1>
        <p className="mt-2 text-sm text-warm-gray">
          Browse local and remote opportunities from Ethos chapters.
        </p>
      </header>

      <div className="mb-6 max-w-sm">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-espresso">Chapter</span>
          <select
            value={selectedChapterId}
            onChange={(event) => setSelectedChapterId(event.target.value)}
            className="h-11 w-full rounded-md border border-sand bg-cream px-3 text-sm text-espresso focus:outline-none focus:ring-2 focus:ring-peach"
          >
            <option value="">Remote only</option>
            {chapters.map((chapter) => (
              <option key={chapter.chapter_id} value={chapter.chapter_id}>
                {chapter.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-[1fr_auto]">
        <Input
          value={search}
          onChange={setSearch}
          placeholder="Search projects"
          name="project-search"
        />

        <ProjectFilters activeFilter={activeFilter} onFilterChange={setActiveFilter} />
      </div>

      {filteredProjects.length > 0 ? (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.project_id}
              project={project}
              onApply={() => {
                window.location.href = `/apply/${project.project_id}`;
              }}
            />
          ))}
        </section>
      ) : (
        <p className="py-16 text-center text-sm text-warm-gray">No projects found</p>
      )}
    </div>
  );
}
