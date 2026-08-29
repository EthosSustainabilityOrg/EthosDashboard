import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { ApiResponse } from '@/types/api';
import type { Application } from '@/types/applications';
import type { Onboarding } from '@/types/onboarding';
import { OnboardingChecklist } from '@/components/onboarding/OnboardingChecklist';

type ApplicationsResponse = {
  applications: Application[];
};

export default async function PendingPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          return;
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  const { data: userData } = await supabase
    .from('users')
    .select('org_role_id, onboarding_complete')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (!userData) {
    redirect('/projects');
  }

  if (userData.org_role_id !== 1) {
    redirect('/home');
  }

  const protocol = headerStore.get('x-forwarded-proto') ?? 'http';
  const host = headerStore.get('host');

  if (!host) {
    redirect('/projects');
  }

  const onboardingResponse = await fetch(`${protocol}://${host}/api/onboarding/me`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: 'no-store',
  });

  const onboardingBody = (await onboardingResponse.json()) as ApiResponse<Onboarding>;

  if (!onboardingBody.data) {
    redirect('/projects');
  }

  const applicationsResponse = await fetch(`${protocol}://${host}/api/applications`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: 'no-store',
  });

  const applicationsBody =
    (await applicationsResponse.json()) as ApiResponse<ApplicationsResponse>;

  const applications = applicationsBody.data?.applications ?? [];
  const latestApplication = applications[0];

  if (latestApplication?.status === 'Rejected') {
    redirect('/rejected');
  }

  // Screen 1.5 — the welcome screen must win over the /home redirect below, otherwise a
  // newly approved member never sees it.
  if (onboardingBody.data.completed_at && latestApplication?.status === 'Approved') {
    redirect('/approved');
  }

  if (userData.onboarding_complete) {
    redirect('/home');
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-8 py-10">
      <OnboardingChecklist onboarding={onboardingBody.data} />
    </div>
  );
}
