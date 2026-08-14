/**
 * Identity & authorisation shapes.
 *
 * Deliberately provider-agnostic: nothing here mentions a session cookie, a
 * JWT, or an auth SDK. The CRM supplies a `CurrentUser` through
 * `SolutionsModuleProvider` and the module never asks how it was obtained.
 */

export const ROLES = ['HOBU', 'MANAGER', 'DEVELOPER', 'QA', 'APPROVER', 'VIEWER'] as const
export type Role = (typeof ROLES)[number]

/**
 * Fine-grained capabilities. Components ask "can I?" rather than
 * "is this user a HOBU?", so adding a role later is a table edit, not a
 * refactor of every screen.
 */
export const PERMISSIONS = [
  'solution:view',
  'solution:create',
  'solution:update',
  'solution:delete',
  'solution:assign',
  'solution:transition',
  'solution:approve',
  'solution:comment',
  'solution:attach',
] as const

export type Permission = (typeof PERMISSIONS)[number]

export interface User {
  id: string
  name: string
  email: string
  role: Role
  /** Job title shown in the UI, e.g. "Senior Developer". */
  title: string
  team: string
  /** Optional avatar URL; the UI falls back to initials. */
  avatarUrl?: string
}

/** The authenticated principal, as far as this module is concerned. */
export interface CurrentUser extends User {
  permissions: Permission[]
}

export interface Team {
  id: string
  name: string
}
