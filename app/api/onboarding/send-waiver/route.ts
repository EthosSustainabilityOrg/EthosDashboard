/**
 * app/api/onboarding/send-waiver/route.ts
 * POST /api/onboarding/send-waiver
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { sendDocument, WAIVER_TEMPLATE_ID } from '@/lib/opensign';
import type { ApiResponse } from '@/types/api';
import type { WaiverStatus } from '@/types/onboarding';

type SendWaiverResponse = {
  waiver_status: Extract<WaiverStatus, 'Sent'>;
  waiver_doc_id: string;
};

type UserSigningInfo = {
  first_name: string;
  last_name: string;
  active_login_email: string;
};

function getStringField(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? value as Record<string, unknown>
    : null;
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

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<SendWaiverResponse>>> {
  try {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;

    if (!WAIVER_TEMPLATE_ID) {
      return NextResponse.json(
        { data: null, error: { code: 'INTEGRATION_ERROR', message: 'OpenSign waiver template is not configured' } },
        { status: 502 }
      );
    }

    const { data: signingUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('first_name, last_name, active_login_email')
      .eq('user_id', auth.userId)
      .maybeSingle<UserSigningInfo>();

    if (userError || !signingUser) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'User record not found' } },
        { status: 404 }
      );
    }

    const signerName = `${signingUser.first_name} ${signingUser.last_name}`.trim();

    let waiverDocId: string | null = null;
    try {
      const openSignResponse: unknown = await sendDocument(
        WAIVER_TEMPLATE_ID,
        signingUser.active_login_email,
        signerName
      );

      waiverDocId = extractOpenSignDocumentId(openSignResponse);
    } catch {
      return NextResponse.json(
        { data: null, error: { code: 'INTEGRATION_ERROR', message: 'OpenSign waiver send failed' } },
        { status: 502 }
      );
    }

    if (!waiverDocId) {
      return NextResponse.json(
        { data: null, error: { code: 'INTEGRATION_ERROR', message: 'OpenSign response did not include a document ID' } },
        { status: 502 }
      );
    }

    const { data: onboarding, error: updateError } = await supabaseAdmin
      .from('onboarding')
      .update({
        waiver_doc_id: waiverDocId,
        waiver_status: 'Sent',
      })
      .eq('user_id', auth.userId)
      .select('waiver_status, waiver_doc_id')
      .maybeSingle<SendWaiverResponse>();

    if (updateError || !onboarding) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'NOT_FOUND',
            message: updateError?.message || 'Onboarding record not found',
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: onboarding,
      error: null,
    });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 }
    );
  }
}
