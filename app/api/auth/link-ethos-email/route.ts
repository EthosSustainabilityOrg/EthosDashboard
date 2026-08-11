import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractClaims } from '@/lib/auth';
import type { ApiResponse } from '@/types/api';
import type { User } from '@/types/users';

type LinkEthosEmailInput = {
  user_id: string;
  ethos_email: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseInput(value: unknown): LinkEthosEmailInput | null {
  if (!isRecord(value)) return null;

  const userId = value.user_id;
  const ethosEmail = value.ethos_email;

  if (typeof userId !== 'string' || !userId.trim()) return null;
  if (typeof ethosEmail !== 'string' || !ethosEmail.trim()) return null;

  return {
    user_id: userId,
    ethos_email: ethosEmail.trim().toLowerCase(),
  };
}

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<User>>> {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' } },
        { status: 401 },
      );
    }

    const token = authHeader.split(' ')[1];
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    const claims = extractClaims(token);

    if (authError || !user || !claims?.sub) {
      return NextResponse.json(
        { data: null, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } },
        { status: 401 },
      );
    }

    const { data: roleData } = await supabaseAdmin
      .from('users')
      .select('org_role_id')
      .eq('user_id', claims.sub)
      .maybeSingle();

    const orgRoleId = roleData?.org_role_id ?? 1;

    if (orgRoleId !== 3) {
      return NextResponse.json(
        { data: null, error: { code: 'FORBIDDEN', message: 'Board only' } },
        { status: 403 },
      );
    }

    const body = parseInput(await req.json().catch(() => null));
    if (!body) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: 'A user and Ethos email address are required' } },
        { status: 400 },
      );
    }

    const { data: targetUser, error: targetError } = await supabaseAdmin
      .from('users')
      .select()
      .eq('user_id', body.user_id)
      .maybeSingle<User>();

    if (targetError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: targetError.message } },
        { status: 400 },
      );
    }

    if (!targetUser) {
      return NextResponse.json(
        { data: null, error: { code: 'NOT_FOUND', message: 'User not found' } },
        { status: 404 },
      );
    }

    const { data: existingAuth, error: authLookupError } = await supabaseAdmin
      .from('user_auth')
      .select('auth_id')
      .eq('google_account_email', body.ethos_email)
      .maybeSingle<{ auth_id: string }>();

    if (authLookupError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: authLookupError.message } },
        { status: 400 },
      );
    }

    if (existingAuth) {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: 'Email is already linked to a user' } },
        { status: 409 },
      );
    }

    const { data: existingUserEmail, error: userEmailError } = await supabaseAdmin
      .from('users')
      .select('user_id')
      .eq('ethos_email', body.ethos_email)
      .maybeSingle<{ user_id: string }>();

    if (userEmailError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: userEmailError.message } },
        { status: 400 },
      );
    }

    if (existingUserEmail) {
      return NextResponse.json(
        { data: null, error: { code: 'CONFLICT', message: 'Ethos email is already assigned to a user' } },
        { status: 409 },
      );
    }

    // Accepted risk: these sequential writes are not wrapped in a transaction.
    // This is a rare Board-only action and can be manually corrected if interrupted.
    const { error: deactivateError } = await supabaseAdmin
      .from('user_auth')
      .update({ is_active: false })
      .eq('user_id', body.user_id);

    if (deactivateError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: deactivateError.message } },
        { status: 400 },
      );
    }

    const { error: insertAuthError } = await supabaseAdmin
      .from('user_auth')
      .insert({
        user_id: body.user_id,
        google_account_email: body.ethos_email,
        is_active: true,
      });

    if (insertAuthError) {
      return NextResponse.json(
        { data: null, error: { code: 'VALIDATION_ERROR', message: insertAuthError.message } },
        { status: 400 },
      );
    }

    const { data: updatedUser, error: updateUserError } = await supabaseAdmin
      .from('users')
      .update({
        ethos_email: body.ethos_email,
        active_login_email: body.ethos_email,
      })
      .eq('user_id', body.user_id)
      .select()
      .single<User>();

    if (updateUserError || !updatedUser) {
      return NextResponse.json(
        {
          data: null,
          error: {
            code: 'VALIDATION_ERROR',
            message: updateUserError?.message ?? 'Failed to update user',
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ data: updatedUser, error: null });
  } catch {
    return NextResponse.json(
      { data: null, error: { code: 'VALIDATION_ERROR', message: 'Internal Server Error' } },
      { status: 500 },
    );
  }
}
