import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authenticate } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { PolicyAcknowledgment } from '@/types/policy-acknowledgments';

type AcknowledgmentStatus = { file_id: string; file_name: string; acknowledged: boolean; acknowledged_at: string | null };
type AcknowledgmentsResponse = { acknowledgments: AcknowledgmentStatus[] };
type PolicyFileRow = { file_id: string; file_name: string };
type AcknowledgmentInput = { file_id: string };

function isAcknowledgmentInput(value: unknown): value is AcknowledgmentInput {
  return Boolean(value && typeof value === 'object' && typeof (value as Record<string, unknown>).file_id === 'string');
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<AcknowledgmentsResponse>>> {
  const auth = await authenticate(req);
  const userId = auth?.userId ?? null;
  if (!userId) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });

  const { data: files, error: filesError } = await supabaseAdmin.from('files').select('file_id, file_name').eq('is_policy', true).order('file_name').returns<PolicyFileRow[]>();
  if (filesError) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: filesError.message } }, { status: 400 });

  const fileIds = (files ?? []).map((file) => file.file_id);
  const { data: acknowledgments } = fileIds.length > 0
    ? await supabaseAdmin.from('policy_acknowledgments').select('file_id, acknowledged_at').eq('user_id', userId).in('file_id', fileIds).returns<Array<{ file_id: string; acknowledged_at: string }>>()
    : { data: [] as Array<{ file_id: string; acknowledged_at: string }> };

  const byFile = new Map((acknowledgments ?? []).map((ack) => [ack.file_id, ack.acknowledged_at]));
  return NextResponse.json({
    data: {
      acknowledgments: (files ?? []).map((file) => ({
        file_id: file.file_id,
        file_name: file.file_name,
        acknowledged: byFile.has(file.file_id),
        acknowledged_at: byFile.get(file.file_id) ?? null,
      })),
    },
    error: null,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<PolicyAcknowledgment>>> {
  const auth = await authenticate(req);
  const userId = auth?.userId ?? null;
  if (!userId) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  if (!isAcknowledgmentInput(body)) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'file_id is required' } }, { status: 400 });

  const { data: file } = await supabaseAdmin.from('files').select('file_id').eq('file_id', body.file_id).eq('is_policy', true).maybeSingle<{ file_id: string }>();
  if (!file) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Policy file not found' } }, { status: 404 });

  const { data: existing } = await supabaseAdmin.from('policy_acknowledgments').select('*').eq('user_id', userId).eq('file_id', body.file_id).maybeSingle<PolicyAcknowledgment>();
  if (existing) return NextResponse.json({ data: existing, error: null });

  const { data: acknowledgment, error } = await supabaseAdmin.from('policy_acknowledgments').insert({ user_id: userId, file_id: body.file_id }).select().single<PolicyAcknowledgment>();
  if (error || !acknowledgment) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error?.message || 'Failed to acknowledge policy' } }, { status: 400 });
  return NextResponse.json({ data: acknowledgment, error: null }, { status: 201 });
}
