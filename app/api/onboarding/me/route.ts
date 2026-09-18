/**
 * app/api/onboarding/me/route.ts
 * GET /api/onboarding/me
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { Onboarding, OrientationProgress } from '@/types/onboarding';

type OnboardingRow = Omit<Onboarding, 'orientation_progress'> & {
  orientation_progress: string | null;
};

function isOrientationProgress(value: unknown): value is OrientationProgress {
  if (!value || typeof value !== 'object') return false;

  const progress = value as Record<string, unknown>;
  return (
    typeof progress.welcome === 'boolean' &&
    typeof progress.safety === 'boolean' &&
    typeof progress.how_we_work === 'boolean' &&
    typeof progress.faqs === 'boolean'
  );
}

function parseOrientationProgress(raw: string | null): OrientationProgress | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isOrientationProgress(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<Onboarding>>> {
  try {
    // 1. Verify Auth
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const onboardingColumns = `
      onboarding_id,
      user_id,
      slack_connected,
      slack_connected_at,
      orientation_started_at,
      orientation_completed_at,
      orientation_progress,
      waiver_status,
      waiver_doc_id,
      waiver_signed_at,
      parental_consent_status,
      parental_consent_doc_id,
      parental_consent_signed_at,
      completed_at
    `;

    // 2. Fetch current user's onboarding record
    const { data: onboarding, error: onboardingError } = await supabaseAdmin
      .from('onboarding')
      .select(onboardingColumns)
      .eq('user_id', auth.userId)
      .maybeSingle<OnboardingRow>();

    if (onboardingError) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Onboarding record not found' } },
        { status: 404 }
      );
    }

    let onboardingRow = onboarding;

    if (!onboardingRow) {
      // A users row can exist with no matching onboarding row if a past
      // POST /api/applications call created the user but failed partway
      // through creating onboarding (or predates that logic). Self-heal here
      // rather than leaving the user stuck: create the default record if
      // they have a users row, same defaults POST /api/applications uses.
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('user_id')
        .eq('user_id', auth.userId)
        .maybeSingle();

      if (!existingUser) {
        return NextResponse.json(
          { data: null, error: { code: 'NOT_FOUND', message: 'Onboarding record not found' } },
          { status: 404 }
        );
      }

      const { data: createdOnboarding, error: createOnboardingError } = await supabaseAdmin
        .from('onboarding')
        .insert({
          user_id: auth.userId,
          slack_connected: false,
          waiver_status: 'Not Started',
          parental_consent_status: 'Not Started',
        })
        .select(onboardingColumns)
        .single<OnboardingRow>();

      if (createOnboardingError || !createdOnboarding) {
        return NextResponse.json(
          { data: null, error: { code: 'NOT_FOUND', message: 'Onboarding record not found' } },
          { status: 404 }
        );
      }

      onboardingRow = createdOnboarding;
    }

    // 3. Return API shape with orientation_progress parsed from TEXT to object
    return NextResponse.json({
      data: {
        ...onboardingRow,
        orientation_progress: parseOrientationProgress(onboardingRow.orientation_progress),
      },
      error: null,
    });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
