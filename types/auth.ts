/**
 * auth.ts
 * OrgRole lookup table, UserAuth login records, and JWT custom claims.
 * Entities: org_roles (#3), user_auth (#2), JwtClaims (runtime shape).
 */

// ── org_roles ──────────────────────────────────────────────────────────────
// Lookup table. Integer PK per data model.

/** Numeric org role IDs. 1 = Member, 2 = Project Lead, 3 = Board. */
export type OrgRoleId = 1 | 2 | 3;

/** Human-readable role names. "Admin" is never used — always "Board". */
export type OrgRoleName = 'Member' | 'Project Lead' | 'Board';

/** Row in the org_roles lookup table. */
export interface OrgRole {
  role_id: OrgRoleId;
  role_name: OrgRoleName;
  description: string;
}

// ── user_auth ───────────────────────────────────────────────────────────────
// One row per Google account linked to a user. UUID PK.

/**
 * Row in user_auth.
 * One user can have multiple rows (personal Gmail + Ethos Workspace account).
 * google_account_email is globally unique — one Google account cannot link to two users.
 */
export interface UserAuth {
  auth_id: string;
  user_id: string;
  /** The Google account email used to sign in. UNIQUE. */
  google_account_email: string;
  is_active: boolean;
  linked_at: string;
}

// ── JWT custom claims ───────────────────────────────────────────────────────
// Shape of the JWT payload after 000_jwt_hook.sql custom claims hook runs.

/**
 * Shape of the Supabase JWT payload, including the custom claims that
 * custom_access_token_hook is supposed to inject.
 *
 * NEVER TRUST org_role_id OR chapter_id FROM THIS TYPE FOR AUTHORIZATION.
 * The hook is registered and works when called directly in SQL, but the two
 * custom claims are not reliably populated in the tokens actually issued in
 * production. A missing claim reads as undefined, which silently fails closed
 * (lockouts) or silently mis-scopes queries — neither is visible to tsc.
 *
 * Resolve role and chapter with a DB lookup instead, in every layer:
 *   - API routes / server components: select org_role_id, chapter_id from
 *     public.users where user_id = <verified sub>, defaulting role to 1 (Member).
 *   - RLS policies: public.current_org_role_id(), or a subquery against
 *     public.users — never auth.jwt() ->> '...' (see migration 029).
 *
 * The fields stay declared here because they exist on the token's shape, not
 * because they are safe to read. sub, email, exp and iat are standard Supabase
 * claims and remain fine to use.
 */
export interface JwtClaims {
  /** Supabase Auth user UUID. Same as users.user_id. Safe to use. */
  sub: string;
  /** DO NOT USE for authorization — unreliable in production. DB lookup instead. */
  org_role_id: OrgRoleId;
  /** DO NOT USE for scoping — unreliable in production. DB lookup instead. */
  chapter_id: string;
  email: string;
  exp: number;
  iat: number;
}
