'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { ApplicationStatus } from '@/types/applications';
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

type ChapterOption = Pick<Chapter, 'chapter_id' | 'name' | 'is_hq' | 'location'>;

type ChaptersResponse = {
  chapters: ChapterOption[];
};

type ProjectsResponse = {
  projects: ProjectBoardProject[];
  total: number;
  page: number;
  per_page: number;
};

type ApplicationsResponse = {
  applications: Array<{ project_id: string; status: ApplicationStatus }>;
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

function sortChapters(chapters: ChapterOption[]) {
  return [...chapters].sort((a, b) => {
    if (a.is_hq !== b.is_hq) return a.is_hq ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function ProjectBoard() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedChapterId, setSelectedChapterId] = useState('all');
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [projects, setProjects] = useState<ProjectBoardProject[]>([]);
  const [applicationsByProjectId, setApplicationsByProjectId] = useState<
    Record<string, ApplicationStatus>
  >({});
  const [joinError, setJoinError] = useState('');

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

  useEffect(() => {
    async function loadChapters() {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/chapters', { headers });
      const body = (await response.json()) as ApiResponse<ChaptersResponse>;
      setChapters(sortChapters(body.data?.chapters ?? []));
    }

    void loadChapters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    async function loadMyApplications() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const response = await fetch('/api/applications', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const body = (await response.json()) as ApiResponse<ApplicationsResponse>;
      const byProjectId: Record<string, ApplicationStatus> = {};

      for (const application of body.data?.applications ?? []) {
        byProjectId[application.project_id] = application.status;
      }

      setApplicationsByProjectId(byProjectId);
    }

    void loadMyApplications();
  }, [supabase]);

  useEffect(() => {
    async function loadProjects() {
      const params = new URLSearchParams({
        is_published: 'true',
        per_page: '50',
      });

      let headers: HeadersInit | undefined;

      if (selectedChapterId === 'all' || selectedChapterId === 'remote') {
        // GET /api/projects scopes authenticated members/leads to their own
        // chapter + open calls. A pre-approval user on this board has no
        // chapter yet, so that scoping would silently narrow "All Projects"
        // down to open calls only. Sending the request unauthenticated uses
        // the public "published only, any chapter" path instead, which is
        // what both "All Projects" and "Remote Only" actually need.
        headers = undefined;
      } else {
        params.set('chapter_id', selectedChapterId);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        headers = session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined;
      }

      const response = await fetch(`/api/projects?${params.toString()}`, { headers });
      const body = (await response.json()) as ApiResponse<ProjectsResponse>;
      let fetchedProjects = body.data?.projects ?? [];

      if (selectedChapterId === 'remote') {
        fetchedProjects = fetchedProjects.filter((project) => project.is_virtual);
      }

      setProjects(fetchedProjects);
    }

    void loadProjects();
  }, [selectedChapterId, supabase]);

  async function handleJoin(project: ProjectBoardProject) {
    setJoinError('');
    const headers = await getAuthHeaders();

    const response = await fetch('/api/applications', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        project_id: project.project_id,
        why_join: 'No App open call join submitted.',
      }),
    });

    const body = (await response.json()) as ApiResponse<{ application_id: string }>;

    if (!response.ok || body.error || !body.data) {
      setJoinError(body.error?.message ?? 'Could not join this project.');
      return;
    }

    setApplicationsByProjectId((current) => ({
      ...current,
      [project.project_id]: 'Pending',
    }));
  }

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
            <option value="all">All Projects</option>
            <option value="remote">Remote Only</option>
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

      {joinError ? <p className="mb-4 text-sm text-red-500">{joinError}</p> : null}

      {filteredProjects.length > 0 ? (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.project_id}
              project={project}
              openCallAppLevel={project.open_call_app_level}
              applicationStatus={applicationsByProjectId[project.project_id] ?? null}
              onApply={() => {
                window.location.href = `/apply/${project.project_id}`;
              }}
              onJoin={() => void handleJoin(project)}
            />
          ))}
        </section>
      ) : (
        <p className="py-16 text-center text-sm text-warm-gray">No projects found</p>
      )}
    </div>
  );
}
