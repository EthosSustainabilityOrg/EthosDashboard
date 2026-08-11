'use client';

import { useEffect, useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Shift } from '@/types/shifts';
import type { OpenCallProject, OpenCallUser } from '@/components/open-calls/OpenCallsBoard';
import { ApplicationForm } from '@/components/onboarding/ApplicationForm';

type OpenCallApplicationSheetProps = {
  project: OpenCallProject;
  maxSteps: 2 | 4;
  user: OpenCallUser;
  onClose: () => void;
  onSubmitted: (applicationId: string) => void;
};

type ProjectShiftsResponse = {
  shifts: Array<Omit<Shift, 'project_id'>>;
};

export function OpenCallApplicationSheet({
  project,
  maxSteps,
  user,
  onClose,
  onSubmitted,
}: OpenCallApplicationSheetProps) {
  const [shifts, setShifts] = useState<Shift[]>([]);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  useEffect(() => {
    async function loadShifts() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(`/api/projects/${project.project_id}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });

      const body = (await response.json()) as ApiResponse<ProjectShiftsResponse>;

      setShifts(
        (body.data?.shifts ?? []).map((shift) => ({ ...shift, project_id: project.project_id })),
      );
    }

    void loadShifts();
  }, [supabase, project.project_id]);

  return (
    <>
      <button
        type="button"
        aria-label="Close application form"
        className="fixed inset-0 z-40 bg-espresso/20"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-cream p-6 shadow-lg">
        <div className="mx-auto max-w-3xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-espresso">{project.name}</h2>
              <p className="mt-1 text-sm text-warm-gray">
                {maxSteps === 2 ? 'Quick application' : 'Full application'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-1 text-2xl leading-none text-warm-gray hover:bg-sand hover:text-espresso"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <ApplicationForm
            project={project}
            shifts={shifts}
            user={{
              first_name: user.first_name,
              last_name: user.last_name,
              email: user.email,
            }}
            maxSteps={maxSteps}
            onSubmitted={onSubmitted}
          />
        </div>
      </div>
    </>
  );
}
