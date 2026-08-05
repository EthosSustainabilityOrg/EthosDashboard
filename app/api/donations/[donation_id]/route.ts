import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Donation } from '@/types/fundraising';

type DeleteDonationResponse = { deleted: boolean };
type PatchDonationInput = { contact_id?: string | null; amount?: number; donated_at?: string; notes?: string | null };

function isPatchDonationInput(value: unknown): value is PatchDonationInput {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return (
    (body.contact_id === undefined || body.contact_id === null || typeof body.contact_id === 'string') &&
    (body.amount === undefined || (typeof body.amount === 'number' && Number.isFinite(body.amount) && body.amount > 0)) &&
    (body.donated_at === undefined || typeof body.donated_at === 'string') &&
    (body.notes === undefined || body.notes === null || typeof body.notes === 'string')
  );
}

async function requireBoard(req: NextRequest): Promise<boolean> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  const claims = extractClaims(token);
  if (error || !user || !claims?.sub) return false;

  const { data: roleData } = await supabaseAdmin
    .from('users')
    .select('org_role_id')
    .eq('user_id', claims.sub)
    .maybeSingle();

  return (roleData?.org_role_id ?? 1) === 3;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ donation_id: string }> }
): Promise<NextResponse<ApiResponse<Donation>>> {
  const { donation_id: donationId } = await params;

  if (!(await requireBoard(req))) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  if (!isPatchDonationInput(body)) {
    return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid donation update' } }, { status: 400 });
  }

  if (body.contact_id) {
    const { data: contact } = await supabaseAdmin.from('fundraising_contacts').select('contact_id').eq('contact_id', body.contact_id).maybeSingle<{ contact_id: string }>();
    if (!contact) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } }, { status: 404 });
  }

  const { data: donation, error } = await supabaseAdmin
    .from('donations')
    .update(body)
    .eq('donation_id', donationId)
    .select()
    .maybeSingle<Donation>();

  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });
  if (!donation) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Donation not found' } }, { status: 404 });
  return NextResponse.json({ data: donation, error: null });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ donation_id: string }> }
): Promise<NextResponse<ApiResponse<DeleteDonationResponse>>> {
  const { donation_id: donationId } = await params;

  if (!(await requireBoard(req))) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const { error } = await supabaseAdmin.from('donations').delete().eq('donation_id', donationId);
  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });

  return NextResponse.json({ data: { deleted: true }, error: null });
}
