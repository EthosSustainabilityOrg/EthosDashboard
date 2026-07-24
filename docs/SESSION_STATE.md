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

## Deployment status

- App is live at `https://ethosdashboard.vercel.app`
- Google OAuth working
- Supabase connected
- JWT hook working (`custom_access_token_hook` registered)
- Auth callback route working

## Confirmed working

- Login with Google
- Home page with metrics, name, chapter
- Sidebar navigation
- Account page with sign out

## Known remaining issues

- Board Panel not showing (`org_role_id` not `3` in JWT for current user - needs fresh login after fixing user record in Supabase)
- Notification delivery not wired
- OpenSign webhook header unverified
- `@dnd-kit` not installed (kanban drag deferred)
- `types/supabase-ssr.d.ts` shim still present (real package installed on Vercel, shim only affects local dev)

## Manual setup still needed

- Set `org_settings.slack_invite_link` in Supabase
- Set `org_settings.slack_announcements_channel_id` in Supabase
- Create OpenSign document templates
- Set `OPENSIGN_WAIVER_TEMPLATE_ID` env var in Vercel
- Set `OPENSIGN_CONSENT_TEMPLATE_ID` env var in Vercel
- Confirm `RESEND_FROM_ADDRESS` is correct
