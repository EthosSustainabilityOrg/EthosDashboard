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

## Known remaining JWT role issue

Many API routes still use `claims.org_role_id` for authorization. JWT custom claims are not reliably populated in production, so API route handlers that perform role checks should query `users.org_role_id` from the database after verifying the token.

The following routes have been fixed to use DB role lookup:

- `POST /api/projects`
- `GET /api/projects/:id`

Routes still using JWT claims for authorization and needing DB role lookup:

- `PATCH /api/projects/:id`
- `/api/projects/:id/shifts` and `/api/projects/:id/shifts/:shift_id`
- `/api/projects/:id/roles` and `/api/projects/:id/roles/:project_role_id`
- `/api/projects/:id/publish`
- `/api/projects/:id/close`
- `/api/projects/:id/budget`
- `/api/applications` (approve, reject, reassign-role)
- `/api/tasks`
- `/api/badges/:badge_id/award`
- `/api/flags`
- `/api/files` (POST, DELETE)
- `/api/users/:id/role`
- All other API routes with `claims.org_role_id` checks

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

RLS policies still use JWT claims and should remain as-is.

## Known remaining issues

- Project delete is not implemented yet (`DELETE /api/projects/:id` does not exist)
- Wizard shift/role child POSTs need logging and response checks; failures can still be swallowed
- Notification delivery not wired (records inserted, no email/Slack sends triggered)
- OpenSign webhook header name unverified against real OpenSign docs
- `@dnd-kit` not installed (kanban drag deferred)
- `types/supabase-ssr.d.ts` shim still present (real package installed on Vercel, shim only affects local dev)

## Next priorities

1. Apply DB role fix to remaining API routes
2. Add project delete flow and `DELETE /api/projects/:id`
3. Add wizard shift/role save logging and response checks
4. Wire notification delivery (records exist, no sends)
5. Test full onboarding flow end to end
6. Test project creation wizard shifts/roles saving
7. OpenSign webhook verification (unverified header)

## Manual setup still needed

- Set `org_settings.slack_invite_link` in Supabase
- Set `org_settings.slack_announcements_channel_id` in Supabase
- Create OpenSign document templates
- Set `OPENSIGN_WAIVER_TEMPLATE_ID` env var in Vercel
- Set `OPENSIGN_CONSENT_TEMPLATE_ID` env var in Vercel
- Confirm `RESEND_FROM_ADDRESS` is correct
