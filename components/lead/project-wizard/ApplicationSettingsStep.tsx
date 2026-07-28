import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import type { WizardFormData } from './CreateProjectWizard';

type ApplicationSettingsStepProps = {
  formData: WizardFormData;
  onChange: (update: Partial<WizardFormData>) => void;
};

export function ApplicationSettingsStep({
  formData,
  onChange,
}: ApplicationSettingsStepProps) {
  return (
    <div className="space-y-6">
      <Toggle
        checked={formData.is_open_call}
        onChange={(value) => onChange({ is_open_call: value })}
        label="Open Call"
      />

      {formData.is_open_call ? (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-espresso">Application level</span>
            <span
              title={'Full App: applicants complete the full 4-step form\nMid App: applicants complete basics only (2 steps)\nNo App: volunteers can join instantly with one click'}
              className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-sand text-xs font-bold text-warm-gray"
            >
              i
            </span>
          </div>
          <Select
            value={formData.open_call_app_level}
            onChange={(value) =>
              onChange({
                open_call_app_level: value as WizardFormData['open_call_app_level'],
              })
            }
            options={[
              { value: '', label: 'Select level' },
              { value: 'Full App', label: 'Full App' },
              { value: 'Mid App', label: 'Mid App' },
              { value: 'No App', label: 'No App' },
            ]}
          />
        </div>
      ) : null}

      <div className="rounded-lg border border-sand bg-sand p-4">
        <p className="text-sm font-semibold text-espresso">Max volunteers</p>
        <p className="mt-1 text-sm text-warm-gray">
          {formData.max_applications || 'Not set yet'}
        </p>
      </div>

      <div className="rounded-lg border border-sand bg-sand p-4 opacity-60">
        <p className="text-sm font-semibold text-espresso">Custom questions</p>
        <p className="mt-1 text-sm text-warm-gray">Coming soon</p>
      </div>
    </div>
  );
}
