# Ethos App - Session State

## Phase 3 (lib clients)
✅ Complete

## Phase 4 (API routes)
✅ Complete - all ~64 endpoints done

## Phase 5 (UI chunks)
✅ Complete

## UI chunks
? Chunk 1: Complete
? Chunk 2: Complete
? Chunk 3: Complete
? Chunk 4: Complete
? Chunk 5: Complete
✅ Chunk 6: Complete

## Completed endpoints
✅ `POST /api/auth/link-ethos-email`
✅ `GET + PATCH /api/users/me`
✅ `GET /api/users/:user_id`
✅ `PATCH /api/users/:user_id/role`
✅ `GET /api/users/directory`
✅ `GET /api/chapters`
✅ `GET + POST /api/projects`
✅ `GET /api/projects/:project_id`
✅ `PATCH /api/projects/:project_id`
✅ `POST /api/projects/:project_id/publish`
✅ `POST /api/projects/:project_id/close`
✅ `POST + PATCH + DELETE /api/projects/:project_id/shifts`
✅ `POST + PATCH + DELETE /api/projects/:project_id/roles`
✅ `GET + POST /api/applications`
✅ `PATCH /api/applications/:id/approve`
✅ `PATCH /api/applications/:id/reject`
✅ `PATCH /api/applications/:id/withdraw`
✅ `PATCH /api/applications/:id/reassign-role`
✅ `GET /api/onboarding/me`
✅ `POST /api/onboarding/connect-slack`
✅ `PATCH /api/onboarding/orientation-progress`
✅ `POST /api/onboarding/send-waiver`
✅ `POST /api/onboarding/send-parental-consent`
✅ `POST /api/onboarding/resend-parental-consent`
✅ `POST /api/webhooks/opensign`
✅ `POST /api/webhooks/slack/announcements`
✅ `POST /api/webhooks/slack/project-updates`
✅ `GET + POST /api/tasks`
✅ `PATCH + DELETE /api/tasks/:task_id`
✅ `GET + POST /api/files`
✅ `DELETE /api/files/:file_id`
✅ `GET + POST /api/badges`
✅ `POST /api/badges/:badge_id/award`
✅ `GET /api/notifications/me`
✅ `PATCH /api/notifications/:notification_id/read`
✅ `PATCH /api/notifications/me/read-all`
✅ `GET + PATCH /api/notification-preferences/me`
✅ `GET /api/announcements`
✅ `GET /api/projects/:project_id/updates`
✅ `GET /api/recents/me`
✅ `POST /api/recents`
✅ `GET + POST /api/donations`
✅ `PATCH + DELETE /api/donations/:donation_id`
✅ `GET + POST /api/fundraising-contacts`
✅ `PATCH + DELETE /api/fundraising-contacts/:contact_id`
✅ `GET /api/org-settings`
✅ `PATCH /api/org-settings/:key`
✅ `POST + GET /api/flags`
✅ `PATCH /api/flags/:flag_id/resolve`
✅ `GET /api/system-logs`
✅ `PATCH /api/system-logs/:log_id/resolve`
✅ `GET + POST /api/policy-acknowledgments/me`
✅ `PATCH /api/directory-profiles/me`
✅ `PATCH /api/projects/:project_id/budget`
✅ `GET /api/search`

## Deployment

- Live at `https://ethosdashboard.vercel.app`

## Completed since last update

- Auth callback working (middleware + PKCE client-side fix)
- Board Panel visible (DB role check instead of JWT)
- Account page with sign out
- Project detail page loads for Board users
- Edit page loads project shifts and roles from server props
- Edit page mutation calls include authorization headers
- `POST /api/projects` uses DB role lookup for authorization
- `GET /api/projects/:id` uses DB role lookup for visibility
- Sidebar: Recents removed, Projects I Lead renamed, tier dot colors added
- Pending count bug fixed on project overview
- Custom Select dropdown component
- Ethos insignia logo added to sidebar/logo components
- All 33 remaining API routes fixed to use DB `org_role_id` lookup instead of JWT claims (commit `e96f103`)
- All 63 RLS policies fixed to use DB role lookup instead of JWT claims (migration `029`, applied to production 2026-09-07)
- Volunteer flags empty state text now matches the active filter
- Role management panel shows the full roster (was showing only the viewer)

## JWT role issue — resolved

✅ Complete (2026-08-05) — All API routes now query `users.org_role_id` from the database for authorization instead of reading `claims.org_role_id` from the JWT. JWT custom claims are not reliably populated in production, so role checks must not depend on them.

33 route files were fixed in commit `e96f103` (`fix: replace JWT role claims with DB lookups across all API routes`):

- **Inline lookups** (24 files) — each handler fetches `orgRoleId` via `supabaseAdmin` right after auth and uses it in place of `claims.org_role_id`.
- **Shared `requireUser` helpers** (donations, flags, fundraising-contacts, search) — fixed once in the helper; all callers inherit the fix.
- **Shared `requireBoard` helpers** (donations/:id, flags/:id/resolve, fundraising-contacts/:id, system-logs, system-logs/:id/resolve) — fixed once in the helper.

`tsc --noEmit` passes with zero errors. No remaining `claims.org_role_id` references anywhere in the codebase.

`claims.chapter_id` was not part of this pass — see "chapter_id claim — resolved" below for why that was the wrong call and how it was closed out.

## Pattern for DB role fix

After `extractClaims(token)`, add:

```ts
const { data: roleData } = await supabaseAdmin
  .from('users')
  .select('org_role_id')
  .eq('user_id', claims.sub)
  .maybeSingle();

const orgRoleId = roleData?.org_role_id ?? 1;
```

Then replace `claims.org_role_id` with `orgRoleId` in route-handler authorization checks.

RLS policies were fixed separately — see below.

## RLS JWT claim issue — resolved

✅ Complete (2026-09-07) — All RLS policies now resolve the caller's role via a
database lookup instead of reading it off the JWT. This is the database-layer
counterpart to the API-route fix above; that fix covered route handlers only and
left the policies themselves still reading `auth.jwt() ->> 'org_role_id'`.

**Symptom:** every policy gated on a claim evaluated to NULL rather than TRUE,
so it silently denied. Board and Project Lead lost access they should have had.
The visible case was the role management panel returning only the viewer's own
row — `users_select_board` never matched, leaving `users_select_own` as the only
policy that did. These all failed closed, so this was a lockout, never a
privilege escalation.

**Fix:** migration `029_fix_rls_jwt_claims.sql` adds a `SECURITY DEFINER` helper
and rewrites **63 policies across 23 tables** to call it:

```sql
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
```

`SECURITY DEFINER` is required, not merely convenient: policies on `users` and
`user_auth` need the caller's role, and an inline subquery against `users` from
inside a policy on `users` would re-enter that policy and recurse. Returns NULL
for unknown users, so comparisons still fail closed.

Also replaced the single `chapter_id` claim in `projects_insert_lead_board` with
a subquery, matching the existing pattern at `006_projects.sql:70`.

**Applied to production 2026-09-07**, in four manual batches via the Supabase SQL
editor. The single-transaction run failed silently, so the migration was split
and each batch run separately. Verified with zero rows from:

```sql
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual LIKE '%auth.jwt%' OR with_check LIKE '%auth.jwt%');
```

**Consequence:** Board-scoped reads through the anon client now work under RLS.
`app/(dashboard)/board/roles/page.tsx` had been using `supabaseAdmin` to work
around the broken policy; it is back on the anon client.

`claims.chapter_id` in API routes was left untouched — the unreliable-claims
issue only affected `org_role_id`.

**When adding new policies:** use `public.current_org_role_id() = 3`, never
`auth.jwt() ->> 'org_role_id'`.

## chapter_id claim — resolved

✅ Complete (2026-09-08) — The two fixes above both recorded that `claims.chapter_id`
was "left untouched" because the unreliable-claims issue "only affected `org_role_id`".
That reasoning was wrong, and the note was also factually stale.

**Why the reasoning was wrong:** both claims are written by the same function, in the
same code path, from a single `SELECT`, guarded only by symmetric `IF ... IS NOT NULL`
checks (`000_jwt_hook.sql`). There is no mechanism by which `org_role_id` fails to reach
the JWT while `chapter_id` succeeds. And `users.chapter_id` is `NOT NULL`
(`003_users.sql:18`), so for any user with a row either both guards pass or the row does
not exist and neither does. The claims share fate. `chapter_id` should have been treated
as unreliable from the start.

**Why the note was stale:** an audit on 2026-09-08 found **zero** `claims.chapter_id`
references in API routes. Every chapter-scoping route already resolved chapter via a DB
lookup — `projects` (GET scoping + POST chapter check), `projects/:id` (visibility),
`search`, `users/directory`, `users/:id`. There was nothing left to fix there.

**What was actually still reading a claim:** one server component,
`app/(dashboard)/open-calls/page.tsx`. It defined its own local `decodeStringClaim()`
helper — a private re-implementation of the deleted `lib/decode-role.ts`, which is why
grepping for `decodeRoleId` never surfaced it — and used it to read `chapter_id` off the
access token for the chapter filter chips. With the claim absent, `userChapterId` was
null, so "My Chapter" matched nothing and "Nearby" matched every non-HQ project
including the member's own chapter. Display-only, no data exposure: the underlying query
is already narrowed to published open calls under RLS. Fixed by adding `chapter_id` to
the users query the page already runs.

**Separate bug found in the same audit:** `app/api/search/route.ts` interpolated
`auth.chapterId` straight into its PostgREST `.or()` filter with no null guard, emitting
`chapter_id.eq.null` and a 400 for any caller without a users row — every brand-new
Google sign-in before their first application. `projects/route.ts` had guarded this case
and documented it; `search` never got the same treatment. Now builds a filter array and
only adds the chapter clause when a chapter is known. The members branch of the same
route was already guarded.

`types/auth.ts` still declares `org_role_id` and `chapter_id` on `JwtClaims` — they do
exist on the token's shape — but the doc comment claimed they were "available via
`auth.jwt()` in RLS policies", which is false since migration `029` and was an active
invitation to reach for the claim. Rewritten to say the fields must never be trusted for
authorization and to point at the DB-lookup pattern in each layer.

**Current state: zero JWT custom-claim reads anywhere** — API routes, RLS policies,
server components, client components. `extractClaims` remains in use for `sub` and
`email` off the server-verified token, which is correct and unaffected.

## Wizard duplicate children on retry — fixed

✅ Fixed (2026-09-09) — `components/lead/project-wizard/CreateProjectWizard.tsx`.

The standing priority item read "wizard shift/role child POSTs need logging and response
checks; failures can still be swallowed". That was stale: both loops in
`createProjectChildren` already check `!res.ok` and throw, and the error surfaces through
`publishError`. Nothing was being swallowed.

**The actual bug:** `saveDraft` (:249) and `publishProject` (:263) both do
`projectId ?? await createDraftProject()`, so a retry reuses the existing project — but
`createProjectChildren` always looped the full `formData.shifts` and `formData.roles`
from index 0. Any retry after a failure re-POSTed the children that had already
succeeded.

The most likely path in practice: a Lead clicks Publish, all shifts and roles are
created, then the publish call itself fails. They fix whatever it complained about and
click Publish again — and the project now has every shift and role twice.

**Fix:** two `useRef<Set<number>>` trackers record which shift/role indexes have landed
on the server. The loops skip recorded indexes and record each on success. Verified by
reasoning through four paths: clean run (all created once), retry after publish failure
(all skipped, straight to publish), mid-loop failure (only the unfinished tail retried),
and edit-then-retry (see limitation).

**Limitation, deliberate:** the trackers are cleared whenever the user edits shifts or
roles, because the indexes would no longer line up with the server rows. So editing
after a partial create still duplicates. That is exactly the behaviour that existed
before this fix, so it is not a regression — but it is not solved either. Not clearing
would be worse: the user's edit would silently never reach the server. A real fix means
PATCHing or DELETEing already-created children, which is a larger change and is now
priority 2.

## Needs Decision

Items that require a product decision, not a code fix. Do not guess at these — see
"Working Independently" in `CLAUDE.md`.

### chapter_id query param: inconsistent between projects and directory
**Flagged:** 2026-09-08 (chapter_id claim audit). **Status:** open. **Not a safety bug.**

Two routes accept a `chapter_id` query param and treat it differently:

- `app/api/projects/route.ts:165` — applies the param for **any** caller. It is safe
  because it is an `.eq()` chained onto the already-applied role scope `.or()`, so it
  can only narrow what the caller could already see, never widen it. A Member can use
  it to filter, but cannot use it to reach another chapter's unpublished or non-open-call
  projects.
- `app/api/users/directory/route.ts:74` — returns 403 `FORBIDDEN` for any non-Board
  caller that passes the param at all, with the message "chapter_id filter is only
  available to Board members".

So the same param is a permitted filter in one route and a forbidden capability in the
other. Both are safe; they just disagree about what the param *means*.

**The decision:** should Members and Project Leads be able to filter projects by chapter
via this param?
- **Option A — leave projects as-is, param is a filter.** Members can narrow the open-call
  board by chapter. Harmless, arguably useful for "show me what the Denton chapter is
  running". Directory stays stricter because member lists are personal data and projects
  are not.
- **Option B — make projects match directory, Board-only.** Consistent rule across the
  API, easier to reason about, one less thing to get wrong in a future route. Costs the
  filtering ability, and would need a UI check for anywhere the client sends the param.

Option A is the status quo and needs only a comment explaining the deliberate difference.
Option B needs a code change plus a check of every caller that sends `chapter_id`.

Whichever is chosen, record the rule in `CLAUDE.md` so the next route that takes a
chapter param does not have to re-litigate it.

### Project delete: not in the API spec, and `close` is the spec'd path
**Flagged:** 2026-09-09. **Status:** open. **Blocks "Next priorities" item 1.**

"Add project delete flow and `DELETE /api/projects/:id`" has been sitting at the top of
Next priorities, but building it would violate `AGENTS.md` ("Do not create any API
endpoints not in the API spec"). Verified 2026-09-09:

- `docs/13_api_spec_part1.md` contains `DELETE` for **shifts** (:448) and **roles**
  (:484) only. There is no `DELETE /api/projects/:project_id` anywhere in the spec.
- No `DELETE` handler exists on `app/api/projects/[project_id]/route.ts` (only `GET`
  and `PATCH`).
- No delete UI exists. The only `confirmVariant="danger"` in `EditProjectForm.tsx` is
  the shift/role remove dialog, which correctly targets the two spec'd endpoints.

What the spec *does* provide for retiring a project is `POST /api/projects/:project_id/close`
(spec :405): sets `is_published = false` and `is_open_call = false`, auto-rejects all
pending applications, notifies those applicants, and cannot be reopened. The route is
built and complete.

**The real gap is that `close` has no UI.** Grep finds zero callers outside the route
file itself — it is an orphaned endpoint. `ProjectHeader.tsx` renders Publish and Edit
buttons and nothing else.

**The decision:** how should a Lead or Board retire a project?
- **Option A — wire up `close` (spec-compliant, no new endpoint).** Add a Close button
  to `ProjectHeader.tsx` behind a confirm dialog, Lead-own or Board-any per the spec's
  auth line. Preserves the project row and all history: applications, tasks, files,
  badges awarded for it, and notifications referencing it all stay intact and readable.
  This is what the spec intends and it needs no product decision to proceed.
- **Option B — add a real delete.** Requires a spec amendment first, then answers to:
  hard delete or soft? What happens to approved applications that count against a
  member's 3-active-project limit? To tasks, files, and project_updates with FK
  references? To badges already awarded for the project? To notifications that link to
  it? On a platform where volunteer hours may be the record a minor relies on for
  school service credit, destroying project history is not a small call.

Recommendation: Option A. It is already specified, already half-built, and reversible in
the sense that a delete could still be added later on top of it. Option B should not be
started without a spec amendment and an explicit product decision.

## Known remaining issues

- Project delete is not implemented, and is not in the API spec — see "Needs Decision"
- `POST /api/projects/:project_id/close` is built but has **zero UI callers** — the spec'd way to retire a project is unreachable from the app
- Wizard shift/role child POSTs **already check `res.ok` and throw** — the old "failures can still be swallowed" note was stale. The real bug was duplicate children on retry, fixed 2026-09-09; one edge case remains, see below
- Wizard: editing shifts/roles *after* a partial create still duplicates them on retry. The created-index tracking is deliberately cleared on edit, because the alternative (keeping it) would silently drop the user's edit instead. A full fix needs PATCH/DELETE of already-created children, which is a larger change
- Notification delivery not wired (records inserted, no email/Slack sends triggered)
- OpenSign webhook header name unverified against real OpenSign docs
- `@dnd-kit` not installed (kanban drag deferred)
- `types/supabase-ssr.d.ts` shim still present (real package installed on Vercel, shim only affects local dev)
- ~60 files show as modified with CRLF-only line-ending churn and zero content change (`git diff --ignore-cr-at-eol` is empty repo-wide); `core.autocrlf` is unset on the Windows machine. Not committed. Worth a `.gitattributes` decision rather than letting it ride

## Next priorities

1. Decide project retirement: wire up the existing `close` endpoint, or amend the spec for a real delete — see "Needs Decision"
2. Wizard: handle edits to already-created shifts/roles (PATCH/DELETE existing children instead of clearing the created-index tracking)
3. Wire notification delivery (records exist, no sends)
4. Test full onboarding flow end to end
5. Test project creation wizard shifts/roles saving
6. OpenSign webhook verification (unverified header)

## Manual setup still needed

- Set `org_settings.slack_invite_link` in Supabase
- Set `org_settings.slack_announcements_channel_id` in Supabase
- Create OpenSign document templates
- Set `OPENSIGN_WAIVER_TEMPLATE_ID` env var in Vercel
- Set `OPENSIGN_CONSENT_TEMPLATE_ID` env var in Vercel
- Confirm `RESEND_FROM_ADDRESS` is correct
- When manually creating Board/Lead users in Supabase, always set `onboarding_complete = true`
