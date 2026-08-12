/**
 * users.ts
 * User entity and the users_directory view projection.
 * Entity: users (#1).
 */

import type { OrgRoleId } from './auth';

// ── users ───────────────────────────────────────────────────────────────────

/**
 * Full user record as stored in public.users.
 * guardian_email, guardian_phone, and date_of_birth are sensitive — never
 * exposed to non-Board users. Only accessible via service role or Board via
 * Supabase dashboard. The users_directory view excludes these three fields.
 */
export interface User {
  user_id: string;
  first_name: string;
  last_name: string;
  /**
   * Used for COPPA minimum-age check (14). ISO 8601 date string.
   * Null until collected — Google sign-up doesn't provide it; the users row
   * auto-created on first application starts with this unset.
   */
  date_of_birth: string | null;
  /** Gmail used at signup. UNIQUE. */
  personal_email: string;
  /** Assigned manually by Board after approval. Null until created. UNIQUE. */
  ethos_email: string | null;
  /** Whichever email they currently authenticate with. */
  active_login_email: string;
  /** Slack user ID stored after OAuth connection. UNIQUE. */
  slack_user_id: string | null;
  /** Full name of parent or legal guardian. Null until collected. */
  guardian_name: string | null;
  /** Guardian email — receives parental consent form. Null until collected. */
  guardian_email: string | null;
  /** Guardian phone number. Optional. */
  guardian_phone: string | null;
  /** FK → org_roles. 1 = Member, 2 = Project Lead, 3 = Board. */
  org_role_id: OrgRoleId;
  /** FK → chapters. The chapter this member belongs to permanently. */
  chapter_id: string;
  /** True once all one-time Ethos onboarding steps are done. */
  onboarding_complete: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Projection of users exposed via the users_directory view.
 * Sensitive fields (date_of_birth, guardian_email, guardian_phone) are excluded.
 * Used by non-Board API callers for directory listings.
 */
export type UsersDirectoryRow = Omit<
  User,
  'date_of_birth' | 'guardian_email' | 'guardian_phone'
>;
