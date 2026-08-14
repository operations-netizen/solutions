/**
 * Role → permission mapping.
 *
 * The UI never checks `role === 'HOBU'`; it checks a permission. Adding a role
 * later means adding one row to `ROLE_PERMISSIONS`.
 */

import { PERMISSIONS, type CurrentUser, type Permission, type Role, type User } from '@/types/user'

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  /** Head of Business Unit — full access, the primary role of this module. */
  HOBU: PERMISSIONS,
  MANAGER: [
    'solution:view',
    'solution:create',
    'solution:update',
    'solution:assign',
    'solution:transition',
    'solution:comment',
    'solution:attach',
  ],
  DEVELOPER: ['solution:view', 'solution:update', 'solution:transition', 'solution:comment', 'solution:attach'],
  QA: ['solution:view', 'solution:transition', 'solution:comment', 'solution:attach'],
  APPROVER: ['solution:view', 'solution:approve', 'solution:comment'],
  VIEWER: ['solution:view'],
}

export function permissionsForRole(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]]
}

/** Promote a plain `User` into an authenticated principal with capabilities. */
export function toCurrentUser(user: User, overrides?: Permission[]): CurrentUser {
  return { ...user, permissions: overrides ?? permissionsForRole(user.role) }
}

export function hasPermission(
  user: Pick<CurrentUser, 'permissions'> | null | undefined,
  permission: Permission,
): boolean {
  return !!user?.permissions.includes(permission)
}

export function hasAnyPermission(
  user: Pick<CurrentUser, 'permissions'> | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => hasPermission(user, p))
}

export const ROLE_LABELS: Record<Role, string> = {
  HOBU: 'Head of Business Unit',
  MANAGER: 'Manager',
  DEVELOPER: 'Developer',
  QA: 'QA Engineer',
  APPROVER: 'Approver',
  VIEWER: 'Viewer',
}
