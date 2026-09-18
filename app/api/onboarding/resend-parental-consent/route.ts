/**
 * app/api/onboarding/resend-parental-consent/route.ts
 * POST /api/onboarding/resend-parental-consent
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { sendEmail } from '@/lib/resend';
import type { ApiResponse } from '@/types/api';

type ResendParentalConsentResponse = {
  reminder_sent: true;
  next_allowed_at: string;
};

type GuardianReminderInfo = {
  guardian_email: string;
};

type ConsentDocumentInfo = {
  parental_consent_doc_id: string | null;
};

type ReminderNotification = {
  sent_at: string;
};

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<ResendParentalConsentResponse>>> {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { data: onboarding, error: onboardingError } = await supabaseAdmin
      .from('onboarding')
      .select('parental_consent_doc_id')
      .eq('user_id', auth.userId)
      .maybeSingle<ConsentDocumentInfo>();

    if (onboardingError || !onboarding) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'Onboarding record not found' } },
        { status: 404 }
      );
    }

    if (!onboarding.parental_consent_doc_id) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'Parental consent has not been sent yet' } },
        { status: 400 }
      );
    }

    const { data: latestReminder, error: reminderError } = await supabaseAdmin
      .from('notifications')
      .select('sent_at')
      .eq('user_id', auth.userId)
      .eq('event_type', 'Parental Consent Reminder')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle<ReminderNotification>();

    if (reminderError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: reminderError.message } },
        { status: 400 }
      );
    }

    if (latestReminder) {
      const nextAllowedAt = new Date(new Date(latestReminder.sent_at).getTime() + REMINDER_WINDOW_MS);
      if (nextAllowedAt.getTime() > Date.now()) {
        return NextResponse.json(
          {
            data: null,
            error: {
              code: 'CONFLICT',
              message: `Parental consent reminder already sent. next_allowed_at=${nextAllowedAt.toISOString()}`,
            },
          },
          { status: 409 }
        );
      }
    }

    const { data: signingUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('guardian_email')
      .eq('user_id', auth.userId)
      .maybeSingle<GuardianReminderInfo>();

    if (userError || !signingUser) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'User record not found' } },
        { status: 404 }
      );
    }

    const now = new Date();
    const nextAllowedAt = new Date(now.getTime() + REMINDER_WINDOW_MS).toISOString();
    const subject = 'Ethos parental consent reminder';
    const body = `
      <p>Hello,</p>
      <p>This is a reminder to complete the Ethos parental consent form.</p>
      <p>Reference document ID: ${onboarding.parental_consent_doc_id}</p>
    `;

    try {
      await sendEmail(signingUser.guardian_email, subject, body);
    } catch {
      return NextResponse.json(
        { data: null, error: { code: 'INTEGRATION_ERROR', message: 'Parental consent reminder email failed' } },
        { status: 502 }
      );
    }

    const { error: notificationError } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: auth.userId,
        sent_to_email: null,
        sent_to_slack_user_id: null,
        channel: 'InApp',
        event_type: 'Parental Consent Reminder',
        subject,
        body: `Parental consent reminder sent. Document reference: ${onboarding.parental_consent_doc_id}`,
        sent_at: now.toISOString(),
        status: 'Sent',
      });

    if (notificationError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: notificationError.message } },
        { status: 400 }
      );
    }

    return NextResponse.json({
      data: {
        reminder_sent: true,
        next_allowed_at: nextAllowedAt,
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
