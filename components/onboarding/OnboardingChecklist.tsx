'use client';

import type * as React from 'react';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Onboarding } from '@/types/onboarding';
import { Button } from '@/components/ui/Button';
import { StatusDot } from '@/components/ui/StatusDot';
import { formatDate } from '@/lib/format-date';

type OnboardingChecklistProps = {
  onboarding: Onboarding;
};

type ReminderResponse = {
  reminder_sent: boolean;
  next_allowed_at: string;
};

type StepState = 'done' | 'active' | 'locked';

type ChecklistStep = {
  label: string;
  status: StepState;
  action?: React.ReactNode;
};

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-8 w-8 text-peach"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function formatNextAllowedAt(value: string) {
  return formatDate(new Date(value), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function OnboardingChecklist({ onboarding }: OnboardingChecklistProps) {
  const [message, setMessage] = useState('');
  const [isSendingReminder, setIsSendingReminder] = useState(false);

  const supabase = useMemo(
    () =>
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      ),
    [],
  );

  const slackDone = onboarding.slack_connected;
  const orientationDone = onboarding.orientation_completed_at !== null;
  const waiverDone = onboarding.waiver_status === 'Signed';
  const parentalConsentDone = onboarding.parental_consent_status === 'Signed';
  // TODO: re-enable Slack gate when Slack OAuth is wired
  const orientationActive = !orientationDone;
  const allPreReviewDone = orientationDone && waiverDone && parentalConsentDone;

  async function sendReminder() {
    setMessage('');
    setIsSendingReminder(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch('/api/onboarding/resend-parental-consent', {
      method: 'POST',
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    });

    const body = (await response.json()) as ApiResponse<ReminderResponse>;

    if (!response.ok || body.error) {
      setMessage(body.error?.message ?? 'Reminder could not be sent yet.');
      setIsSendingReminder(false);
      return;
    }

    setMessage(`Reminder sent. Next reminder available ${formatNextAllowedAt(body.data.next_allowed_at)}.`);
    setIsSendingReminder(false);
  }

  const steps: ChecklistStep[] = [
    {
      label: 'Application submitted',
      status: 'done',
    },
    {
      label: 'Connect Slack account',
      status: slackDone ? 'done' : 'active',
      action: slackDone ? undefined : (
        <Button variant="primary" size="sm" disabled>
          Coming soon
        </Button>
      ),
    },
    {
      label: 'Orientation videos',
      status: orientationDone ? 'done' : orientationActive ? 'active' : 'locked',
      action:
        !orientationDone && orientationActive ? (
          <Link className="text-sm font-semibold text-espresso underline" href="/pending/orientation">
            Start
          </Link>
        ) : undefined,
    },
    {
      label: 'Liability waiver',
      status: waiverDone ? 'done' : orientationDone ? 'active' : 'locked',
    },
    {
      label: 'Parental consent',
      status: parentalConsentDone ? 'done' : waiverDone ? 'active' : 'locked',
      action:
        onboarding.parental_consent_status === 'Sent' && !parentalConsentDone ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={sendReminder}
            disabled={isSendingReminder}
          >
            {isSendingReminder ? 'Sending...' : 'Send reminder'}
          </Button>
        ) : undefined,
    },
    {
      label: 'Project lead review',
      status: allPreReviewDone ? 'active' : 'locked',
    },
  ];

  return (
    <div>
      <section className="mb-8 rounded-xl border border-sand bg-cream p-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-peach-light">
          <ClockIcon />
        </div>
        <h1 className="text-3xl font-bold text-espresso">You're in the queue</h1>
        <p className="mt-2 text-sm text-warm-gray">
          Complete the steps below while you wait.
        </p>
      </section>

      <section className="rounded-xl border border-sand bg-cream">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className={`flex items-center gap-4 border-b border-sand px-5 py-4 last:border-b-0 ${
              step.status === 'locked' ? 'opacity-50' : ''
            }`}
          >
            <StatusDot status={step.status} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-espresso">
                {index + 1}. {step.label}
              </p>
            </div>
            {step.status === 'done' ? (
              <span className="text-sm font-semibold text-green-600">Done</span>
            ) : null}
            {step.action}
          </div>
        ))}
      </section>

      {message ? <p className="mt-4 text-sm text-brown-mid">{message}</p> : null}
    </div>
  );
}
