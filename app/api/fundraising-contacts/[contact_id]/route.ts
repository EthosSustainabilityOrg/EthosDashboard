import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { ContactType, FundraisingContact } from '@/types/fundraising';

type DeleteContactResponse = { deleted: boolean };
type PatchContactInput = { name?: string; type?: ContactType; email?: string | null; phone?: string | null; notes?: string | null };

const CONTACT_TYPES: readonly ContactType[] = ['Donor', 'Partner', 'Sponsor', 'Other'];

function isContactType(value: unknown): value is ContactType {
  return typeof value === 'string' && CONTACT_TYPES.includes(value as ContactType);
}

function isPatchContactInput(value: unknown): value is PatchContactInput {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return (
    (body.name === undefined || typeof body.name === 'string') &&
    (body.type === undefined || isContactType(body.type)) &&
    (body.email === undefined || body.email === null || typeof body.email === 'string') &&
    (body.phone === undefined || body.phone === null || typeof body.phone === 'string') &&
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
  { params }: { params: Promise<{ contact_id: string }> }
): Promise<NextResponse<ApiResponse<FundraisingContact>>> {
  const { contact_id: contactId } = await params;

  if (!(await requireBoard(req))) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  if (!isPatchContactInput(body)) {
    return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid contact update' } }, { status: 400 });
  }

  const updates: PatchContactInput = { ...body };
  if (updates.name !== undefined) updates.name = updates.name.trim();

  const { data: contact, error } = await supabaseAdmin
    .from('fundraising_contacts')
    .update(updates)
    .eq('contact_id', contactId)
    .select()
    .maybeSingle<FundraisingContact>();

  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });
  if (!contact) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } }, { status: 404 });
  return NextResponse.json({ data: contact, error: null });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ contact_id: string }> }
): Promise<NextResponse<ApiResponse<DeleteContactResponse>>> {
  const { contact_id: contactId } = await params;

  if (!(await requireBoard(req))) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const { error } = await supabaseAdmin.from('fundraising_contacts').delete().eq('contact_id', contactId);
  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });

  return NextResponse.json({ data: { deleted: true }, error: null });
}
