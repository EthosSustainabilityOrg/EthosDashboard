/**
 * app/api/webhooks/opensign/route.ts
 * POST /api/webhooks/opensign
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { CONSENT_TEMPLATE_ID, sendDocument, verifyOpenSignWebhook } from '@/lib/opensign';
import { unlockOnboardingIfApproved } from '@/lib/onboarding';

type OpenSignWebhookResponse = {
  received: true;
};

type OnboardingWebhookRow = {
  onboarding_id: string;
  user_id: string;
  slack_connected: boolean;
  orientation_completed_at: string | null;
  waiver_status: 'Not Started' | 'Sent' | 'Signed';
  waiver_doc_id: string | null;
  waiver_signed_at: string | null;
  parental_consent_status: 'Not Started' | 'Sent' | 'Signed';
  parental_consent_doc_id: string | null;
  parental_consent_signed_at: string | null;
  completed_at: string | null;
};

type GuardianSigningInfo = {
  guardian_name: string;
  guardian_email: string;
};

type PendingApplicationWithProject = {
  application_id: string;
  projects: {
    name: string;
    created_by: string;
  } | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function getStringField(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }

  return null;
}

function extractOpenSignDocumentIdFromPayload(payload: unknown): string | null {
  const payloadRecord = asRecord(payload);
  if (!payloadRecord) return null;

  const directId = getStringField(payloadRecord, ['id', 'document_id', 'documentId', 'doc_id']);
  if (directId) return directId;

  const documentRecord = asRecord(payloadRecord.document);
  if (documentRecord) {
    const documentId = getStringField(documentRecord, ['id', 'document_id', 'documentId', 'doc_id']);
    if (documentId) return documentId;
  }

  const dataRecord = asRecord(payloadRecord.data);
  if (dataRecord) {
    return getStringField(dataRecord, ['id', 'document_id', 'documentId', 'doc_id']);
  }

  return null;
}

function extractOpenSignDocumentIdFromResponse(response: unknown): string | null {
  const responseRecord = asRecord(response);
  if (!responseRecord) return null;

  // NOTE: OpenSign document ID field name must be verified against real OpenSign docs.
  const directId = getStringField(responseRecord, ['id', 'document_id', 'documentId', 'doc_id']);
  if (directId) return directId;

  const dataRecord = asRecord(responseRecord.data);
  if (!dataRecord) return null;

  return getStringField(dataRecord, ['id', 'document_id', 'documentId', 'doc_id']);
}

async function findOnboardingByDocumentId(documentId: string): Promise<OnboardingWebhookRow | null> {
  const { data: waiverMatch } = await supabaseAdmin
    .from('onboarding')
    .select(`
      onboarding_id,
      user_id,
      slack_connected,
      orientation_completed_at,
      waiver_status,
      waiver_doc_id,
      waiver_signed_at,
      parental_consent_status,
      parental_consent_doc_id,
      parental_consent_signed_at,
      completed_at
    `)
    .eq('waiver_doc_id', documentId)
    .maybeSingle<OnboardingWebhookRow>();

  if (waiverMatch) return waiverMatch;

  const { data: consentMatch } = await supabaseAdmin
    .from('onboarding')
    .select(`
      onboarding_id,
      user_id,
      slack_connected,
      orientation_completed_at,
      waiver_status,
      waiver_doc_id,
      waiver_signed_at,
      parental_consent_status,
      parental_consent_doc_id,
      parental_consent_signed_at,
      completed_at
    `)
    .eq('parental_consent_doc_id', documentId)
    .maybeSingle<OnboardingWebhookRow>();

  return consentMatch;
}

async function sendParentalConsent(onboarding: OnboardingWebhookRow): Promise<void> {
  if (!CONSENT_TEMPLATE_ID) return;
  if (onboarding.parental_consent_doc_id) return;

  const { data: signingUser } = await supabaseAdmin
    .from('users')
    .select('guardian_name, guardian_email')
    .eq('user_id', onboarding.user_id)
    .maybeSingle<GuardianSigningInfo>();

  if (!signingUser) return;

  const openSignResponse: unknown = await sendDocument(
    CONSENT_TEMPLATE_ID,
    signingUser.guardian_email,
    signingUser.guardian_name
  );

  const consentDocId = extractOpenSignDocumentIdFromResponse(openSignResponse);
  if (!consentDocId) return;

  await supabaseAdmin
    .from('onboarding')
    .update({
      parental_consent_doc_id: consentDocId,
      parental_consent_status: 'Sent',
    })
    .eq('onboarding_id', onboarding.onboarding_id);
}

async function notifyProjectLeadsReadyForReview(userId: string, sentAt: string): Promise<void> {
  const { data: applications } = await supabaseAdmin
    .from('applications')
    .select(`
      application_id,
      projects (
        name,
        created_by
      )
    `)
    .eq('user_id', userId)
    .eq('status', 'Pending')
    .returns<PendingApplicationWithProject[]>();

  if (!applications) return;

  const notifications = applications
    .filter((application) => application.projects)
    .map((application) => ({
      user_id: application.projects?.created_by,
      sent_to_email: null,
      sent_to_slack_user_id: null,
      channel: 'InApp',
      event_type: 'Onboarding Step',
      subject: null,
      body: `A volunteer completed onboarding and is ready for review for ${application.projects?.name}.`,
      sent_at: sentAt,
      status: 'Sent',
    }))
    .filter((notification): notification is {
      user_id: string;
      sent_to_email: null;
      sent_to_slack_user_id: null;
      channel: 'InApp';
      event_type: 'Onboarding Step';
      subject: null;
      body: string;
      sent_at: string;
      status: 'Sent';
    } => typeof notification.user_id === 'string');

  if (notifications.length === 0) return;

  await supabaseAdmin
    .from('notifications')
    .insert(notifications);
}

export async function POST(req: NextRequest): Promise<NextResponse<OpenSignWebhookResponse>> {
  const rawBody = await req.text();

  /**
   * SECURITY NOTE:
   * The OpenSign webhook signature header name and HMAC scheme are not yet verified
   * against real OpenSign API documentation. This route currently assumes
   * `x-opensign-signature`; confirm the exact header and scheme before production.
   */
  const signature = req.headers.get('x-opensign-signature');

  if (!signature) {
    return new NextResponse(null, { status: 400 }) as NextResponse<OpenSignWebhookResponse>;
  }

  try {
    const isValidSignature = verifyOpenSignWebhook(signature, rawBody);
    if (!isValidSignature) {
      return new NextResponse(null, { status: 400 }) as NextResponse<OpenSignWebhookResponse>;
    }
  } catch {
    return new NextResponse(null, { status: 400 }) as NextResponse<OpenSignWebhookResponse>;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ received: true });
  }

  const documentId = extractOpenSignDocumentIdFromPayload(payload);

  if (!documentId) {
    return NextResponse.json({ received: true });
  }

  const onboarding = await findOnboardingByDocumentId(documentId);
  if (!onboarding) {
    return NextResponse.json({ received: true });
  }

  const now = new Date().toISOString();

  if (onboarding.waiver_doc_id === documentId) {
    await supabaseAdmin
      .from('onboarding')
      .update({
        waiver_status: 'Signed',
        waiver_signed_at: now,
      })
      .eq('onboarding_id', onboarding.onboarding_id);

    await sendParentalConsent({
      ...onboarding,
      waiver_status: 'Signed',
      waiver_signed_at: now,
    });

    // This branch does not itself set completed_at — consent is only sent once the
    // waiver is signed, so it cannot already be signed here. Kept as a self-guarding
    // no-op so the unlock stays covered if the checklist order ever changes.
    await unlockOnboardingIfApproved(onboarding.user_id, 'OpenSign');

    return NextResponse.json({ received: true });
  }

  if (onboarding.parental_consent_doc_id === documentId) {
    // TODO: re-enable Slack gate when Slack OAuth is wired
    const preReviewComplete =
      // onboarding.slack_connected &&
      onboarding.orientation_completed_at !== null &&
      onboarding.waiver_status === 'Signed';

    await supabaseAdmin
      .from('onboarding')
      .update({
        parental_consent_status: 'Signed',
        parental_consent_signed_at: now,
        completed_at: preReviewComplete ? now : onboarding.completed_at,
      })
      .eq('onboarding_id', onboarding.onboarding_id);

    if (preReviewComplete) {
      await unlockOnboardingIfApproved(onboarding.user_id, 'OpenSign');
      await notifyProjectLeadsReadyForReview(onboarding.user_id, now);
    }

    return NextResponse.json({ received: true });
  }

  return NextResponse.json({ received: true });
}
