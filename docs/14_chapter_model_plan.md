# 14 — Chapter Model Plan

**Status:** proposed, not implemented. Nothing in this document has been built.
**Written:** September 2026
**Supersedes:** the chapter-related parts of `02_roles_and_permissions.md` and `03_data_model.md` once approved.

---

## Why this exists

The dashboard is built around **projects**. A project is the central object: members
apply to one, get approved, work shifts, complete tasks, earn badges. Chapters are a
four-column scoping filter (`name`, `is_hq`, `location`, `created_at`) whose only job is
deciding which projects a caller can see.

The organization is built around **chapters**. A chapter is a school-based club with an
officer team, a faculty advisor, a monthly obligation, and a reporting cycle to HQ.
Projects are one of the things a chapter does, not the unit of organization.

The model is inverted relative to reality. This plan corrects it additively.

Source of truth for the org model is the HQ document set, not this repo's earlier
planning docs, which drifted. Verbatim copies now live in `docs/org/`, with
`docs/org/00_index.md` as the way in:

- `docs/org/01_overview.md` — Ethos Sustainability Overview
- `docs/org/02_officer_roles.md` — Officer Roles & Responsibilities
- `docs/org/03_chapter_lead_training_guide.md` — Chapter Lead Training Guide
- `docs/org/04_chapter_lead_training_meeting_1_2.md` — Chapter Lead Training, Combined Meeting 1 & 2
- `docs/org/05_brand_guidelines.md` — Brand Guidelines, Chapter Version

Where those documents and the Technical Director's direction disagree, the direction
wins and the documents get updated. Two such cases are recorded in "Decisions taken"
below.

---

## Decisions taken

1. **Officer positions carry real permissions**, not display labels. The Treasurer can
   actually edit budgets in the dashboard; the Secretary can actually record minutes.
   This is the largest consequence in this plan: authorization stops being a single
   global `org_role_id` and becomes a resolved capability set.
2. **Monthly requirement is one event AND one fundraiser**, not either/or. The training
   docs currently say "at least one event or activity each month" and do not mention a
   fundraiser. HQ is updating the docs. The compliance view tracks two counters.
3. **A member of no chapter is an HQ member.** HQ is already modelled as a chapter
   (`chapters.is_hq`), so `users.chapter_id NOT NULL` is correct as written. Signup asks
   whether the member belongs to a chapter and resolves "no" to the HQ chapter. HQ
   members work on HQ teams: conference, podcast, newsletter, media, and so on.
4. **Faculty Advisors are deferred.** They are adults, and `003_users.sql` declares
   `guardian_name` and `guardian_email` `NOT NULL`, so an advisor cannot hold a user row
   today. The onboarding gate also requires `parental_consent_status = 'Signed'` before
   `completed_at`, which an adult would never satisfy. Advisors need a nullable-guardian
   path, an adult account type, and an advisor branch in the consent gate. That is a
   change to minors-safety code and gets its own pass, not a corner of this one.
5. **Nothing is deleted until its replacement works.** Every migration here is additive.
   The project surface stays functional throughout. Retirement is Phase 4 and is gated
   on the chapter surface actually being in use.

---

## Target data model

### Extended: `chapters`

Existing columns stay. Add:

| Column | Type | Notes |
|---|---|---|
| `school_name` | `VARCHAR(200)` | the host high school or college, null for HQ |
| `status` | `VARCHAR(20)` | `Prospective`, `Launching`, `Active`, `Standalone`, `Inactive`, `Closed` |
| `launched_at` | `TIMESTAMP` | null until the launch event happens |
| `standalone_at` | `TIMESTAMP` | null until HQ grants fund autonomy |
| `renewal_due_on` | `DATE` | drives the renewal reminder |

`status` is the chapter lifecycle the Technical Director described: HQ supports a new
chapter, then it becomes standalone and manages its own funds, while still able to
request HQ funds that HQ may deny with a fundraising task instead.

`Standalone` is not only a badge. See open decision 4 for what it changes behaviourally.

### New: `chapter_positions`

Seeded reference table for officer seats.

| Column | Type | Notes |
|---|---|---|
| `position_id` | `SERIAL PK` | |
| `chapter_id` | `UUID NULL` | `NULL` means an org-standard position. Non-null means a position this one chapter invented. |
| `position_name` | `VARCHAR(80)` | |
| `is_required` | `BOOLEAN` | required for chapter recognition |
| `is_lead_eligible` | `BOOLEAN` | can hold the Chapter Lead designation |
| `sort_order` | `INTEGER` | |

Seeded org-standard rows (`chapter_id IS NULL`):

- President — required, lead-eligible
- Vice President — required, lead-eligible
- Secretary — required
- Treasurer — required
- Outreach Coordinator — required
- Media Lead — optional
- Curriculum Lead — optional

The nullable `chapter_id` is what lets a chapter add Events Coordinator or Partnerships
Coordinator without a migration, which the Officer Roles document explicitly allows.

### New: `chapter_officers`

Who holds which seat, in which chapter, for which term.

| Column | Type | Notes |
|---|---|---|
| `chapter_officer_id` | `UUID PK` | |
| `chapter_id` | `UUID NOT NULL` | FK chapters |
| `user_id` | `UUID NOT NULL` | FK users |
| `position_id` | `INTEGER NOT NULL` | FK chapter_positions |
| `is_chapter_lead` | `BOOLEAN NOT NULL DEFAULT false` | the HQ-facing contact |
| `term_start` | `DATE NOT NULL` | |
| `term_end` | `DATE NULL` | null means currently serving |
| `appointed_by` | `UUID NULL` | FK users, who approved this |

Constraints that matter:

```sql
-- Exactly one current chapter lead per chapter.
CREATE UNIQUE INDEX chapter_officers_one_lead
  ON public.chapter_officers (chapter_id)
  WHERE is_chapter_lead AND term_end IS NULL;

-- One current holder per required seat.
CREATE UNIQUE INDEX chapter_officers_one_per_required_seat
  ON public.chapter_officers (chapter_id, position_id)
  WHERE term_end IS NULL;
```

The Chapter Lead Training Guide says the Chapter Lead "may be the President or another
designated officer," which is why `is_chapter_lead` is its own flag rather than being
inferred from the President seat.

### New: `position_capabilities`

The permission mapping. Seeded, and the thing to edit when a position's powers change.

| Column | Type |
|---|---|
| `position_id` | `INTEGER` FK chapter_positions |
| `capability` | `VARCHAR(60)` |

Capability vocabulary (draft):

| Capability | Meaning |
|---|---|
| `chapter.manage_officers` | appoint and end officer terms |
| `chapter.manage_members` | add, remove, verify chapter membership |
| `chapter.submit_proposal` | send a project proposal to HQ |
| `chapter.edit_budget` | edit proposal budget lines |
| `chapter.request_funds` | ask HQ for money |
| `chapter.submit_financial_report` | post-event financials |
| `chapter.record_minutes` | write meeting minutes |
| `chapter.take_attendance` | record meeting attendance |
| `chapter.post_announcement` | chapter-scoped announcements |
| `chapter.submit_post_event_report` | |
| `chapter.submit_semester_report` | |
| `chapter.manage_media` | upload and publish chapter media |

Seeded mapping:

| Position | Capabilities |
|---|---|
| President | all of the above |
| Vice President | everything except `manage_officers` and `edit_budget` |
| Secretary | `record_minutes`, `take_attendance`, `post_announcement` |
| Treasurer | `edit_budget`, `request_funds`, `submit_financial_report` |
| Outreach Coordinator | `manage_members`, `post_announcement` |
| Media Lead | `manage_media` |
| Curriculum Lead | none structural yet |

Board keeps universal access unchanged. Capabilities are additive on top of
`org_role_id`, never a downgrade of it.

### New: `hq_teams`, `hq_team_members`

HQ work currently has no home. `005_project_types.sql` encodes HQ teams as **project
types** (ids 10 to 16: Media, Newsletter, Business, STEM, Funding, Finance, CS). That
conflates "I am on the newsletter team" with "this project is a newsletter project," so
a person cannot be on two teams, and the 3-active-project cap would cap an HQ member at
three teams. Conference and Podcast, both named as real HQ work, are not in the list at
all.

| `hq_teams` | Type |
|---|---|
| `team_id` | `SERIAL PK` |
| `team_name` | `VARCHAR(80)` |
| `description` | `TEXT` |
| `is_active` | `BOOLEAN` |

Seeded: Media, Newsletter, Business, STEM, Funding, Finance, CS, Conference, Podcast.

| `hq_team_members` | Type |
|---|---|
| `team_id` | `INTEGER` FK |
| `user_id` | `UUID` FK |
| `team_role` | `VARCHAR(20)` — `Member` or `Lead` |
| `joined_at` / `left_at` | `TIMESTAMP` |

`project_types` 10 to 16 stay in the table so existing project rows keep resolving. They
stop being offered in the new-project UI. That is Phase 4.

### New: `chapter_role_requests`

The flow the Technical Director asked for: join as a member, then request to be chapter
head from inside the dashboard. Generalized to any officer seat, because the same
mechanism serves "I want to be Treasurer."

| Column | Type | Notes |
|---|---|---|
| `request_id` | `UUID PK` | |
| `user_id` | `UUID NOT NULL` | |
| `chapter_id` | `UUID NOT NULL` | may be a chapter the user is not yet in |
| `position_id` | `INTEGER NOT NULL` | |
| `wants_chapter_lead` | `BOOLEAN NOT NULL DEFAULT false` | |
| `reason` | `TEXT` | why they want it, shown to the reviewer |
| `status` | `VARCHAR(20)` | `Pending`, `Approved`, `Denied`, `Withdrawn` |
| `reviewed_by` / `reviewed_at` / `review_note` | | |

Approval on success writes the `chapter_officers` row in the same transaction. Routing
of who reviews which request is open decision 2.

### New: `chapter_activities`

The unit the monthly obligation counts. See open decision 1 for why this is a new table
rather than a flag on `projects`.

| Column | Type | Notes |
|---|---|---|
| `activity_id` | `UUID PK` | |
| `chapter_id` | `UUID NOT NULL` | |
| `title` | `VARCHAR(200)` | |
| `activity_type` | `VARCHAR(20)` | `Event`, `Fundraiser`, `Meeting`, `Workshop` |
| `scheduled_for` | `TIMESTAMP NOT NULL` | what month it counts toward |
| `status` | `VARCHAR(20)` | `Planned`, `Approved`, `Completed`, `Cancelled` |
| `project_id` | `UUID NULL` | FK projects, set only when the activity needs volunteer shifts and applications |
| `created_by` | `UUID NOT NULL` | |

An activity counts toward the month when `status = 'Completed'` and its post-event report
exists. One `Event` and one `Fundraiser` per calendar month, per decision 2.

The nullable `project_id` is the bridge: a workshop that needs six volunteers on two
shifts creates a project and links it. A chapter officer meeting does not.

### New: `activity_proposals`, `proposal_budget_items`

The pre-event Project Proposal from the Chapter Lead Training Guide.

`activity_proposals`: `proposal_id`, `activity_id`, `chapter_id`, `purpose`,
`learning_goals`, `audience`, `planned_activities`, `timeline`, `staffing`,
`safety_notes`, `funding_plan`, `budget_total`, `status` (`Draft`, `Submitted`,
`Approved`, `Denied`, `Changes Requested`), `submitted_by`, `submitted_at`,
`reviewed_by`, `reviewed_at`, `review_note`, `denial_action` (`None`, `Fundraise`).

`denial_action = 'Fundraise'` is the Technical Director's rule that HQ can deny a funding
request and hand back the task of fundraising for it instead. Storing it on the denial
means the chapter sees what to do next rather than just a rejection.

`proposal_budget_items`: `item_id`, `proposal_id`, `label`, `category`, `amount`.

### New: `post_event_reports`

`report_id`, `activity_id`, `attendance_count`, `outcomes`, `feedback_summary`,
`actual_spend`, `challenges`, `support_requests`, `photo_consent_confirmed`,
`submitted_by`, `submitted_at`.

`photo_consent_confirmed` is a boolean the submitter must check, because the reporting
doc asks for "photos with appropriate consent" and every member is a minor.

### New: `semester_impact_reports`

`report_id`, `chapter_id`, `term` (e.g. `Fall 2026`), `summary`, `member_count`,
`activities_held`, `funds_raised`, `highlights`, `challenges`, `goals_next_term`,
`submitted_by`, `submitted_at`, `status`.

### New: `chapter_meetings`, `chapter_meeting_attendance`

The Secretary's job has no tables today.

`chapter_meetings`: `meeting_id`, `chapter_id`, `meeting_type` (`Chapter`, `Officer`,
`HQ Chapter Leads`), `held_on`, `agenda`, `minutes`, `recorded_by`.

`chapter_meeting_attendance`: `meeting_id`, `user_id`, `attendance_status` (`Present`,
`Absent`, `Excused`).

The monthly HQ Chapter Leads Meeting is recorded as a `HQ Chapter Leads` meeting whose
attendance rows are the chapter leads. Lead attendance is one of the compliance signals.

### New: `chapter_fund_requests`

`request_id`, `chapter_id`, `activity_id` (nullable), `amount`, `purpose`, `status`
(`Pending`, `Approved`, `Denied`), `decided_by`, `decided_at`, `decision_note`,
`denial_action` (`None`, `Fundraise`).

Separate from proposal budgets because a chapter can ask for money outside an event.

### Not a table: chapter compliance

Whether a chapter is current on its month is **computed**, not stored. A stored
compliance table would need syncing every time an activity, report, or meeting changes,
and would silently drift. A SQL view or a single API endpoint answers:

- did an `Event` activity complete this month, with its report in
- did a `Fundraiser` activity complete this month, with its report in
- did the chapter lead attend this month's HQ Chapter Leads Meeting
- are any proposals or reports overdue
- is the semester impact report in, once the term closes

---

## Authorization design

This is the part that must not be got wrong, and the part most likely to reintroduce the
bug class this codebase already fought.

### Non-negotiable

`CLAUDE.md` is binding here: **never read role or chapter from JWT custom claims**. The
`custom_access_token_hook` is registered but its claims are not reliably populated in
production, and a missing claim evaluates to `NULL`, which fails closed as a silent
lockout. Migration 029 replaced 63 RLS policies for exactly this reason. Capabilities
must come from the database on every request.

### API layer

`lib/api-auth.ts` gains a resolver alongside the existing `authenticate()`:

```typescript
export type ResolvedCaller = AuthedUser & {
  officerSeats: Array<{ chapterId: string; positionId: number; isChapterLead: boolean }>;
  capabilities: Set<string>;
  hqTeams: Array<{ teamId: number; teamRole: 'Member' | 'Lead' }>;
};
```

One additional query joining `chapter_officers` to `position_capabilities`, filtered to
`term_end IS NULL`. Board short-circuits to all capabilities without the join.

Capability checks are chapter-scoped, so the helper takes the target chapter:

```typescript
function can(caller: ResolvedCaller, capability: string, chapterId: string): boolean;
```

A President of chapter A calling a chapter B endpoint has no capability there. That check
being per-chapter rather than global is the whole point, and it is the easiest thing to
get wrong by writing `capabilities.has('chapter.edit_budget')` with no chapter argument.

### RLS layer

Migration 029 established the pattern: `SECURITY DEFINER` helper functions instead of
claim reads. Extend it:

```sql
CREATE FUNCTION public.has_chapter_capability(target_chapter UUID, cap TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chapter_officers co
    JOIN public.position_capabilities pc ON pc.position_id = co.position_id
    WHERE co.user_id = auth.uid()
      AND co.chapter_id = target_chapter
      AND co.term_end IS NULL
      AND pc.capability = cap
  ) OR public.current_org_role_id() = 3;
$$;
```

Fail-closed by construction: a user with no officer row gets `false`, not `NULL`.

### What happens to `org_role_id`

It stays. Board stays 3 and keeps universal access. Member stays 1. `Project Lead` (2)
becomes ambiguous once officers exist, and the honest answer is that it probably should
not survive Phase 4, but nothing in Phases 1 to 3 depends on removing it. Flagged, not
decided.

---

## Phasing

### Phase 0 — unblocked, unrelated to this plan

These are already identified and do not touch the chapter model. Worth shipping first
because they are small and the app is live.

- `CreateProjectWizard.tsx` duplicates shifts and roles on any re-save after an edit.
  The index-based guard clears itself on edit, so a retry re-POSTs children that already
  exist. Fix is reconcile by server id.
- Project delete does not exist; close exists but has no UI. Conditional delete for
  history-free projects, close for everything else, plus the UI for both.
- `FullSidebarLayout.tsx` has a fixed `w-60` sidebar with no breakpoint. Mobile is
  unusable, and the audience is 14 to 17 year olds, so this likely outranks everything
  else here on priority.

### Phase 1 — identity and leadership

Migrations: `chapters` extensions, `chapter_positions`, `chapter_officers`,
`position_capabilities`, `hq_teams`, `hq_team_members`, `chapter_role_requests`, the
`has_chapter_capability` helper, RLS for all of the above.

Code: the capability resolver in `lib/api-auth.ts`; officer CRUD behind
`chapter.manage_officers`; the request-to-hold-a-seat flow and its review queue; a
chapter home page showing identity, officers, and members; HQ team membership for
chapter-less users.

Done when: a member can request chapter head, someone can approve it, and the approved
President can do something a Member cannot.

### Phase 2 — the cadence

Migrations: `chapter_activities`, `activity_proposals`, `proposal_budget_items`,
`post_event_reports`.

Code: proposal composer gated on `chapter.submit_proposal`; budget lines gated on
`chapter.edit_budget`; HQ review queue with approve, deny, deny-with-fundraise, and
request-changes; post-event report form; the computed monthly compliance view with its
two separate counters.

Done when: a chapter can propose an event, HQ can approve or deny it with a fundraising
task, and the chapter page shows whether this month is satisfied.

### Phase 3 — records

Migrations: `chapter_meetings`, `chapter_meeting_attendance`,
`semester_impact_reports`, `chapter_fund_requests`.

Code: minutes and attendance for the Secretary; semester impact submission; fund
requests and HQ decisions.

### Phase 4 — retirement

Only once Phases 1 to 3 are in real use.

- Stop offering `project_types` 10 to 16 for new projects; migrate any HQ-team meaning
  off them.
- Decide the fate of the 3-active-project cap, open calls, badges, `volunteer_flags`,
  and `org_role_id = 2` in a chapter-centred world.
- Reconcile `02_roles_and_permissions.md` and `03_data_model.md` with what was built.

---

## Open decisions

These are not guesses to make later. Each one changes the schema or the behaviour of a
platform for minors, and each needs an answer from the Technical Director.

**1. Activities as their own table, or a flag on `projects`?**
Recommendation: own table, with a nullable `project_id` link. A chapter meeting is not
something you apply to, and `projects` carries shifts, roles, applications, an open-call
funnel, and a 3-active cap that make no sense for "we held a bake sale." The cost is two
adjacent concepts that a future reader could confuse, which the nullable link mitigates
by making the relationship explicit.

**2. Who reviews a role request?**
A chapter-head request from outside the chapter has no in-chapter reviewer, so HQ must
review it. For other officer seats the natural reviewer is the sitting President. But
that means a President reviews their own succession, and a chapter with no President has
nobody. Proposal: HQ reviews anything with `wants_chapter_lead`, the President reviews
the rest, and HQ is the fallback when the seat is vacant. Needs confirmation.

**Decided 2026-10-12: Board approves every role request**, chapter head and every other
officer seat alike. This removes both problems above: no President reviews their own
succession, and a chapter with no President is never left without a reviewer. The cost
is Board review load, which grows with the number of chapters. Reviewer is Board
(`org_role_id = 3`), checked by DB lookup, never a JWT claim.

**3. Does the 3-active-project cap survive?**
It is currently enforced at approval. In a chapter-centred model, is a member capped on
chapter activities, on HQ projects, on both, or neither?

**4. What actually changes when a chapter goes `Standalone`?**
The word implies managing their own funds. Concretely: do their proposals stop needing
HQ approval, or only their budgets? Do fund requests disappear or just default to
denied-with-fundraise? Does the monthly obligation still apply? This is the difference
between a status badge and a real branch in the approval code.

Not a Phase 1 blocker: Phase 1 only adds the `status` column. The behaviour lands in
Phase 2 (proposals) and Phase 3 (fund requests), so it must be answered before Phase 2.
Options, recorded 2026-10-12, still undecided:

- **A. Budget autonomy only.** Event proposals still need Board approval, because that
  review is also a safety check on events involving minors (location, supervision).
  Budget lines paid from the chapter's own funds need no HQ sign-off. Fund requests to
  HQ still go to Board. Monthly obligation still applies. Smallest branch in the code.
- **B. Full autonomy.** Proposals are auto-approved and Board is notified. Reports and
  the monthly obligation still apply. Removes the event safety review for those chapters.
- **C. Badge only for now.** `Standalone` changes nothing in code until a real need
  appears. Cheapest, but the status then means nothing in the app.

**5. Officer terms and the academic year.**
Do terms auto-expire on a date? What does a chapter with no sitting President look like
in the app on the first day of the school year, and who can act for it? Leaving this
unanswered means a chapter can silently lose its ability to submit anything.

**6. Are dues in scope for the app at all?**
The Overview says chapters may collect dues and that all funds route to the HQ account.
Nothing in this plan tracks dues. If dues need to be visible in the dashboard, that is
another table and probably another compliance signal.

**7. Chapter membership verification.**
Signup asks which chapter a member belongs to. Someone has to confirm they really are in
that club. Is that the President, the Outreach Coordinator, or HQ? Until this is
answered, `chapter.manage_members` has no defined holder for the verification step.
