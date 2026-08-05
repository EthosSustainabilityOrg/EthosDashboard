import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { ContactType, FundraisingContact } from '@/types/fundraising';

type ContactsResponse = { contacts: FundraisingContact[]; total: number; page: number; per_page: number };
type CreateContactInput = { name: string; type: ContactType; email?: string | null; phone?: string | null; notes?: string | null };

const CONTACT_TYPES: readonly ContactType[] = ['Donor', 'Partner', 'Sponsor', 'Other'];

function isContactType(value: unknown): value is ContactType {
  return typeof value === 'string' && CONTACT_TYPES.includes(value as ContactType);
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function isCreateContactInput(value: unknown): value is CreateContactInput {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return (
    typeof body.name === 'string' &&
    body.name.trim().length > 0 &&
    isContactType(body.type) &&
    (body.email === undefined || body.email === null || typeof body.email === 'string') &&
    (body.phone === undefined || body.phone === null || typeof body.phone === 'string') &&
    (body.notes === undefined || body.notes === null || typeof body.notes === 'string')
  );
}

async function requireUser(req: NextRequest): Promise<{ userId: string; roleId: number } | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  const claims = extractClaims(token);
  if (error || !user || !claims?.sub) return null;

  const { data: roleData } = await supabaseAdmin
    .from('users')
    .select('org_role_id')
    .eq('user_id', claims.sub)
    .maybeSingle();

  return { userId: claims.sub, roleId: roleData?.org_role_id ?? 1 };
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<ContactsResponse>>> {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });

  const search = req.nextUrl.searchParams.get('search')?.trim();
  const type = req.nextUrl.searchParams.get('type');
  const page = parsePositiveInt(req.nextUrl.searchParams.get('page'), 1, 1000);
  const perPage = parsePositiveInt(req.nextUrl.searchParams.get('per_page'), 20, 100);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  if (type !== null && !isContactType(type)) {
    return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'Invalid contact type' } }, { status: 400 });
  }

  let query = supabaseAdmin
    .from('fundraising_contacts')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true })
    .range(from, to);

  if (type) query = query.eq('type', type);
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);

  const { data: contacts, error, count } = await query.returns<FundraisingContact[]>();
  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });

  return NextResponse.json({ data: { contacts: contacts ?? [], total: count ?? 0, page, per_page: perPage }, error: null });
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<FundraisingContact>>> {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });
  if (auth.roleId !== 3) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  if (!isCreateContactInput(body)) {
    return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'name and valid type are required' } }, { status: 400 });
  }

  const { data: contact, error } = await supabaseAdmin
    .from('fundraising_contacts')
    .insert({ name: body.name.trim(), type: body.type, email: body.email ?? null, phone: body.phone ?? null, notes: body.notes ?? null, added_by: auth.userId })
    .select()
    .single<FundraisingContact>();

  if (error || !contact) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error?.message || 'Failed to create contact' } }, { status: 400 });
  return NextResponse.json({ data: contact, error: null }, { status: 201 });
}
