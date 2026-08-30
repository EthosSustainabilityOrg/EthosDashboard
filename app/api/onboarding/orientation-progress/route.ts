/**
 * app/api/onboarding/orientation-progress/route.ts
 * PATCH /api/onboarding/orientation-progress
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import { unlockOnboardingIfApproved } from '@/lib/onboarding';
import type { ApiResponse } from '@/types/api';
import type { Onboarding, OrientationProgress } from '@/types/onboarding';

type OnboardingRow = Omit<Onboarding, 'orientation_progress'> & {
  orientation_progress: string | null;
};

type OrientationChapter = keyof OrientationProgress;

type OrientationProgressInput = {
  chapter: OrientationChapter;
  completed: boolean;
};

const ORIENTATION_CHAPTERS: readonly OrientationChapter[] = [
  'welcome',
  'safety',
  'how_we_work',
  'faqs',
];

function isOrientationChapter(value: unknown): value is OrientationChapter {
  return typeof value === 'string' && ORIENTATION_CHAPTERS.includes(value as OrientationChapter);
}

function isOrientationProgressInput(value: unknown): value is OrientationProgressInput {
  if (!value || typeof value !== 'object') return false;

  const body = value as Record<string, unknown>;
  return isOrientationChapter(body.chapter) && typeof body.completed === 'boolean';
}

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

function createDefaultOrientationProgress(): OrientationProgress {
  return {
    welcome: false,
    safety: false,
    how_we_work: false,
    faqs: false,
  };
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

function allChaptersCompleted(progress: OrientationProgress): boolean {
  return ORIENTATION_CHAPTERS.every((chapter) => progress[chapter]);
}

function toOnboarding(row: OnboardingRow): Onboarding {
  return {
    ...row,
    orientation_progress: parseOrientationProgress(row.orientation_progress),
  };
}

export async function PATCH(req: NextRequest): Promise<NextResponse<ApiResponse<Onboarding>>> {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
        { status: 401 }
      );
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 }
      );
    }

    const claims = extractClaims(token);
    if (!claims?.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token payload' } },
        { status: 401 }
      );
    }

    const rawBody: unknown = await req.json().catch(() => null);
    if (!isOrientationProgressInput(rawBody)) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'chapter must be welcome, safety, how_we_work, or faqs, and completed must be boolean',
          },
        },
        { status: 400 }
      );
    }

    const { data: onboarding, error: fetchError } = await supabaseAdmin
      .from('onboarding')
      .select(`
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
      `)
      .eq('user_id', claims.sub)
      .maybeSingle<OnboardingRow>();

    if (fetchError || !onboarding) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Onboarding record not found' } },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();
    const currentProgress = parseOrientationProgress(onboarding.orientation_progress) ?? createDefaultOrientationProgress();
    const updatedProgress: OrientationProgress = {
      ...currentProgress,
      [rawBody.chapter]: rawBody.completed,
    };

    const orientationCompletedAt = allChaptersCompleted(updatedProgress)
      ? now
      : onboarding.orientation_completed_at;

    // Orientation is normally finished before the waiver unlocks, but a member can
    // re-open a chapter and re-complete it after signing. When that makes orientation
    // the last outstanding step, this is where onboarding finishes.
    // TODO: re-enable Slack gate when Slack OAuth is wired
    const preReviewComplete =
      // onboarding.slack_connected &&
      orientationCompletedAt !== null &&
      onboarding.waiver_status === 'Signed' &&
      onboarding.parental_consent_status === 'Signed';

    const { data: updatedOnboarding, error: updateError } = await supabaseAdmin
      .from('onboarding')
      .update({
        orientation_progress: JSON.stringify(updatedProgress),
        orientation_started_at: onboarding.orientation_started_at ?? now,
        orientation_completed_at: orientationCompletedAt,
        completed_at: preReviewComplete ? (onboarding.completed_at ?? now) : onboarding.completed_at,
      })
      .eq('onboarding_id', onboarding.onboarding_id)
      .select(`
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
      `)
      .maybeSingle<OnboardingRow>();

    if (updateError || !updatedOnboarding) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: updateError?.message || 'Failed to update orientation progress',
          },
        },
        { status: 400 }
      );
    }

    if (preReviewComplete) {
      await unlockOnboardingIfApproved(onboarding.user_id, 'Supabase');
    }

    return NextResponse.json({
      data: toOnboarding(updatedOnboarding),
      error: null,
    });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
