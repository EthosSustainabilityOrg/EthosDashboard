import type * as React from 'react';
import type { ProjectType } from '@/types/projects';
import { Button } from '@/components/ui/Button';
import type { ChapterOption, WizardFormData } from './CreateProjectWizard';

type ReviewStepProps = {
  formData: WizardFormData;
  chapters: ChapterOption[];
  projectTypes: ProjectType[];
  onEditStep: (step: number) => void;
  isSaving: boolean;
  publishError: string | null;
  onBack: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
};

function Section({
  title,
  step,
  onEditStep,
  children,
}: {
  title: string;
  step: number;
  onEditStep: (step: number) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-sand p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 className="font-semibold text-espresso">{title}</h3>
        <button
          type="button"
          onClick={() => onEditStep(step)}
          className="text-sm font-semibold text-espresso underline"
        >
          Edit
        </button>
      </div>
      <div className="space-y-1 text-sm text-warm-gray">{children}</div>
    </section>
  );
}

export function ReviewStep({
  formData,
  chapters,
  projectTypes,
  onEditStep,
  isSaving,
  publishError,
  onBack,
  onSaveDraft,
  onPublish,
}: ReviewStepProps) {
  const chapter = chapters.find((item) => item.chapter_id === formData.chapter_id);
  const projectType = projectTypes.find((item) => item.type_id === formData.project_type_id);

  return (
    <div className="space-y-4">
      <Section title="Project Info" step={1} onEditStep={onEditStep}>
        <p>{formData.name || 'Untitled project'}</p>
        <p>{projectType?.type_name ?? 'No type selected'}</p>
        <p>{chapter?.name ?? 'No chapter selected'}</p>
        <p>{formData.is_virtual ? 'Virtual' : formData.location || 'No location set'}</p>
        <p>{formData.description || 'No description added'}</p>
      </Section>

      <Section title="Shifts" step={2} onEditStep={onEditStep}>
        <p>{formData.shifts.length} shifts added</p>
      </Section>

      <Section title="Roles" step={3} onEditStep={onEditStep}>
        <p>{formData.roles.length} roles added</p>
      </Section>

      <Section title="Application" step={4} onEditStep={onEditStep}>
        <p>{formData.is_open_call ? 'Open Call' : 'Not an Open Call'}</p>
        <p>{formData.open_call_app_level || 'No application level selected'}</p>
        <p>{formData.max_applications || 'No max volunteer count set'} max volunteers</p>
      </Section>

      <Section title="Settings" step={5} onEditStep={onEditStep}>
        <p>Draft until published.</p>
      </Section>

      {publishError ? <p className="text-sm text-red-500">{publishError}</p> : null}

      <div className="flex items-center justify-between gap-4 pt-4">
        <Button variant="ghost" onClick={onBack} disabled={isSaving}>
          ← Back
        </Button>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onSaveDraft} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Draft'}
          </Button>
          <Button variant="primary" onClick={onPublish} disabled={isSaving}>
            {isSaving ? 'Publishing...' : 'Publish Project'}
          </Button>
        </div>
      </div>
    </div>
  );
}
