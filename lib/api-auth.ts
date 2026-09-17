/**
 * lib/api-auth.ts
 * The single authentication and authorization path for API routes.
 *
 * WHY THIS EXISTS
 * Thirteen route files each defined their own local `requireUser` / `requireBoard`
 * with five different return signatures, and forty-nine routes repeated the same
 * verify-then-look-up-role prologue inline. That duplication is exactly how the JWT
 * claims bug survived across thirty-three files: there was no single place to fix.
 * Every new route should use these helpers rather than hand-rolling the prologue.
 *
 * IDENTITY COMES FROM THE VERIFIED RESPONSE
 * `supabaseAdmin.auth.getUser(token)` verifies the token's signature and returns the
 * user. `extractClaims(token)` only base64-decodes the payload and verifies nothing.
 * Both yield the same id when getUser is called first, but `user.id` is the one that
 * is actually trustworthy, so it is what these helpers use. `extractClaims` remains
 * fine for reading non-authorization fields such as email.
 *
 * ROLE AND CHAPTER COME FROM THE DATABASE
 * Never from JWT custom claims. See CLAUDE.md — the hook is registered but its claims
 * are not reliably populated in production, and a missing claim fails closed in ways
 * `tsc` cannot see. Role defaults to 1 (Member), the least-privileged role.
 */
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { ApiResponse, ErrorCode } from '@/types/api';
import type { OrgRoleId } from '@/types/auth';

export type AuthedUser = {
  /** Supabase Auth user id, from the signature-verified getUser response. */
  userId: string;
  /** Role from public.users. Defaults to 1 (Member) when no users row exists. */
  orgRoleId: OrgRoleId;
  /**
   * Chapter from public.users, or null when the caller has no users row yet — a
   * brand-new Google sign-in before their first application. The column is NOT NULL,
   * so null never means "belongs to no chapter". Never interpolate it into a
   * PostgREST filter string; drop the chapter clause instead.
   */
  chapterId: string | null;
};

type UserRoleRow = {
  org_role_id: OrgRoleId;
  chapter_id: string | null;
};

/** Builds the error envelope the API spec mandates. */
export function apiError(
  code: ErrorCode,
  message: string,
  status: number,
): NextResponse<ApiResponse<never>> {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

export function unauthorized(
  message = 'Invalid or missing authorization',
): NextResponse<ApiResponse<never>> {
  return apiError('UNAUTHORIZED', message, 401);
}

export function forbidden(
  message = 'You do not have access to this',
): NextResponse<ApiResponse<never>> {
  return apiError('FORBIDDEN', message, 403);
}

/**
 * Verifies the Bearer token and resolves the caller's role and chapter from the
 * database. Returns null when the token is missing, malformed, or rejected.
 *
 * A valid token for a user with no `public.users` row still authenticates: it returns
 * orgRoleId 1 and chapterId null. That case is real — a user row is only created on
 * first application — and callers that need a provisioned user should check chapterId
 * or query for the row themselves.
 */
export async function authenticate(req: NextRequest): Promise<AuthedUser | null> {
  const resolved = await authenticateWithAccount(req);
  if (!resolved) return null;

  return {
    userId: resolved.userId,
    orgRoleId: resolved.orgRoleId,
    chapterId: resolved.chapterId,
  };
}

/**
 * An authenticated caller plus the raw Supabase Auth user.
 *
 * Only for routes that read the auth account's own fields — `email` and
 * `user_metadata` — rather than just an identity. In practice that is
 * provisioning a `public.users` row on a member's first application, where the
 * name comes off the Google profile. Everywhere else, use authenticate(): the
 * Supabase type is deliberately kept out of the common path.
 */
export type AuthedAccount = AuthedUser & { account: User };

export async function authenticateWithAccount(
  req: NextRequest,
): Promise<AuthedAccount | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.split(' ')[1];
  if (!token) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) return null;

  const { data: roleRow } = await supabaseAdmin
    .from('users')
    .select('org_role_id, chapter_id')
    .eq('user_id', user.id)
    .maybeSingle<UserRoleRow>();

  return {
    userId: user.id,
    orgRoleId: roleRow?.org_role_id ?? 1,
    chapterId: roleRow?.chapter_id ?? null,
    account: user,
  };
}

/** Authenticated caller with Board access (org_role_id 3), or null. */
export async function authenticateBoard(req: NextRequest): Promise<AuthedUser | null> {
  const auth = await authenticate(req);
  if (!auth || auth.orgRoleId !== 3) return null;
  return auth;
}

/** Authenticated caller with Project Lead or Board access (2 or 3), or null. */
export async function authenticateLeadOrBoard(req: NextRequest): Promise<AuthedUser | null> {
  const auth = await authenticate(req);
  if (!auth || (auth.orgRoleId !== 2 && auth.orgRoleId !== 3)) return null;
  return auth;
}

/** True when this caller is Board. Board has universal access, no restrictions. */
export function isBoard(auth: AuthedUser): boolean {
  return auth.orgRoleId === 3;
}
