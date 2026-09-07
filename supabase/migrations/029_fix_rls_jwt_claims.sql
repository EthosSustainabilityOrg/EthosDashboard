-- 029_fix_rls_jwt_claims.sql
--
-- Replaces every RLS policy that reads a custom JWT claim with a DB lookup.
--
-- WHY: the custom_access_token_hook is registered but its claims are not
-- reliably populated in production. Expressions like
--   (auth.jwt() ->> 'org_role_id') = '3'
-- evaluate to NULL (not TRUE) when the claim is absent, so every one of these
-- policies silently denies. This is a lockout, not a privilege escalation --
-- Board and Project Lead lose access they should have. Symptom seen in prod:
-- the role management panel returned only the viewer's own row, because
-- users_select_board never matched and users_select_own was the only survivor.
--
-- SCOPE: 63 policies across 23 tables. Also replaces the single chapter_id
-- claim in projects_insert_lead_board.
--
-- STYLE REFERENCE: 006_projects.sql:70 (projects_select_member_own_chapter)
-- already resolves chapter via a subquery on public.users rather than a claim.
--
-- FAIL-CLOSED: current_org_role_id() returns NULL for a user with no row in
-- public.users, and NULL = 3 is NULL, not TRUE. Unknown users are denied,
-- matching the previous behaviour.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER is required, not merely convenient: policies ON public.users
-- and public.user_auth need the caller's role, and an inline subquery against
-- public.users from inside a policy on public.users would re-enter that same
-- policy and recurse. SECURITY DEFINER runs as the function owner and bypasses
-- RLS on the tables it reads, breaking the cycle.
--
-- STABLE lets the planner evaluate this once per statement rather than per row.
-- SET search_path pins resolution so the definer's rights cannot be redirected
-- to an attacker-controlled schema.

CREATE OR REPLACE FUNCTION public.current_org_role_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_role_id FROM public.users
  WHERE user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.current_org_role_id() IS
  'Returns the calling user''s org_role_id from public.users. Use this in RLS '
  'policies instead of auth.jwt() ->> ''org_role_id'' -- custom JWT claims are '
  'not reliably populated. Returns NULL for unknown users (fail closed).';

REVOKE EXECUTE ON FUNCTION public.current_org_role_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_org_role_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. chapters (002) -- 2 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "chapters_insert_board" ON public.chapters;
CREATE POLICY "chapters_insert_board" ON public.chapters
  FOR INSERT
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "chapters_update_board" ON public.chapters;
CREATE POLICY "chapters_update_board" ON public.chapters
  FOR UPDATE
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 2. users (003) -- 2 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_board" ON public.users;
CREATE POLICY "users_select_board" ON public.users
  FOR SELECT
  TO authenticated
  USING (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "users_update_board" ON public.users;
CREATE POLICY "users_update_board" ON public.users
  FOR UPDATE
  TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 3. user_auth (004) -- 3 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_auth_select_board" ON public.user_auth;
CREATE POLICY "user_auth_select_board" ON public.user_auth
  FOR SELECT
  TO authenticated
  USING (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "user_auth_insert_board" ON public.user_auth;
CREATE POLICY "user_auth_insert_board" ON public.user_auth
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "user_auth_update_board" ON public.user_auth;
CREATE POLICY "user_auth_update_board" ON public.user_auth
  FOR UPDATE
  TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 4. projects (006) -- 5 policies (includes the only chapter_id claim)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "projects_select_board" ON public.projects;
CREATE POLICY "projects_select_board" ON public.projects
  FOR SELECT
  TO authenticated
  USING (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "projects_insert_lead_board" ON public.projects;
CREATE POLICY "projects_insert_lead_board" ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      public.current_org_role_id() = 2
      AND created_by = auth.uid()
      AND chapter_id = (SELECT chapter_id FROM public.users WHERE user_id = auth.uid())
    )
    OR public.current_org_role_id() = 3
  );

DROP POLICY IF EXISTS "projects_update_lead_own" ON public.projects;
CREATE POLICY "projects_update_lead_own" ON public.projects
  FOR UPDATE
  TO authenticated
  USING (
    public.current_org_role_id() = 2
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.current_org_role_id() = 2
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "projects_update_board" ON public.projects;
CREATE POLICY "projects_update_board" ON public.projects
  FOR UPDATE
  TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "projects_delete_board" ON public.projects;
CREATE POLICY "projects_delete_board" ON public.projects
  FOR DELETE
  TO authenticated
  USING (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 5. shifts (007) -- 4 policies
-- NOTE: shifts_select_authenticated is named "authenticated" but contains a
-- Board branch, so it is in scope.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "shifts_select_authenticated" ON public.shifts;
CREATE POLICY "shifts_select_authenticated" ON public.shifts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = shifts.project_id
      AND (
        p.is_published = true
        OR p.created_by = auth.uid()
        OR public.current_org_role_id() = 3
      )
    )
  );

DROP POLICY IF EXISTS "shifts_insert_lead_board" ON public.shifts;
CREATE POLICY "shifts_insert_lead_board" ON public.shifts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = shifts.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  );

DROP POLICY IF EXISTS "shifts_update_lead_board" ON public.shifts;
CREATE POLICY "shifts_update_lead_board" ON public.shifts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = shifts.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = shifts.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  );

DROP POLICY IF EXISTS "shifts_delete_lead_board" ON public.shifts;
CREATE POLICY "shifts_delete_lead_board" ON public.shifts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = shifts.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 6. project_roles (008) -- 4 policies
-- NOTE: project_roles_select_authenticated also contains a Board branch.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "project_roles_select_authenticated" ON public.project_roles;
CREATE POLICY "project_roles_select_authenticated" ON public.project_roles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = project_roles.project_id
      AND (
        p.is_published = true
        OR p.created_by = auth.uid()
        OR public.current_org_role_id() = 3
      )
    )
  );

DROP POLICY IF EXISTS "project_roles_insert_lead_board" ON public.project_roles;
CREATE POLICY "project_roles_insert_lead_board" ON public.project_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = project_roles.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  );

DROP POLICY IF EXISTS "project_roles_update_lead_board" ON public.project_roles;
CREATE POLICY "project_roles_update_lead_board" ON public.project_roles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = project_roles.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = project_roles.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  );

DROP POLICY IF EXISTS "project_roles_delete_lead_board" ON public.project_roles;
CREATE POLICY "project_roles_delete_lead_board" ON public.project_roles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = project_roles.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 7. applications (009) -- 3 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "applications_select_board" ON public.applications;
CREATE POLICY "applications_select_board" ON public.applications
  FOR SELECT
  TO authenticated
  USING (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "applications_update_lead_own_projects" ON public.applications;
CREATE POLICY "applications_update_lead_own_projects" ON public.applications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = applications.project_id
      AND public.current_org_role_id() = 2
      AND p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = applications.project_id
      AND public.current_org_role_id() = 2
      AND p.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "applications_update_board" ON public.applications;
CREATE POLICY "applications_update_board" ON public.applications
  FOR UPDATE
  TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 8. onboarding (010) -- 2 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "onboarding_select_board" ON public.onboarding;
CREATE POLICY "onboarding_select_board" ON public.onboarding
  FOR SELECT
  TO authenticated
  USING (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "onboarding_update_board" ON public.onboarding;
CREATE POLICY "onboarding_update_board" ON public.onboarding
  FOR UPDATE
  TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 9. tasks (011) -- 4 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "tasks_select_board" ON public.tasks;
CREATE POLICY "tasks_select_board" ON public.tasks
  FOR SELECT
  TO authenticated
  USING (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "tasks_insert_lead_board" ON public.tasks;
CREATE POLICY "tasks_insert_lead_board" ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = tasks.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  );

DROP POLICY IF EXISTS "tasks_update_lead_board" ON public.tasks;
CREATE POLICY "tasks_update_lead_board" ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = tasks.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = tasks.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  );

DROP POLICY IF EXISTS "tasks_delete_lead_board" ON public.tasks;
CREATE POLICY "tasks_delete_lead_board" ON public.tasks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = tasks.project_id
      AND (
        (
          public.current_org_role_id() = 2
          AND p.created_by = auth.uid()
        )
        OR public.current_org_role_id() = 3
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 10. badges (012) -- 3 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "badges_insert_board" ON public.badges;
CREATE POLICY "badges_insert_board" ON public.badges
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "badges_update_board" ON public.badges;
CREATE POLICY "badges_update_board" ON public.badges
  FOR UPDATE
  TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "badges_delete_board" ON public.badges;
CREATE POLICY "badges_delete_board" ON public.badges
  FOR DELETE
  TO authenticated
  USING (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 11. user_badges (013) -- 4 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_badges_insert_lead_participation" ON public.user_badges;
CREATE POLICY "user_badges_insert_lead_participation" ON public.user_badges
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.badges b
      INNER JOIN public.projects p ON p.project_id = b.project_id
      WHERE b.badge_id = user_badges.badge_id
      AND b.badge_category = 'Participation'
      AND public.current_org_role_id() = 2
      AND p.created_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.applications a
        WHERE a.project_id = b.project_id
        AND a.user_id = user_badges.user_id
        AND a.status = 'Approved'
      )
    )
  );

DROP POLICY IF EXISTS "user_badges_insert_board" ON public.user_badges;
CREATE POLICY "user_badges_insert_board" ON public.user_badges
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "user_badges_update_board" ON public.user_badges;
CREATE POLICY "user_badges_update_board" ON public.user_badges
  FOR UPDATE
  TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "user_badges_delete_board" ON public.user_badges;
CREATE POLICY "user_badges_delete_board" ON public.user_badges
  FOR DELETE
  TO authenticated
  USING (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 12. announcements (014) -- 2 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "announcements_update_board" ON public.announcements;
CREATE POLICY "announcements_update_board" ON public.announcements
  FOR UPDATE
  TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "announcements_delete_board" ON public.announcements;
CREATE POLICY "announcements_delete_board" ON public.announcements
  FOR DELETE
  TO authenticated
  USING (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 13. project_updates (015) -- 3 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "project_updates_select_board" ON public.project_updates;
CREATE POLICY "project_updates_select_board" ON public.project_updates
  FOR SELECT
  TO authenticated
  USING (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "project_updates_update_board" ON public.project_updates;
CREATE POLICY "project_updates_update_board" ON public.project_updates
  FOR UPDATE
  TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "project_updates_delete_board" ON public.project_updates;
CREATE POLICY "project_updates_delete_board" ON public.project_updates
  FOR DELETE
  TO authenticated
  USING (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 14. fundraising_contacts (016) -- 3 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "fundraising_contacts_insert_board" ON public.fundraising_contacts;
CREATE POLICY "fundraising_contacts_insert_board" ON public.fundraising_contacts
  FOR INSERT TO authenticated
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "fundraising_contacts_update_board" ON public.fundraising_contacts;
CREATE POLICY "fundraising_contacts_update_board" ON public.fundraising_contacts
  FOR UPDATE TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "fundraising_contacts_delete_board" ON public.fundraising_contacts;
CREATE POLICY "fundraising_contacts_delete_board" ON public.fundraising_contacts
  FOR DELETE TO authenticated
  USING (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 15. donations (017) -- 3 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "donations_insert_board" ON public.donations;
CREATE POLICY "donations_insert_board" ON public.donations
  FOR INSERT TO authenticated
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "donations_update_board" ON public.donations;
CREATE POLICY "donations_update_board" ON public.donations
  FOR UPDATE TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "donations_delete_board" ON public.donations;
CREATE POLICY "donations_delete_board" ON public.donations
  FOR DELETE TO authenticated
  USING (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 16. files (018) -- 4 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "files_insert_lead_own_project" ON public.files;
CREATE POLICY "files_insert_lead_own_project" ON public.files
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      category = 'Project'
      AND public.current_org_role_id() = 2
      AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.project_id = files.project_id
        AND p.created_by = auth.uid()
      )
    )
    OR public.current_org_role_id() = 3
  );

DROP POLICY IF EXISTS "files_delete_lead_own_project" ON public.files;
CREATE POLICY "files_delete_lead_own_project" ON public.files
  FOR DELETE TO authenticated
  USING (
    (
      category = 'Project'
      AND public.current_org_role_id() = 2
      AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.project_id = files.project_id
        AND p.created_by = auth.uid()
      )
    )
    OR public.current_org_role_id() = 3
  );

DROP POLICY IF EXISTS "files_update_lead_own_project" ON public.files;
CREATE POLICY "files_update_lead_own_project" ON public.files
  FOR UPDATE TO authenticated
  USING (
    category = 'Project'
    AND public.current_org_role_id() = 2
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = files.project_id
      AND p.created_by = auth.uid()
    )
  )
  WITH CHECK (
    category = 'Project'
    AND public.current_org_role_id() = 2
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = files.project_id
      AND p.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "files_update_board" ON public.files;
CREATE POLICY "files_update_board" ON public.files
  FOR UPDATE TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 17. notifications (019) -- 1 policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_select_board" ON public.notifications;
CREATE POLICY "notifications_select_board" ON public.notifications
  FOR SELECT TO authenticated
  USING (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 18. notification_preferences (020) -- 2 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "notification_preferences_select_board" ON public.notification_preferences;
CREATE POLICY "notification_preferences_select_board" ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "notification_preferences_update_board" ON public.notification_preferences;
CREATE POLICY "notification_preferences_update_board" ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 19. directory_profiles (022) -- 1 policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "directory_profiles_update_board" ON public.directory_profiles;
CREATE POLICY "directory_profiles_update_board" ON public.directory_profiles
  FOR UPDATE TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 20. system_logs (023) -- 2 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "system_logs_select_board" ON public.system_logs;
CREATE POLICY "system_logs_select_board" ON public.system_logs
  FOR SELECT TO authenticated
  USING (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "system_logs_update_board" ON public.system_logs;
CREATE POLICY "system_logs_update_board" ON public.system_logs
  FOR UPDATE TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 21. policy_acknowledgments (024) -- 1 policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "policy_acknowledgments_select_board" ON public.policy_acknowledgments;
CREATE POLICY "policy_acknowledgments_select_board" ON public.policy_acknowledgments
  FOR SELECT TO authenticated
  USING (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 22. volunteer_flags (025) -- 3 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "volunteer_flags_select_board" ON public.volunteer_flags;
CREATE POLICY "volunteer_flags_select_board" ON public.volunteer_flags
  FOR SELECT TO authenticated
  USING (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "volunteer_flags_insert_lead" ON public.volunteer_flags;
CREATE POLICY "volunteer_flags_insert_lead" ON public.volunteer_flags
  FOR INSERT TO authenticated
  WITH CHECK (
    flagged_by = auth.uid()
    AND public.current_org_role_id() = 2
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.project_id = volunteer_flags.project_id
      AND p.created_by = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.applications a
      WHERE a.project_id = volunteer_flags.project_id
      AND a.user_id = volunteer_flags.user_id
      AND a.status = 'Approved'
    )
  );

DROP POLICY IF EXISTS "volunteer_flags_update_board" ON public.volunteer_flags;
CREATE POLICY "volunteer_flags_update_board" ON public.volunteer_flags
  FOR UPDATE TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

-- ---------------------------------------------------------------------------
-- 23. org_settings (026) -- 2 policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "org_settings_insert_board" ON public.org_settings;
CREATE POLICY "org_settings_insert_board" ON public.org_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.current_org_role_id() = 3);

DROP POLICY IF EXISTS "org_settings_update_board" ON public.org_settings;
CREATE POLICY "org_settings_update_board" ON public.org_settings
  FOR UPDATE TO authenticated
  USING (public.current_org_role_id() = 3)
  WITH CHECK (public.current_org_role_id() = 3);

COMMIT;

-- ---------------------------------------------------------------------------
-- Verification (run separately after COMMIT; expects 0 rows)
-- ---------------------------------------------------------------------------
-- SELECT schemaname, tablename, policyname
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (qual LIKE '%auth.jwt%' OR with_check LIKE '%auth.jwt%')
-- ORDER BY tablename, policyname;
