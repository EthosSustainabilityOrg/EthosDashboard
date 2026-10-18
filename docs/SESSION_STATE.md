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

## API auth consolidation — complete

✅ Complete (2026-09-12 to 2026-09-17), 17 commits, `d116917` through this one.

**What changed.** The API had thirteen route files each defining their own local
`requireUser`/`requireBoard`, with five different return signatures, plus thirty-eight
routes repeating the verify-then-look-up-role prologue inline. That is the same
condition that made the JWT-claims bug cost thirty-three separate fixes: no single
place to fix.

`lib/api-auth.ts` is now the one auth path:
- `authenticate(req)` verifies the Bearer token and resolves role and chapter from the
  database, defaulting role to 1 (Member).
- `authenticateBoard(req)` / `authenticateLeadOrBoard(req)` build on it.
- `authenticateWithAccount(req)` additionally returns the raw Supabase account, for the
  one route that provisions a `users` row from the Google profile.
- `apiError` / `unauthorized` / `forbidden` emit the spec envelope.

Identity now comes from `user.id` on the signature-verified `getUser` response rather
than `claims.sub`, which was a base64 decode that verifies nothing. The two agreed only
because `getUser` ran first; forty-nine routes depended on that ordering.

**Scale:** 13 local helpers to 3 thin adapters plus 1 holdout. 38 inline prologues to 1.
Roughly 800 lines of duplicated auth removed and about 30 redundant `users` queries
dropped, since `authenticate()` returns the role the routes were re-querying.

**Six distinct prologue shapes** were found, which is the real measure of the drift:
combined guard with a block, combined guard as a single-line return, split guards with a
separate `Invalid token payload` variant, verify-only with no claims decode, a
multi-line destructure with a combined guard, and an optional-auth variant.

**What was verified.** `tsc --noEmit` and `eslint` before every commit, both clean, in a
cloned checkout with real dependencies. Every working copy was diffed against `HEAD`
before being written. Authorization predicates were re-read by hand after each batch
rather than inferred from diff stats: the tasks per-record rules, the project visibility
matrix, the chapter scoping in `users/directory` and `users/[user_id]`, the ownership
guards on close/publish/shifts/roles, the consent gate in orientation-progress, and the
approve path's Board-or-owning-Lead check plus `unlockOnboardingIfApproved`.

**Not runtime-tested.** Nothing here was exercised against the live deployment or the
database. `tsc` cannot see an RLS denial, a wrong scope filter, or a 403 that should be
a 401. The changes are behaviour-preserving by construction and by inspection, not by
observation. A click-through of the Board, Lead and Member flows is still owed.

**Behaviour changes, all deliberate and small:**
- The `Invalid token payload` 401 variant is gone from the routes that had it. It sat
  after a `getUser` that had already succeeded, so a valid Supabase JWT always had `sub`
  by that point and the branch was dead. Those routes now return `Invalid token`.
- `badges` GET now performs a `users` lookup it did not before, because `authenticate()`
  always resolves role. One primary-key read on a route that reads no role. Taken
  deliberately rather than adding a fourth verify-only entry point, on the grounds that
  more ways to authenticate is the problem we were fixing.
- `projects` POST reconstructs its `User profile not found` 401 from a null `chapterId`
  rather than a `.single()` error. Equivalent, because `users.chapter_id` is NOT NULL.

**Still open:** `announcements` is the one unmigrated route, held on a product decision
(see Needs Decision). The three remaining `require*` functions in `users/me`, `search`
and `applications` are thin adapters over the shared helper that exist only to preserve
local return shapes; that is intentional, not a loose end.

## Max 3 active projects — now enforced at approval

✅ Fixed (2026-09-17) — `app/api/applications/[application_id]/approve/route.ts`.

`AGENTS.md` states the rule is "enforced in PATCH /api/applications/:id/approve". It was
not. Both limit checks lived in `POST /api/applications`, at submission time, and that
check is stale by the time it matters.

The hole: a member with 2 active projects applies to two more. Each submission passes
independently, because 2 < 3 at the moment of each check. A Lead approves both. The
member now holds 4 active projects, past a limit the spec says exists.

Approval is the moment a project becomes active, so approval is where the count has to
be checked. `approve` now counts the applicant's `Approved` applications and returns 409
`LIMIT_REACHED` at 3 or more, before parsing the body or touching any row. The message
addresses the approver ("This volunteer already has 3 active projects") since a Lead or
Board member is the caller.

**Related, not fixed:** the two HQ rules have the same staleness problem. HQ-project
members cannot join another project, and an HQ project must be a member's only active
project, but both are only checked at submission. `AGENTS.md` specifies POST as the
enforcement point for those, so tightening them at approval would be a spec change
rather than spec compliance. Worth a decision.

## Needs Decision

Items that require a product decision, not a code fix. Do not guess at these — see
"Working Independently" in `CLAUDE.md`.

### chapter_id query param: inconsistent between projects and directory
**Flagged:** 2026-09-08 (chapter_id claim audit). **Resolved 2026-10-04: Option A.**
**Not a safety bug.**

**Decision: leave `projects` as-is.** The param is a permitted filter there and a
Board-only capability on `directory`, and that difference is deliberate because the param
does different things in the two routes: on `projects` it narrows within an already
applied role scope, on `directory` it changes whose personal data you see.

**A third reason surfaced while closing this out, which the original entry missed:**
`components/onboarding/ProjectBoard.tsx:153` sends `chapter_id` **with** an Authorization
header. That is the pre-approval project browser, used by a brand-new volunteer whose
`org_role_id` is 1 and whose `chapter_id` is still null. Making `projects` Board-only
would hand every new volunteer a 403 the moment they picked a chapter from the dropdown,
and the signup funnel would die at its most important page. Option B is not merely
costly, it is breaking.

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
**Flagged:** 2026-09-09. **Resolved 2026-10-04: both, conditionally. Spec amended.**

**Decision: a conditional delete plus a wired-up close.** `DELETE /api/projects/:project_id`
now exists and is specified at `docs/13_api_spec_part1.md:419`, so the AGENTS.md rule
against unspecified endpoints is satisfied. It hard-deletes **only** a project with zero
rows in `applications`, `tasks`, `project_updates`, `files`, `badges` and
`volunteer_flags`, and refuses an already-closed project. Everything else is closed.

The schema is what forced the condition rather than preference. Six FKs to `projects` are
`ON DELETE CASCADE` and `badges` is `ON DELETE SET NULL`, so an unconditional delete
erases the participation record of minors and orphans awarded badges. And
`volunteer_flags.project_id` (025) has no `ON DELETE` clause at all, so it defaults to
NO ACTION: a flagged project cannot be deleted whatever the route wants, and an unguarded
handler would have returned a 500 from Postgres 23503. Adding a cascade to the flags
table was rejected: those are safety records.

Both actions are now reachable from a Danger zone section in `EditProjectForm.tsx`, using
the confirm dialog that was already there for shift and role removal. A closed project
shows a "kept as a record" panel instead of the buttons. The orphaned `close` endpoint and
the unreachable "Closed" badge in `LeadProjectCard.tsx:26` are both live as of this change.

The original entry below is kept because its reasoning is still the reason the delete is
conditional rather than plain.

**Superseded status:** open. **Was blocking "Next priorities" item 1.**

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

## 2026-10-04 — Phase 0: mobile sidebar, wizard reconcile, project delete

Three fixes that do not touch the chapter model, shipped ahead of it because the app is
live. Plus `docs/14_chapter_model_plan.md`, which is proposed and unbuilt.

### Mobile sidebar

**What changed.** `components/layout/FullSidebarLayout.tsx`. The aside was a fixed
`w-60` with no breakpoint, so a 375px phone gave 240px to the sidebar and 135px to the
content. Every dashboard page was unusable on a phone regardless of its own classes, and
the audience is 14 to 17 year olds. Below `md` it is now an off-canvas drawer with a top
bar trigger, a backdrop, Escape to close, and close-on-navigation. At `md` and up the
markup resolves back to the previous layout.

**What was verified.** Playwright, real Tailwind output compiled from this project's
`@theme`, measured at three viewports:

| Viewport | aside | main | page scrollWidth |
|---|---|---|---|
| 375 closed | x=-240, `visibility: hidden` | x=0, w=375 | 375, no h-scroll |
| 375 open | x=0, w=240 | x=0, w=375 | 375, no h-scroll |
| 768 | x=0, w=240 | x=240, w=528 | 768 |
| 1280 | x=0, w=240 | x=240, w=1040 | 1280 |

Content width on a phone goes from 135px to 327px inside the page's own padding. Closed
drawer is `visibility: hidden`, so keyboard users cannot tab into off-screen links.
Desktop geometry is unchanged. `LockedSidebarLayout` was left alone: its `w-16` rail is
fine on a phone.

**Still open.** Closing in a `useEffect` on `[pathname]` trips
`react-hooks/set-state-in-effect`, so the open state records the route it was opened on
and closure is derived. Worth knowing before anyone "simplifies" it back.

### Wizard child reconcile

**What changed.** The duplication bug is fully fixed, and the previous guard was the
cause. `CreateProjectWizard.tsx` tracked created shifts and roles by array index and
cleared the whole set in `updateFormData` whenever the user touched either list, on the
grounds that the indexes would no longer line up. Clearing traded misalignment for
duplication, which is worse: three shifts, a failed publish, one edit, publish again, and
the project held six shifts, three of them orphans with pre-edit values.

Tracking is now `localId -> serverId`. `WizardShift` and `WizardRole` already carried a
stable local `id`, so no new client key was needed. The reconcile moved to
`lib/project-children-sync.ts` as a pure function with an injected `fetcher`, which is
what makes it verifiable, and the wizard now calls it twice. Net about 120 lines out of
the component.

**What was verified.** The module was compiled and driven through six scenarios with a
stubbed fetcher, 18 assertions, all passing:

1. The original bug. Three shifts created, publish fails, user edits one, saves again:
   3 POSTs then 3 PATCHes against the right server ids, and the edited value reaches the
   server. Previously 6 POSTs.
2. Mid-flight failure. The second of three POSTs fails: the map holds exactly the one
   that landed, and the retry POSTs only the two missing and PATCHes the one that existed.
3. Removal. A child dropped from the form is DELETEd, and deletes run before any write.
4. A 409 on DELETE preserves the map entry so a retry cannot duplicate, and the message
   is actionable.
5. A create returning 200 with no id throws rather than silently forgetting the row.
6. `validate()` runs before any request for that item.

The drive script was not committed: there is no test runner in this repo and adding one
is a larger decision. The module is pure and takes an injected fetcher specifically so
the scenarios above can be re-driven in a few lines.

### Project delete and close UI

**What changed.** `DELETE /api/projects/:project_id` added to
`app/api/projects/[project_id]/route.ts`, specified at `13_api_spec_part1.md:419` first
so the AGENTS.md rule on unspecified endpoints holds. Conditional: it refuses unless the
project has zero `applications`, `tasks`, `project_updates`, `files`, `badges` and
`volunteer_flags`, and refuses an already-closed project. Scope matches `close` exactly,
Board or the Lead who created it.

A Danger zone in `EditProjectForm.tsx` exposes both Close and Delete, reusing the confirm
dialog that was already there for shift and role removal, with per-branch copy. A closed
project gets a "kept as a record" panel instead of the buttons.

**What was verified.** Typecheck and column existence. All six counted tables were
confirmed to have a `project_id` column by reading the migrations, and `supabaseAdmin`
bypasses RLS so the counts are not subject to policy. **Not verified at runtime:** no
request has been made against the live database, and the blocker branch in particular has
never executed. That is owed.

**Review fix, 2026-10-12, before first commit.** The history check originally read a
failed count as `count ?? 0`, so any count query that errored passed the check and the
delete cascaded through applications and tasks. It now fails closed: an error or a null
count throws, the outer catch returns 500, and nothing is deleted. A `23503` from the
delete itself (a flag raised between check and delete) now returns a 409 with plain copy
instead of the raw Postgres message, per the error message rules. Verified by typecheck
and the CLAUDE.md auth grep only; the fail-closed branch has not executed either. The
check-then-delete is still not atomic: an application submitted in that window would
cascade. Closing that needs a DB-side guard (trigger or RPC), which is a schema change
and was not made.

**Why conditional.** See the resolved "Project delete" entry under Needs Decision. Short
version: six cascading FKs plus a `SET NULL` on badges means a plain delete erases minors'
participation records, and `volunteer_flags` has no `ON DELETE` clause so a flagged
project could not be deleted at all without a 500.

### Chapter model plan

`docs/14_chapter_model_plan.md`, proposed and unbuilt. Written against the five HQ
documents, which are the source of truth over this repo's earlier planning docs. Those
five were only reachable through one person's Claude project until 2026-10-18; verbatim
copies now live in `docs/org/`. The short version is that the dashboard is project-centred and the
organization is chapter-centred, with chapters currently a four-column scoping filter.

Three decisions are already taken and recorded in the plan: officer positions carry real
per-position permissions, the monthly requirement is one event **and** one fundraiser, and
Faculty Advisors are deferred because `users.guardian_name` and `guardian_email` are
`NOT NULL` and the consent gate would never let an adult finish onboarding.

Two open decisions block Phase 1 and are now Next priorities item 1.

---

## Known remaining issues

- ✅ Project delete implemented 2026-10-04, conditional, and specified at `13_api_spec_part1.md:419` — see "Needs Decision"
- ✅ `close` is wired 2026-10-04 via the Danger zone in `EditProjectForm.tsx` — no longer an orphaned endpoint
- ✅ Wizard child duplication fully fixed 2026-10-04. The index-based tracking is gone; see "Wizard child reconcile" below
- Wizard delete edge case: removing a shift whose start time has already passed is refused by the shifts route with a 409, which blocks the whole save. Reachable by adding a past-dated shift, saving, then removing it. The reconcile keeps its map entry so nothing duplicates, and the message tells the lead to add it back and remove it from the project page instead. Not fixed because preventing it means validating shift start times against now, which is a product rule nobody has set
- Notification delivery not wired (records inserted, no email/Slack sends triggered)
- OpenSign webhook header name unverified against real OpenSign docs
- `@dnd-kit` not installed (kanban drag deferred)
- `types/supabase-ssr.d.ts` shim still present (real package installed on Vercel, shim only affects local dev)
- The API auth consolidation is unverified at runtime — typecheck and inspection only. A Board/Lead/Member click-through of the live deployment is owed
- ✅ HQ project rules now also enforced at approval, 2026-10-17. `PATCH /api/applications/:id/approve` refuses (409 `CONFLICT`) if the volunteer already holds an active HQ project, or if the target is HQ and they hold any active project. `isHqProjectType` moved to `lib/project-types.ts`, shared with `POST /api/applications`. A missing project type on the target counts as HQ, so the check fails closed. Verified by typecheck and the auth grep only; no approval has been run against the live DB for any of the three branches. Not atomic, same as the 3-project check: two Leads approving at the same instant could both pass
- ~60 files show as modified with CRLF-only line-ending churn and zero content change (`git diff --ignore-cr-at-eol` is empty repo-wide); `core.autocrlf` is unset on the Windows machine. Not committed. Worth a `.gitattributes` decision rather than letting it ride

## Next priorities

1. Chapter model decisions. **Decided 2026-10-12:** Board approves every role request (open decision 2). **Decided 2026-10-18:** open decision 4. Every chapter may fundraise for its own budget, report-only and shown on the dashboard; HQ money needs Board approval via a fund request; events always need HQ approval. So `Standalone` is a label with no behavioural branch. Adds an undesigned per-chapter budget ledger to Phase 3. Phase 1 can start
   - OpenSign fix started 2026-10-12, no code changed. Confirmed against docs.opensignlabs.com: base URL `https://app.opensignlabs.com/api/v1.2`, `x-api-token` header, `POST /createdocument/:template_id`, webhook header `x-webhook-signature` (HMAC-SHA256 hex), events `created`/`viewed`/`signed`/`completed`/`declined`, payload carries `objectId`. **Not confirmed:** the createdocument request body (signer/role fields) and its response field names; the public docs page leaves both blank. Get them from the Debug UI or a sandbox call before writing the client
2. Resend setup: account, verified sending domain, `RESEND_API_KEY` and `RESEND_FROM_ADDRESS` in Vercel. The client in `lib/resend.ts` is already correct against the real API, so this is setup only and it unblocks every notification path
3. OpenSign code corrections, all confirmed against the real docs: `lib/opensign.ts` uses the wrong base URL and `Authorization: Bearer` instead of `x-api-token`; the webhook route reads `x-opensign-signature` instead of `x-webhook-signature`; both document-id extractors omit `objectId`. **And the webhook never reads `payload.event`**, so once the header and id fixes land, a guardian merely *viewing* the consent email fires `viewed`, matches `parental_consent_doc_id`, and sets `parental_consent_status = 'Signed'` plus `completed_at`. A minor's onboarding would unlock because their parent opened an email. The event gate must land in the same commit as the extractor fix
4. Privacy Policy and Terms pages. `find app -iname "*privacy*" -o -iname "*terms*"` returns nothing, on a platform collecting guardian emails and signed consent documents from minors. Routes and layout can be built; the text needs qualified review
5. Responsive pass on the remaining pages. The sidebar is fixed; the components are in better shape than first assumed (28 responsive `grid-cols` against 2 unprefixed), so this is smaller than it looked
   - Static scan 2026-10-17 found nothing that needs changing. The 2 unprefixed grids are the step labels in `ApplicationForm.tsx` (2 or 4 short labels, fit at 375px). The only wide element, the `min-w-[760px]` table in `ChapterMetricsTable.tsx`, already sits in `overflow-x-auto`. One soft issue: the "Application level" tooltip in `ApplicationSettingsStep.tsx` opens on hover only. A static scan cannot catch flex rows that overflow, so the pass is not done until the signed-in pages are viewed at 375px, which needs someone signed in per role
6. Runtime verification as Member and Lead. Everything so far is Board-only plus typecheck, and all three recurring bug classes in this repo are invisible to the compiler
7. Test full onboarding flow end to end

## Manual setup still needed

- Set `org_settings.slack_invite_link` in Supabase
- Set `org_settings.slack_announcements_channel_id` in Supabase
- Create OpenSign document templates
- Set `OPENSIGN_WAIVER_TEMPLATE_ID` env var in Vercel
- Set `OPENSIGN_CONSENT_TEMPLATE_ID` env var in Vercel
- Confirm `RESEND_FROM_ADDRESS` is correct
- When manually creating Board/Lead users in Supabase, always set `onboarding_complete = true`
