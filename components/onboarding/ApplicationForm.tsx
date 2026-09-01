'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Project } from '@/types/projects';
import type { Shift } from '@/types/shifts';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { formatDate } from '@/lib/format-date';

type ApplicationFormUser = {
  first_name: string;
  last_name: string;
  email: string;
};

type ApplicationFormProps = {
  project: Project;
  shifts: Shift[];
  user: ApplicationFormUser;
  maxSteps?: 2 | 4;
  onSubmitted?: (applicationId: string) => void;
};

type ApplicationFormData = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  guardian_name: string;
  guardian_email: string;
  guardian_phone: string;
  why_join: string;
  experience: string;
};

const stepLabels = {
  2: ['Basics', 'Submit'],
  4: ['Basics', 'About you', 'Availability', 'Submit'],
};

function formatShift(shift: Shift) {
  const start = new Date(shift.start_datetime);
  const end = new Date(shift.end_datetime);

  return `${formatDate(start, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })} - ${formatDate(end, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function ApplicationForm({
  project,
  shifts,
  user,
  maxSteps = 4,
  onSubmitted,
}: ApplicationFormProps) {
  const router = useRouter();
  const steps = stepLabels[maxSteps];
  const submitStep = maxSteps;
  const [currentStep, setCurrentStep] = useState(1);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ApplicationFormData>({
    first_name: user.first_name,
    last_name: user.last_name,
    email: user.email,
    phone: '',
    guardian_name: '',
    guardian_email: '',
    guardian_phone: '',
    why_join: '',
    experience: '',
  });

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  function updateField(field: keyof ApplicationFormData, value: string) {
    setFormData((current) => ({ ...current, [field]: value }));
  }

  function goNext() {
    if (currentStep < submitStep) {
      setCurrentStep((step) => step + 1);
      return;
    }

    void submitApplication();
  }

  async function submitApplication() {
    setSubmitError('');

    if (maxSteps === 4 && !formData.why_join.trim()) {
      setSubmitError('Please tell us why you want to join before submitting.');
      return;
    }

    setIsSubmitting(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        project_id: project.project_id,
        why_join: maxSteps === 2 ? 'Mid application submitted.' : formData.why_join,
        experience: maxSteps === 2 ? null : formData.experience || null,
        availability_notes: null,
        first_name: formData.first_name,
        last_name: formData.last_name,
        phone: formData.phone,
        guardian_name: formData.guardian_name,
        guardian_email: formData.guardian_email,
        guardian_phone: formData.guardian_phone || null,
      }),
    });

    const body = (await response.json()) as ApiResponse<{ application_id: string }>;

    if (!response.ok || body.error || !body.data) {
      setSubmitError(body.error?.message ?? 'Something went wrong. Please try again.');
      setIsSubmitting(false);
      return;
    }

    if (onSubmitted) {
      onSubmitted(body.data.application_id);
      return;
    }

    router.push('/pending');
  }

  return (
    <div className="rounded-xl border border-sand bg-cream p-6">
      <div className="mb-8">
        <div className="h-2 rounded-full bg-sand">
          <div
            className="h-2 rounded-full bg-peach transition-all"
            style={{ width: `${(currentStep / steps.length) * 100}%` }}
          />
        </div>
        <div
          className={
            maxSteps === 2
              ? 'mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-warm-gray'
              : 'mt-3 grid grid-cols-4 gap-2 text-xs font-semibold text-warm-gray'
          }
        >
          {steps.map((step, index) => (
            <span key={step} className={index + 1 <= currentStep ? 'text-espresso' : ''}>
              {step}
            </span>
          ))}
        </div>
      </div>

      {currentStep === 1 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Input label="First name" value={formData.first_name} onChange={() => undefined} readOnly />
          <Input label="Last name" value={formData.last_name} onChange={() => undefined} readOnly />
          <Input label="Email" type="email" value={formData.email} onChange={() => undefined} readOnly />
          <Input
            label="Phone"
            type="tel"
            value={formData.phone}
            onChange={(value) => updateField('phone', value)}
            placeholder="Phone number"
          />
          <Input
            label="Guardian name"
            value={formData.guardian_name}
            onChange={(value) => updateField('guardian_name', value)}
            placeholder="Parent or guardian"
            required
          />
          <Input
            label="Guardian email"
            type="email"
            value={formData.guardian_email}
            onChange={(value) => updateField('guardian_email', value)}
            placeholder="Guardian email address"
            required
          />
          <Input
            label="Guardian phone"
            type="tel"
            value={formData.guardian_phone}
            onChange={(value) => updateField('guardian_phone', value)}
            placeholder="Optional"
          />
        </div>
      ) : null}

      {maxSteps === 4 && currentStep === 2 ? (
        <div className="space-y-5">
          <Textarea
            label="Why do you want to join?"
            value={formData.why_join}
            onChange={(value) => updateField('why_join', value)}
            placeholder="Share what draws you to this project."
            rows={5}
            required
          />
          <Textarea
            label="Relevant experience"
            value={formData.experience}
            onChange={(value) => updateField('experience', value)}
            placeholder="Optional"
            rows={5}
          />
        </div>
      ) : null}

      {maxSteps === 4 && currentStep === 3 ? (
        <div className="space-y-4">
          {shifts.length > 0 ? (
            shifts.map((shift) => (
              <div key={shift.shift_id} className="rounded-lg border border-sand p-4">
                <p className="font-semibold text-espresso">{formatShift(shift)}</p>
                <p className="mt-1 text-sm text-warm-gray">
                  {shift.location ?? project.location ?? 'Location to be shared'}
                </p>
                {shift.notes ? (
                  <p className="mt-3 text-sm leading-6 text-brown-mid">{shift.notes}</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-sand p-4 text-sm text-warm-gray">
              Shift details will be shared soon.
            </p>
          )}
        </div>
      ) : null}

      {currentStep === submitStep ? (
        <div className="space-y-5">
          <div className="rounded-lg border border-sand p-4">
            <h2 className="font-semibold text-espresso">Application summary</h2>
            <dl className="mt-4 space-y-3 text-sm text-brown-mid">
              <div>
                <dt className="font-semibold text-espresso">Applicant</dt>
                <dd>{formData.first_name} {formData.last_name}</dd>
              </div>
              <div>
                <dt className="font-semibold text-espresso">Guardian</dt>
                <dd>{formData.guardian_name || 'Not provided'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-espresso">Why join</dt>
                <dd>{formData.why_join || 'Not provided'}</dd>
              </div>
            </dl>
          </div>

          {submitError ? <p className="text-sm text-red-500">{submitError}</p> : null}
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between">
        {currentStep > 1 ? (
          <Button variant="ghost" onClick={() => setCurrentStep((step) => step - 1)}>
            Back
          </Button>
        ) : (
          <span />
        )}

        <Button onClick={goNext} disabled={isSubmitting}>
          {currentStep === submitStep ? (isSubmitting ? 'Submitting...' : 'Submit') : 'Next'}
        </Button>
      </div>
    </div>
  );
}
