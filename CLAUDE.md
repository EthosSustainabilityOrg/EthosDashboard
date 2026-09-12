@AGENTS.md

# Ethos Dashboard — Claude Code Context

The line above imports AGENTS.md — the full project spec, stack, and build rules. When
it resolves, that content is already in context; do not re-read it as a separate step.

AGENTS.md is deliberately NOT committed (see .gitignore) and exists only in the local
working copy. In a fresh clone or a new Codespace the import resolves to nothing, and
this file is all you get — treat the rules below as the operative spec there, and ask
before inferring anything the spec would have covered.

This file adds the deployment lessons and patterns discovered in production.

## Critical patterns — follow these exactly

### JWT custom claims do NOT work
The Supabase JWT hook (`custom_access_token_hook`) is registered, but claims are not
reliably populated in production. NEVER use `claims.org_role_id` or `claims.chapter_id`
for any authorization or scoping decision, anywhere.

Both claims are set by the same function, in the same code path, from one `SELECT`
(`000_jwt_hook.sql`). There is no failure mode where one is populated and the other is
not, so `chapter_id` is exactly as untrustworthy as `org_role_id` — treat them the same.

**Current state: zero JWT claim reads remain** in API routes, server components, or
client components. `claims` is still used for `sub`/`email` from the server-verified
token, which is fine. The last two custom-claim readers were removed:
- API routes and RLS policies — commits `e96f103` and migration `029`
- `app/(dashboard)/open-calls/page.tsx` — had a local `decodeStringClaim()` helper
  reading `chapter_id` off the access token to drive the chapter filter chips; now
  reads `chapter_id` from the users row it already queries

Before considering any new authorization or chapter-scoping code done, grep for
`claims.org_role_id`, `claims.chapter_id`, `auth.jwt()`, `decodeRoleId`, and any local
token-decoding helper. All should return zero hits.

Always use a DB lookup:
```typescript
const { data: roleData } = await supabaseAdmin
  .from('users')
  .select('org_role_id, chapter_id')
  .eq('user_id', claims.sub)
  .maybeSingle();
const orgRoleId = roleData?.org_role_id ?? 1;
```
The `?? 1` fallback matters: an unknown user defaults to Member, the least-privileged
role. Never default to 2 or 3.

`chapter_id` has no safe default — it is `NOT NULL` in `003_users.sql`, so a null value
means the caller has no users row yet (a brand-new Google sign-in before their first
application), not that they belong to no chapter. Never interpolate a null chapter into
a PostgREST filter string: `chapter_id.eq.null` is invalid UUID syntax and returns a
400. Drop the chapter clause instead — see `app/api/projects/route.ts` and
`app/api/search/route.ts`, which both build a filter array and `unshift` the chapter
clause only when a chapter is known.

### Client-side auth headers
Every client component that fetches `/api/` routes must send an Authorization header:
```typescript
const supabase = useMemo(() => createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
), []);

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}),
  };
}
```
Never use `credentials: 'include'` — the API routes only read the Authorization header.

### Next.js 15 dynamic route params
Params are a Promise. Always await:
```typescript
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
```

### Supabase ambiguous joins
The `applications` table has two FKs to `users` (`user_id` and `reviewed_by`). Always
name the FK:
```typescript
.select('*, users!applications_user_id_fkey(first_name)')
```

### Supabase maybeSingle() on multi-row queries
`.maybeSingle()` throws `PGRST116` when the query matches more than one row. Use
`.limit(1).maybeSingle()` unless the column is genuinely unique. Applications are the
common trap — a member may hold up to 3 approved applications.

### Tailwind v4
Custom colors live in the `@theme` block in `app/globals.css`. `tailwind.config.ts`
still exists and still contains a duplicate of the palette, but Tailwind v4 does not
read it — editing that file has no effect. Change `@theme`.

### Onboarding unlock
Use `unlockOnboardingIfApproved()` from `lib/onboarding.ts`. Never set
`onboarding_complete` directly. Unlocking requires BOTH an approved application and
`onboarding.completed_at` set; that second half is the record that parental consent was
signed, and every member is a minor. The helper enforces it and no-ops until both hold,
so call it from any path that can complete either half.

### Server component role checks
In layouts and pages, query the DB for role:
```typescript
const { data } = await supabase
  .from('users')
  .select('org_role_id')
  .eq('user_id', authUser.id)
  .single();
```
Never use `decodeRoleId()` from the JWT in UI components.

### Middleware
Middleware skips the root path `/` — `app/page.tsx` does its own auth check, and the
duplicate `getUser()` call was timing out. The remaining `getUser()` is raced against a
5s timeout that falls through to `NextResponse.next()`. Middleware only refreshes the
session cookie; it makes no authorization decisions.

## Working Independently

This section applies when working on this repo without someone reviewing each change.

### Before starting any task
- Read `docs/SESSION_STATE.md` **in full**. It is the running record of what is done,
  what is stubbed, what is broken, and what is merely assumed. Starting without it is
  how the same bug gets fixed twice or a deliberate stub gets "fixed" back on.
- Check the "Needs Decision" section for anything that blocks or overlaps the task.

### Before considering any task done
- Run the typecheck: `npx tsc --noEmit`. If the `.bin` shim fails (it is a Windows shim
  and breaks under WSL, Codespaces, or any Linux shell with `exec: node.exe: not found`),
  run `node node_modules/typescript/lib/tsc.js --noEmit` instead.
- **Never commit without running the typecheck first.** No exceptions.
- A clean typecheck is necessary, not sufficient — see "Verify runtime behavior" below.

### After finishing any task
Update `docs/SESSION_STATE.md` with three things:
1. **What changed** — files touched and why, with commit hashes.
2. **What was verified** — what was actually checked, and how. Name the method
   (typecheck, grep, browser click-through, SQL query against production). "Should work"
   is not verification.
3. **What is still open** — anything left undone, any assumption made, anything the
   change deliberately did not cover.

### Authorization changes
When a fix touches authorization, role checks, or chapter scoping, grep for all of these
before calling it complete. Every one should return zero hits:
```
claims.org_role_id
claims.chapter_id
decodeRoleId
decodeStringClaim
auth.jwt()
atob(
```
The last two matter because the pattern has come back disguised: a local
`decodeStringClaim()` helper inside a page component survived two prior cleanup passes
precisely because nobody grepped for anything but `decodeRoleId`. Grep for the
behavior (decoding a token), not just the known function name.

### Verify runtime behavior, not just the typecheck
This codebase has a documented history of `tsc` passing cleanly while the app was
broken at runtime. All three of the recurring bug classes are invisible to the compiler:
- RLS policies that silently deny and return empty result sets
- Ambiguous Supabase joins that fail only when the query actually runs
- Client components missing the `Authorization` header, which fail silently on submit
- PostgREST filter strings built by interpolation, which are just strings to `tsc`

So reason through what the code will actually do at runtime: what the query returns for
each role, what happens when a value is null, what the user sees. Where practical,
confirm against the live deployment or the database rather than assuming.

### Ambiguity and product decisions
Do not guess. If a task requires a product decision the planning docs in `/docs` do not
cover, stop and record it under "Needs Decision" in `docs/SESSION_STATE.md` with the
options and the tradeoff. Guessing at product behavior on a platform for minors is how
a safety property gets quietly weakened.

### Commits
Prefer small, single-purpose commits with clear messages over large batched ones. Keep
mechanical changes (formatting, line endings, renames) in their own commit, separate
from behavioral changes, so a real diff is never buried in noise.

## Known constraints
- npm SSL broken on the local Windows machine — use Codespaces
- `@supabase/ssr` type shim at `types/supabase-ssr.d.ts` (real package installed on Vercel)
- Slack OAuth not wired — Connect Slack button disabled, and the Slack gate in the
  onboarding completion check is commented out in three places (the OpenSign webhook,
  the orientation-progress route, and the onboarding checklist UI). Uncomment all three
  together, or `completed_at` and the checklist will disagree about who is done.
- OpenSign templates not created — waiver/consent flow not testable
- Notification delivery not wired — records inserted, but no email/Slack sends

## Error message rules
Never expose raw field names to users. Write "A title is required", not
"title is required".

## Deployment

- Live at https://ethosdashboard.vercel.app
- Supabase project: `fwozzqwzkeilelcibype`

### Two repos — pushing is not shipping
Work is committed and pushed to the org repo `EthosSustainabilityOrg/EthosDashboard`.
That is where `origin` points, and where history and review live. The personal account
`ethossustainability/ethosdashboard` holds a fork that is **manually synced**, and Vercel
auto-deploys `main` from that fork.

So a push does not deploy. The release flow is three steps:
1. Commit and push to the org repo.
2. Maintainer manually syncs the personal fork.
3. Vercel builds from the fork and the change goes live.

The manual step is deliberate, not an oversight: it is a human review gate before
anything reaches a production app used by minors, and it keeps the flow workable as more
contributors join. The fork exists because Vercel's free tier cannot deploy from private
org repos; an attempted GitHub Actions auto-sync between the two was abandoned after
unresolved "repository not found" errors, which is why the sync is manual.

**Report work as pushed and awaiting sync. Never report it as deployed, shipped, or live
on the strength of a successful push.** Contributors get added to the org repo.
