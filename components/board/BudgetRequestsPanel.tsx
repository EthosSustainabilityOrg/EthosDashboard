'use client';

import { useMemo, useState } from 'react';
import { BudgetReviewSheet } from '@/components/board/BudgetReviewSheet';
import { Chip } from '@/components/ui/Chip';
import { formatDate as formatOrgDate } from '@/lib/format-date';

type BudgetFilter = 'All' | 'Pending' | 'Reviewed';

export type BudgetProject = {
  project_id: string;
  name: string;
  description: string;
  chapter_name: string;
  lead_name: string;
  requested_budget: number;
  allocated_budget: number | null;
  created_at: string;
};

type BudgetRequestsPanelProps = {
  projects: BudgetProject[];
};

const filters: BudgetFilter[] = ['All', 'Pending', 'Reviewed'];

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return formatOrgDate(new Date(value), {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function matchesFilter(project: BudgetProject, filter: BudgetFilter) {
  if (filter === 'Pending') return project.allocated_budget === null;
  if (filter === 'Reviewed') return project.allocated_budget !== null;
  return true;
}

export function BudgetRequestsPanel({ projects }: BudgetRequestsPanelProps) {
  const [localProjects, setLocalProjects] = useState(projects);
  const [filter, setFilter] = useState<BudgetFilter>('All');
  const [selectedProject, setSelectedProject] = useState<BudgetProject | null>(null);

  const filteredProjects = useMemo(
    () => localProjects.filter((project) => matchesFilter(project, filter)),
    [localProjects, filter],
  );

  function handleAllocated(projectId: string, amount: number) {
    setLocalProjects((current) =>
      current.map((project) =>
        project.project_id === projectId ? { ...project, allocated_budget: amount } : project,
      ),
    );
    setSelectedProject(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {filters.map((item) => (
          <Chip
            key={item}
            label={item}
            active={filter === item}
            onClick={() => setFilter(item)}
          />
        ))}
      </div>

      <section className="grid gap-4">
        {filteredProjects.length > 0 ? (
          filteredProjects.map((project) => {
            const pending = project.allocated_budget === null;

            return (
              <button
                key={project.project_id}
                type="button"
                className={`rounded-xl border border-sand bg-cream p-5 text-left transition hover:shadow-md ${
                  pending ? 'border-l-4 border-l-peach' : ''
                }`}
                onClick={() => setSelectedProject(project)}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="font-semibold text-espresso">{project.name}</h2>
                    <p className="mt-1 text-sm text-warm-gray">{project.chapter_name}</p>
                    <p className="mt-3 text-sm text-warm-gray">Lead: {project.lead_name}</p>
                  </div>

                  <div className="grid gap-3 text-sm md:grid-cols-3 md:text-right">
                    <div>
                      <p className="text-warm-gray">Requested</p>
                      <p className="font-semibold text-espresso">
                        {formatMoney(project.requested_budget)}
                      </p>
                    </div>
                    <div>
                      <p className="text-warm-gray">Allocated</p>
                      {pending ? (
                        <p className="font-semibold text-peach">Pending</p>
                      ) : (
                        <p className="font-semibold text-espresso">
                          {formatMoney(project.allocated_budget ?? 0)}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-warm-gray">Submitted</p>
                      <p className="font-semibold text-espresso">{formatDate(project.created_at)}</p>
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <p className="rounded-xl border border-sand bg-cream px-5 py-12 text-center text-sm text-warm-gray">
            No budget requests found
          </p>
        )}
      </section>

      {selectedProject ? (
        <BudgetReviewSheet
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onAllocated={handleAllocated}
        />
      ) : null}
    </div>
  );
}
