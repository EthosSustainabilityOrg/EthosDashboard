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
for authorization decisions.

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

## Known constraints
- npm SSL broken on the local Windows machine — use Codespaces
- `@supabase/ssr` type shim at `types/supabase-ssr.d.ts` (real package installed on Vercel)
- Slack OAuth not wired — Connect Slack button disabled, and the Slack gate in the
  onboarding completion check is commented out in two places
- OpenSign templates not created — waiver/consent flow not testable
- Notification delivery not wired — records inserted, but no email/Slack sends

## Error message rules
Never expose raw field names to users. Write "A title is required", not
"title is required".

## Deployment
- Live at https://ethosdashboard.vercel.app
- Vercel auto-deploys from the `main` branch
- Supabase project: `fwozzqwzkeilelcibype`
