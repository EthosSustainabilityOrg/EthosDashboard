# Ethos App — API Spec

## Conventions

### Base URL
All API routes are Next.js API routes under `/api/`.
Supabase client handles direct database queries where no business logic is needed.
Next.js API routes are used for:
- Operations requiring the service role key
- Business logic (limit enforcement, multi-step operations)
- Third-party integration triggers (Slack, OpenSign, Resend)

### Authentication
Every protected endpoint requires a valid Supabase JWT in the Authorization header:
```
Authorization: Bearer <supabase_jwt_token>
```
Unauthenticated requests to protected endpoints return `401 Unauthorized`.

### Response format
All responses return JSON.
Success:
```json
{ "data": { ... }, "error": null }
```
Error:
```json
{ "data": null, "error": { "code": "ERROR_CODE", "message": "Human readable message" } }
```

### Error codes used throughout
| Code | Meaning |
|---|---|
| UNAUTHORIZED | No valid JWT provided |
| FORBIDDEN | Valid JWT but insufficient permissions |
| NOT_FOUND | Resource does not exist or not visible to requester |
| VALIDATION_ERROR | Request body failed validation |
| LIMIT_REACHED | A business rule limit was hit (e.g. 3 active projects) |
| CONFLICT | Duplicate or conflicting record |
| INTEGRATION_ERROR | Third-party service call failed |

---

## Auth Endpoints

### POST /api/auth/link-ethos-email
Link an Ethos Google Workspace email to an existing user account.
**Auth:** Required. Board only.
**Request body:**
```json
{
  "user_id": "uuid",
  "ethos_email": "jordan@ethossustainability.org"
}
```
**Response:**
```json
{
  "data": {
    "user_id": "uuid",
    "ethos_email": "jordan@ethossustainability.org",
    "active_login_email": "jordan@ethossustainability.org"
  },
  "error": null
}
```
**Logic:**
- Inserts new row in user_auth with is_active = true
- Sets ethos_email and active_login_email on users record
- Previous personal Gmail auth row remains (is_active = false)
**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND (user_id), CONFLICT (email already linked)

---

## User Endpoints

### GET /api/users/me
Get the current authenticated user's full profile.
**Auth:** Required.
**Response:**
```json
{
  "data": {
    "user_id": "uuid",
    "first_name": "Jordan",
    "last_name": "Torres",
    "personal_email": "jordan@gmail.com",
    "ethos_email": "jordan@ethossustainability.org",
    "active_login_email": "jordan@ethossustainability.org",
    "slack_user_id": "U12345678",
    "guardian_name": "Maria Torres",
    "guardian_email": "maria@gmail.com",
    "guardian_phone": "555-0100",
    "org_role_id": 1,
    "org_role_name": "Member",
    "chapter_id": "uuid",
    "chapter_name": "Ethos Denton",
    "onboarding_complete": true,
    "created_at": "2025-04-01T10:00:00Z"
  },
  "error": null
}
```
**Errors:** UNAUTHORIZED

---

### PATCH /api/users/me
Update current user's own editable fields.
**Auth:** Required.
**Request body (all fields optional):**
```json
{
  "first_name": "Jordan",
  "last_name": "Torres",
  "guardian_name": "Maria Torres",
  "guardian_email": "maria@gmail.com",
  "guardian_phone": "555-0100"
}
```
**Response:** Updated user object (same shape as GET /api/users/me)
**Errors:** UNAUTHORIZED, VALIDATION_ERROR

---

### GET /api/users/:user_id
Get a member's public directory profile.
**Auth:** Required.
**Scope:** Non-Board users can only fetch members in their own chapter.
**Response:**
```json
{
  "data": {
    "user_id": "uuid",
    "first_name": "Jordan",
    "last_name": "Torres",
    "org_role_name": "Member",
    "chapter_name": "Ethos Denton",
    "bio": "I care about local waterways.",
    "badges": [
      {
        "badge_id": "uuid",
        "name": "Creek Cleanup '25",
        "badge_category": "Participation",
        "image_url": "https://...",
        "awarded_at": "2025-05-01T00:00:00Z"
      }
    ],
    "project_history": [
      {
        "project_id": "uuid",
        "project_name": "Denton Creek Cleanup",
        "chapter_name": "Ethos Denton",
        "type_name": "Event",
        "approved_at": "2025-04-01T00:00:00Z"
      }
    ]
  },
  "error": null
}
```
**Errors:** UNAUTHORIZED, FORBIDDEN (outside chapter), NOT_FOUND

---

### PATCH /api/users/:user_id/role
Change a member's org role. Board only.
**Auth:** Required. Board only.
**Request body:**
```json
{ "org_role_id": 2 }
```
**Response:** Updated user object
**Logic:**
- Board cannot demote another Board member (org_role_id = 3) via this endpoint
- Sends notification to affected user (in-app + email + Slack)
- Logs to system_logs
**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, CONFLICT (demoting Board)

---

### GET /api/users/directory
Get paginated list of members for the directory.
**Auth:** Required.
**Query params:**
- `search` — string, searches first_name + last_name
- `role` — integer (1, 2, or 3), filter by org_role_id
- `chapter_id` — uuid, Board only
- `page` — integer, default 1
- `per_page` — integer, default 20, max 50
**Scope:** Non-Board returns only own chapter members.
**Response:**
```json
{
  "data": {
    "members": [ { ...user objects... } ],
    "total": 48,
    "page": 1,
    "per_page": 20
  },
  "error": null
}
```
**Errors:** UNAUTHORIZED, FORBIDDEN (chapter_id filter for non-Board)

---

## Chapter Endpoints

### GET /api/chapters
Get all chapters.
**Auth:** Required.
**Response:**
```json
{
  "data": {
    "chapters": [
      {
        "chapter_id": "uuid",
        "name": "Ethos Denton",
        "is_hq": false,
        "location": "Denton, TX"
      }
    ]
  },
  "error": null
}
```
**Errors:** UNAUTHORIZED

---

## Project Endpoints

### GET /api/projects
Get projects visible to the current user.
**Auth:** Optional (unauthenticated returns only published projects for pre-login board).
**Query params:**
- `chapter_id` — uuid, filter by chapter
- `type_id` — integer, filter by project type
- `is_open_call` — boolean
- `search` — string
- `page` — integer, default 1
- `per_page` — integer, default 20
**Scope:**
- Unauthenticated: published projects scoped to detected location
- Member: own chapter + open calls from nearby chapters + HQ open calls
- Project Lead: same as member + own unpublished drafts
- Board: all projects across all chapters
**Response:**
```json
{
  "data": {
    "projects": [
      {
        "project_id": "uuid",
        "name": "Denton Creek Cleanup",
        "type_name": "Event",
        "chapter_name": "Ethos Denton",
        "is_hq": false,
        "description": "...",
        "is_virtual": false,
        "location": "Creekside Park, Denton TX",
        "is_open_call": true,
        "open_call_app_level": "Full App",
        "max_applications": 15,
        "spots_remaining": 6,
        "is_published": true,
        "requested_budget": 500.00,
        "allocated_budget": 400.00,
        "slack_channel_id": "C12345678",
        "upcoming_shift": {
          "shift_id": "uuid",
          "start_datetime": "2025-04-30T08:00:00Z",
          "end_datetime": "2025-04-30T12:00:00Z"
        },
        "created_at": "2025-03-01T00:00:00Z"
      }
    ],
    "total": 12,
    "page": 1,
    "per_page": 20
  },
  "error": null
}
```
**Errors:** UNAUTHORIZED (for auth-required filters)

---

### GET /api/projects/:project_id
Get full detail for a single project.
**Auth:** Required.
**Response:** Full project object including all shifts, all project_roles, team roster (approved applications), and file references.
```json
{
  "data": {
    "project_id": "uuid",
    "name": "Denton Creek Cleanup",
    "type_name": "Event",
    "chapter_name": "Ethos Denton",
    "description": "...",
    "is_virtual": false,
    "location": "Creekside Park",
    "is_open_call": true,
    "open_call_app_level": "Full App",
    "max_applications": 15,
    "spots_remaining": 6,
    "is_published": true,
    "requested_budget": 500.00,
    "allocated_budget": 400.00,
    "slack_channel_id": "C12345678",
    "shifts": [
      {
        "shift_id": "uuid",
        "start_datetime": "2025-04-30T08:00:00Z",
        "end_datetime": "2025-04-30T12:00:00Z",
        "location": null,
        "capacity": 15,
        "notes": null
      }
    ],
    "project_roles": [
      {
        "project_role_id": "uuid",
        "role_name": "Site Lead",
        "description": "Oversees cleanup area.",
        "capacity": 2
      }
    ],
    "team": [
      {
        "user_id": "uuid",
        "first_name": "Jordan",
        "last_name": "Torres",
        "project_role_name": "Site Lead",
        "is_lead": false
      }
    ],
    "files": [ { ...file objects... } ],
    "created_at": "2025-03-01T00:00:00Z"
  },
  "error": null
}
```
**Errors:** UNAUTHORIZED, NOT_FOUND, FORBIDDEN (outside scope)

---

### POST /api/projects
Create a new project (draft).
**Auth:** Required. Project Lead or Board.
**Request body:**
```json
{
  "name": "Denton Creek Cleanup",
  "project_type_id": 1,
  "chapter_id": "uuid",
  "hq_team_category": null,
  "description": "A community cleanup event.",
  "is_virtual": false,
  "location": "Creekside Park, Denton TX",
  "requested_budget": 500.00,
  "max_applications": 15,
  "is_open_call": true,
  "open_call_app_level": "Full App"
}
```
**Response:** Created project object with project_id
**Logic:**
- Sets is_published = false on creation
- created_by = current user
- chapter_id must match Lead's chapter (Board can set any)
**Errors:** UNAUTHORIZED, FORBIDDEN, VALIDATION_ERROR

---

### PATCH /api/projects/:project_id
Update an existing project.
**Auth:** Required. Project Lead (own) or Board (any).
**Request body:** Any subset of editable fields (description, location, requested_budget, max_applications, is_open_call, open_call_app_level, is_virtual)
**Response:** Updated project object
**Logic:**
- project_name, project_type_id, chapter_id cannot be changed post-creation
- If requested_budget changes: Board notified
**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR

---

### POST /api/projects/:project_id/publish
Publish a draft project.
**Auth:** Required. Project Lead (own) or Board (any).
**Request body:** none
**Response:** Updated project object with is_published = true
**Logic:**
- Validates: at least 1 shift, at least 1 role, name and description present
- Sets is_published = true
- Creates Slack channel via Slack API — stores channel ID in slack_channel_id
- Notifies Board via in-app + Slack (new project published)
- If requested_budget present: notifies Board to review budget request
**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR (missing required fields), INTEGRATION_ERROR (Slack channel creation failed — project still publishes, slack_channel_id set to null, Board notified via system_log)

---

### POST /api/projects/:project_id/close
Close a project.
**Auth:** Required. Project Lead (own) or Board (any).
**Request body:** none
**Response:** Updated project object
**Logic:**
- Sets is_published = false, is_open_call = false
- Closed projects cannot be reopened — enforced here
- All pending applications automatically rejected (status = Rejected, no reason set)
- Pending applicants notified
**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT (already closed)

---

### DELETE /api/projects/:project_id
Permanently delete a project that carries no history.
**Auth:** Required. Project Lead (own) or Board (any). Same rule as close.
**Request body:** none
**Response:** `{ "project_id": "<uuid>", "deleted": true }`
**Logic:**
- Refuses unless the project has **zero** rows in all of: `applications`, `tasks`,
  `project_updates`, `files`, `badges`, `volunteer_flags`. Shifts and project_roles are
  configuration rather than history, so they may exist and cascade.
- Refuses a project that is already closed. A closed project is the preserved record
  and deleting it would discard what closing deliberately kept.
- On refusal, the message names the blocking reason and directs the caller to close.

**Why conditional rather than a plain delete:** the FK graph makes an unconditional
delete destructive in ways that are invisible from the call site. `applications`,
`tasks`, `shifts`, `project_roles`, `project_updates` and `files` are all
`ON DELETE CASCADE`, so one delete erases every application, all assigned work, every
shift signup and every posted update. `badges` is `ON DELETE SET NULL`, so an awarded
badge survives but stops recording what it was earned for. Every member of this platform
is a minor, and those rows are the participation record the org would need if a parent,
a school or an auditor asked. Separately, `volunteer_flags.project_id` (migration 025)
declares no `ON DELETE` clause, so it defaults to NO ACTION: a flagged project cannot be
deleted at all and an unguarded route would surface Postgres error 23503 as a 500.

The intended use is a Lead who created a project by mistake and wants it gone before
anyone engaged with it. Everything else is closed, not deleted.

**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT (project has history, or is
already closed), VALIDATION_ERROR

---

## Shift Endpoints

### POST /api/projects/:project_id/shifts
Add a shift to a project.
**Auth:** Required. Project Lead (own) or Board.
**Request body:**
```json
{
  "start_datetime": "2025-04-30T08:00:00Z",
  "end_datetime": "2025-04-30T12:00:00Z",
  "location": null,
  "capacity": 15,
  "notes": null
}
```
**Response:** Created shift object
**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR

---

### PATCH /api/projects/:project_id/shifts/:shift_id
Update a shift.
**Auth:** Required. Project Lead (own) or Board.
**Request body:** Any subset of shift fields
**Logic:** Cannot edit shifts with start_datetime in the past
**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, CONFLICT (shift already passed)

---

### DELETE /api/projects/:project_id/shifts/:shift_id
Remove a shift.
**Auth:** Required. Project Lead (own) or Board.
**Logic:**
- If approved volunteers exist on this project: warning returned in response (still deletes — Lead confirms client-side)
- Cannot delete last shift on a published project
**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT (last shift on published project)

---

## Project Role Endpoints

### POST /api/projects/:project_id/roles
Add a role to a project.
**Auth:** Required. Project Lead (own) or Board.
**Request body:**
```json
{
  "role_name": "Site Lead",
  "description": "Oversees cleanup area.",
  "capacity": 2
}
```
**Response:** Created project_role object
**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR

---

### PATCH /api/projects/:project_id/roles/:project_role_id
Update a project role.
**Auth:** Required. Project Lead (own) or Board.
**Request body:** Any subset (role_name, description — capacity only if no approved volunteers assigned)
**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, CONFLICT (capacity reduction blocked if volunteers assigned)

---

### DELETE /api/projects/:project_id/roles/:project_role_id
Remove a project role.
**Auth:** Required. Project Lead (own) or Board.
**Logic:** Cannot delete if volunteers are assigned to this role
**Errors:** UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT (volunteers assigned)
