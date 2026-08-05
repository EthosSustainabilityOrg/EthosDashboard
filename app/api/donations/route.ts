import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { Donation } from '@/types/fundraising';

type DonationListItem = Donation & { donor_name: string | null };
type DonationsResponse = { donations: DonationListItem[]; total: number; page: number; per_page: number };
type CreateDonationInput = { contact_id?: string | null; amount: number; donated_at: string; notes?: string | null };
type ContactNameRow = { contact_id: string; name: string };

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function isCreateDonationInput(value: unknown): value is CreateDonationInput {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return (
    (body.contact_id === undefined || body.contact_id === null || typeof body.contact_id === 'string') &&
    typeof body.amount === 'number' &&
    Number.isFinite(body.amount) &&
    body.amount > 0 &&
    typeof body.donated_at === 'string' &&
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

async function hydrateDonations(donations: Donation[]): Promise<DonationListItem[]> {
  const contactIds = Array.from(new Set(donations.flatMap((donation) => donation.contact_id ? [donation.contact_id] : [])));
  const { data: contacts } = contactIds.length > 0
    ? await supabaseAdmin.from('fundraising_contacts').select('contact_id, name').in('contact_id', contactIds).returns<ContactNameRow[]>()
    : { data: [] as ContactNameRow[] };

  const names = new Map((contacts ?? []).map((contact) => [contact.contact_id, contact.name]));
  return donations.map((donation) => ({
    ...donation,
    donor_name: donation.contact_id ? names.get(donation.contact_id) ?? null : null,
  }));
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<DonationsResponse>>> {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });

  const page = parsePositiveInt(req.nextUrl.searchParams.get('page'), 1, 1000);
  const perPage = parsePositiveInt(req.nextUrl.searchParams.get('per_page'), 20, 100);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  const { data: donations, error, count } = await supabaseAdmin
    .from('donations')
    .select('*', { count: 'exact' })
    .order('donated_at', { ascending: false })
    .range(from, to)
    .returns<Donation[]>();

  if (error) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error.message } }, { status: 400 });

  return NextResponse.json({
    data: { donations: await hydrateDonations(donations ?? []), total: count ?? 0, page, per_page: perPage },
    error: null,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Donation>>> {
  const auth = await requireUser(req);
  if (!auth) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });
  if (auth.roleId !== 3) return NextResponse.json({ data: null, error: { code: 'FORBIDDEN', message: 'Board only' } }, { status: 403 });

  const body: unknown = await req.json().catch(() => null);
  if (!isCreateDonationInput(body)) {
    return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'contact_id, amount, donated_at, and notes are invalid' } }, { status: 400 });
  }

  if (body.contact_id) {
    const { data: contact } = await supabaseAdmin.from('fundraising_contacts').select('contact_id').eq('contact_id', body.contact_id).maybeSingle<{ contact_id: string }>();
    if (!contact) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } }, { status: 404 });
  }

  const { data: donation, error } = await supabaseAdmin
    .from('donations')
    .insert({ contact_id: body.contact_id ?? null, amount: body.amount, donated_at: body.donated_at, notes: body.notes ?? null, recorded_by: auth.userId })
    .select()
    .single<Donation>();

  if (error || !donation) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error?.message || 'Failed to create donation' } }, { status: 400 });
  return NextResponse.json({ data: donation, error: null }, { status: 201 });
}
