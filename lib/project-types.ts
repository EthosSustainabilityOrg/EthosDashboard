/**
 * lib/project-types.ts
 * Shared checks on project_type_id.
 */

/**
 * HQ project types are 10 to 16. An HQ project must be a member's only active project
 * (02_roles_and_permissions.md), enforced at submission in POST /api/applications and
 * again at approval in PATCH /api/applications/:id/approve.
 */
export function isHqProjectType(projectTypeId: number): boolean {
  return projectTypeId >= 10 && projectTypeId <= 16;
}
