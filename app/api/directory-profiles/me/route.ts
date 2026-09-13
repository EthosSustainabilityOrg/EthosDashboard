import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authenticate } from '@/lib/api-auth';
import type { ApiResponse } from '@/types/api';
import type { DirectoryProfile } from '@/types/directory-profiles';

type PatchProfileInput = { bio: string | null };

function isPatchProfileInput(value: unknown): value is PatchProfileInput {
  return Boolean(value && typeof value === 'object' && ('bio' in value) && ((value as Record<string, unknown>).bio === null || typeof (value as Record<string, unknown>).bio === 'string'));
}

export async function PATCH(req: NextRequest): Promise<NextResponse<ApiResponse<DirectoryProfile>>> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Missing authorization header' } }, { status: 401 });

  const auth = await authenticate(req);
  if (!auth) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } }, { status: 401 });

  const body: unknown = await req.json().catch(() => null);
  if (!isPatchProfileInput(body)) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: 'bio is required' } }, { status: 400 });

  const { data: profile, error } = await supabaseAdmin
    .from('directory_profiles')
    .upsert({ user_id: auth.userId, bio: body.bio }, { onConflict: 'user_id' })
    .select()
    .single<DirectoryProfile>();

  if (error || !profile) return NextResponse.json({ data: null, error: { code: 'VALIDATION_ERROR', message: error?.message || 'Failed to update profile' } }, { status: 400 });
  return NextResponse.json({ data: profile, error: null });
}
