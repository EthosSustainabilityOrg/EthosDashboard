'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { reconcileChildren } from '@/lib/project-children-sync';
import type { ApiResponse } from '@/types/api';
import type { Chapter } from '@/types/chapters';
import type { Project, ProjectType } from '@/types/projects';
import { Button } from '@/components/ui/Button';
import { ProgressSteps } from '@/components/ui/ProgressSteps';
import { ApplicationSettingsStep } from '@/components/lead/project-wizard/ApplicationSettingsStep';
import { ProjectInfoStep } from '@/components/lead/project-wizard/ProjectInfoStep';
import { ProjectSettingsStep } from '@/components/lead/project-wizard/ProjectSettingsStep';
import { ReviewStep } from '@/components/lead/project-wizard/ReviewStep';
import { RolesStep } from '@/components/lead/project-wizard/RolesStep';
import { ShiftsStep } from '@/components/lead/project-wizard/ShiftsStep';

export type ChapterOption = Pick<Chapter, 'chapter_id' | 'name' | 'is_hq' | 'location'>;

export type WizardShift = {
  id: string;
  start_datetime: string;
  end_datetime: string;
  location: string;
  capacity: string;
  notes: string;
};

export type WizardRole = {
  id: string;
  role_name: string;
  description: string;
  capacity: string;
};

export type WizardFormData = {
  name: string;
  project_type_id: number | null;
  chapter_id: string;
  description: string;
  is_virtual: boolean;
  location: string;
  requested_budget: string;
  max_applications: string;
  is_open_call: boolean;
  open_call_app_level: '' | 'Full App' | 'Mid App' | 'No App';
  shifts: WizardShift[];
  roles: WizardRole[];
};

type CreateProjectWizardProps = {
  chapters: ChapterOption[];
  projectTypes: ProjectType[];
  isBoard: boolean;
  currentChapterId: string;
};

type CreatedProjectResponse = Project;

const steps = ['Info', 'Shifts', 'Roles', 'Application', 'Settings', 'Review'];

function createEmptyFormData(chapters: ChapterOption[]): WizardFormData {
  return {
    name: '',
    project_type_id: null,
    chapter_id: chapters[0]?.chapter_id ?? '',
    description: '',
    is_virtual: false,
    location: '',
    requested_budget: '',
    max_applications: '',
    is_open_call: false,
    open_call_app_level: '',
    shifts: [],
    roles: [],
  };
}

function toNumberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}

export function CreateProjectWizard({
  chapters,
  projectTypes,
  isBoard,
  currentChapterId,
}: CreateProjectWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [formData, setFormData] = useState<WizardFormData>(() => ({
    ...createEmptyFormData(chapters),
    chapter_id: currentChapterId || chapters[0]?.chapter_id || '',
  }));
  // Maps a wizard-local shift/role id to the row id the server assigned it, for the
  // current projectId.
  //
  // WHY THIS IS A MAP AND NOT A SET OF INDEXES
  // Save Draft and Publish both reuse an existing projectId on retry, so something has
  // to remember which children already exist or a retry re-POSTs them. The previous
  // version tracked array indexes and cleared the whole set whenever the user touched
  // shifts or roles, on the grounds that the indexes would no longer line up. Clearing
  // traded misalignment for duplication, which is worse: fill in three shifts, fail at
  // publish, go back and fix one shift's end time, publish again, and all three POST a
  // second time. The project ends up with six shifts, three of them orphans holding the
  // pre-edit values.
  //
  // Keying on the stable local id instead means an edit is an edit. Children the server
  // already has get PATCHed, new ones get POSTed, and ones the user deleted get DELETEd.
  const createdShiftIds = useRef<Map<string, string>>(new Map());
  const createdRoleIds = useRef<Map<string, string>>(new Map());

  const [readinessChecked, setReadinessChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  function updateFormData(update: Partial<WizardFormData>) {
    // Deliberately does not reset the id maps. An edit to shifts or roles is
    // reconciled on the next save, not re-created from scratch.
    setFormData((current) => ({ ...current, ...update }));
  }

  function stepIsValid(step: number): boolean {
    if (step === 1) {
      return Boolean(
        formData.name.trim() &&
          formData.project_type_id &&
          formData.description.trim() &&
          formData.max_applications.trim(),
      );
    }

    return true;
  }

  function goToNextStep() {
    if (!stepIsValid(currentStep)) {
      setStepError('Please fill in all required fields.');
      return;
    }

    setStepError(null);
    setCurrentStep((step) => step + 1);
  }

  function goToPreviousStep() {
    setStepError(null);
    setCurrentStep((step) => step - 1);
  }

  async function getAuthHeaders() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }

  async function createDraftProject() {
    const headers = await getAuthHeaders();

    const response = await fetch('/api/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: formData.name,
        project_type_id: formData.project_type_id,
        chapter_id: formData.chapter_id,
        description: formData.description,
        is_virtual: formData.is_virtual,
        location: formData.is_virtual ? null : formData.location,
        requested_budget: toNumberOrNull(formData.requested_budget),
        max_applications: toInteger(formData.max_applications),
        is_open_call: formData.is_open_call,
        open_call_app_level: formData.is_open_call ? formData.open_call_app_level : null,
      }),
    });

    const body = (await response.json()) as ApiResponse<CreatedProjectResponse>;

    if (!response.ok || body.error) {
      throw new Error(body.error?.message ?? 'Could not create project.');
    }

    setProjectId(body.data.project_id);
    return body.data.project_id;
  }

  /**
   * Brings the server's shifts and roles in line with what the wizard holds.
   * See lib/project-children-sync.ts for the reconcile rules and why they live there.
   */
  async function syncProjectChildren(nextProjectId: string) {
    const headers = await getAuthHeaders();

    await reconcileChildren<WizardShift>({
      items: formData.shifts,
      known: createdShiftIds.current,
      collectionUrl: `/api/projects/${nextProjectId}/shifts`,
      serverIdField: 'shift_id',
      noun: 'shift',
      headers,
      validate: (shift) => {
        if (shift.end_datetime <= shift.start_datetime) {
          throw new Error('End time must be after start time');
        }
      },
      toPayload: (shift) => ({
        start_datetime: shift.start_datetime,
        end_datetime: shift.end_datetime,
        location: shift.location || null,
        capacity: Number(shift.capacity),
        notes: shift.notes || null,
      }),
    });

    await reconcileChildren<WizardRole>({
      items: formData.roles,
      known: createdRoleIds.current,
      collectionUrl: `/api/projects/${nextProjectId}/roles`,
      serverIdField: 'project_role_id',
      noun: 'role',
      headers,
      toPayload: (role) => ({
        role_name: role.role_name,
        description: role.description || null,
        capacity: Number(role.capacity),
      }),
    });
  }

  async function saveDraft() {
    setPublishError(null);
    setIsSaving(true);

    try {
      const nextProjectId = projectId ?? await createDraftProject();
      await syncProjectChildren(nextProjectId);
      router.push('/lead-projects');
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Could not save this project.');
      setIsSaving(false);
    }
  }

  async function publishProject() {
    setPublishError(null);
    setIsSaving(true);

    try {
      const nextProjectId = projectId ?? await createDraftProject();
      await syncProjectChildren(nextProjectId);

      const headers = await getAuthHeaders();
      const response = await fetch(`/api/projects/${nextProjectId}/publish`, {
        method: 'POST',
        headers,
      });

      const body = (await response.json()) as ApiResponse<Project>;

      if (!response.ok || body.error) {
        throw new Error(body.error?.message ?? 'Could not publish this project.');
      }

      router.push('/lead-projects');
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Could not publish this project.');
      setIsSaving(false);
    }
  }

  function renderStep() {
    if (currentStep === 1) {
      return (
        <ProjectInfoStep
          formData={formData}
          onChange={updateFormData}
          chapters={chapters}
          projectTypes={projectTypes}
          isBoard={isBoard}
          currentChapterId={currentChapterId || formData.chapter_id}
        />
      );
    }

    if (currentStep === 2) {
      return <ShiftsStep shifts={formData.shifts} onChange={(shifts) => updateFormData({ shifts })} />;
    }

    if (currentStep === 3) {
      return <RolesStep roles={formData.roles} onChange={(roles) => updateFormData({ roles })} />;
    }

    if (currentStep === 4) {
      return <ApplicationSettingsStep formData={formData} onChange={updateFormData} />;
    }

    if (currentStep === 5) {
      return (
        <ProjectSettingsStep
          formData={formData}
          onChange={updateFormData}
          readinessChecked={readinessChecked}
          onReadinessChange={setReadinessChecked}
        />
      );
    }

    return (
      <ReviewStep
        formData={formData}
        chapters={chapters}
        projectTypes={projectTypes}
        onEditStep={setCurrentStep}
        isSaving={isSaving}
        publishError={publishError}
        onBack={goToPreviousStep}
        onSaveDraft={saveDraft}
        onPublish={publishProject}
      />
    );
  }

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-espresso">New Project</h1>
        <div className="mt-6">
          <ProgressSteps
            steps={steps}
            currentStep={currentStep}
            onStepClick={(step) => setCurrentStep(step)}
          />
        </div>
      </header>

      <section className="rounded-2xl border border-sand bg-cream p-8">
        {renderStep()}

        {currentStep < 6 && publishError ? (
          <p className="mt-6 text-sm text-red-500">{publishError}</p>
        ) : null}

        {currentStep < 6 && stepError ? (
          <p className="mt-6 text-sm text-red-500">{stepError}</p>
        ) : null}

        {currentStep < 6 ? (
          <div className="mt-8 flex items-center justify-between">
            {currentStep > 1 ? (
              <Button variant="ghost" onClick={goToPreviousStep}>
                Back
              </Button>
            ) : (
              <span />
            )}

            <Button onClick={goToNextStep}>Next</Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
