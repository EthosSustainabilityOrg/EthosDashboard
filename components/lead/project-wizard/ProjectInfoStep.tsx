import type { ProjectType } from '@/types/projects';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Toggle } from '@/components/ui/Toggle';
import type { ChapterOption, WizardFormData } from './CreateProjectWizard';

type ProjectInfoStepProps = {
  formData: WizardFormData;
  onChange: (update: Partial<WizardFormData>) => void;
  chapters: ChapterOption[];
  projectTypes: ProjectType[];
  isBoard: boolean;
  currentChapterId: string;
};

export function ProjectInfoStep({
  formData,
  onChange,
  chapters,
  projectTypes,
  isBoard,
  currentChapterId,
}: ProjectInfoStepProps) {
  const currentChapter = chapters.find((chapter) => chapter.chapter_id === currentChapterId);
  const standardTypes = projectTypes.filter((type) => type.type_id >= 1 && type.type_id <= 3);
  const hqTypes = projectTypes.filter((type) => type.type_id >= 10);

  return (
    <div className="space-y-6">
      <Input
        label="Project name"
        value={formData.name}
        onChange={(value) => onChange({ name: value })}
        placeholder="Project name"
        name="name"
        required
      />

      <Select
        label="Project type"
        value={formData.project_type_id ? String(formData.project_type_id) : ''}
        onChange={(value) => onChange({ project_type_id: value ? Number(value) : null })}
        required
        options={[
          { value: '', label: 'Select a project type' },
          ...standardTypes.map((type) => ({
            value: String(type.type_id),
            label: type.type_name,
          })),
          { value: 'separator-hq', label: '--- HQ Teams ---' },
          ...hqTypes.map((type) => ({
            value: String(type.type_id),
            label: type.type_name,
          })),
        ]}
      />

      {isBoard ? (
        <Select
          label="Chapter"
          value={formData.chapter_id}
          onChange={(value) => onChange({ chapter_id: value })}
          options={chapters.map((chapter) => ({
            value: chapter.chapter_id,
            label: chapter.name,
          }))}
        />
      ) : (
        <div>
          <p className="mb-2 text-sm font-semibold text-espresso">Chapter</p>
          <div className="rounded-md border border-sand bg-sand px-3 py-3 text-sm text-espresso">
            {currentChapter?.name ?? 'Your chapter'}
          </div>
        </div>
      )}

      <Textarea
        label="Description"
        value={formData.description}
        onChange={(value) => onChange({ description: value })}
        placeholder="Describe the project and what volunteers will do."
        name="description"
        rows={5}
        required
      />

      <Toggle
        checked={formData.is_virtual}
        onChange={(value) => onChange({ is_virtual: value })}
        label="Virtual project"
      />

      {!formData.is_virtual ? (
        <Input
          label="Location"
          value={formData.location}
          onChange={(value) => onChange({ location: value })}
          placeholder="Project location"
          name="location"
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          label="Requested budget"
          type="number"
          value={formData.requested_budget}
          onChange={(value) => onChange({ requested_budget: value })}
          placeholder="Optional"
          name="requested_budget"
        />
        <Input
          label="Max volunteers"
          type="number"
          value={formData.max_applications}
          onChange={(value) => onChange({ max_applications: value })}
          placeholder="Required"
          name="max_applications"
          required
        />
      </div>
    </div>
  );
}
