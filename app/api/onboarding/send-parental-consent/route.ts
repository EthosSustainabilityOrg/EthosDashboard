/**
 * app/api/onboarding/send-parental-consent/route.ts
 * POST /api/onboarding/send-parental-consent
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { CONSENT_TEMPLATE_ID, sendDocument } from '@/lib/opensign';
import type { ApiResponse } from '@/types/api';
import type { WaiverStatus } from '@/types/onboarding';

type SendParentalConsentResponse = {
  parental_consent_status: Extract<WaiverStatus, 'Sent'>;
  parental_consent_doc_id: string;
};

type GuardianSigningInfo = {
  guardian_name: string;
  guardian_email: string;
};

function getStringField(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function extractOpenSignDocumentId(response: unknown): string | null {
  const responseRecord = asRecord(response);
  if (!responseRecord) return null;

  // NOTE: OpenSign document ID field name must be verified against real OpenSign docs.
  const directId = getStringField(responseRecord, ['id', 'document_id', 'documentId', 'doc_id']);
  if (directId) return directId;

  const dataRecord = asRecord(responseRecord.data);
  if (!dataRecord) return null;

  return getStringField(dataRecord, ['id', 'document_id', 'documentId', 'doc_id']);
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<SendParentalConsentResponse>>> {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    if (!CONSENT_TEMPLATE_ID) {
      return NextResponse.json(
        { data: null, error: { code: 'INTEGRATION_ERROR', message: 'OpenSign consent template is not configured' } },
        { status: 502 }
      );
    }

    const { data: signingUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('guardian_name, guardian_email')
      .eq('user_id', auth.userId)
      .maybeSingle<GuardianSigningInfo>();

    if (userError || !signingUser) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'User record not found' } },
        { status: 404 }
      );
    }

    let consentDocId: string | null = null;
    try {
      const openSignResponse: unknown = await sendDocument(
        CONSENT_TEMPLATE_ID,
        signingUser.guardian_email,
        signingUser.guardian_name
      );

      consentDocId = extractOpenSignDocumentId(openSignResponse);
    } catch {
      return NextResponse.json(
        { data: null, error: { code: 'INTEGRATION_ERROR', message: 'OpenSign parental consent send failed' } },
        { status: 502 }
      );
    }

    if (!consentDocId) {
      return NextResponse.json(
        { data: null, error: { code: 'INTEGRATION_ERROR', message: 'OpenSign response did not include a document ID' } },
        { status: 502 }
      );
    }

    const { data: onboarding, error: updateError } = await supabaseAdmin
      .from('onboarding')
      .update({
        parental_consent_doc_id: consentDocId,
        parental_consent_status: 'Sent',
      })
      .eq('user_id', auth.userId)
      .select('parental_consent_status, parental_consent_doc_id')
      .maybeSingle<SendParentalConsentResponse>();

    if (updateError || !onboarding) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: updateError?.message || 'Onboarding record not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data: onboarding, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
