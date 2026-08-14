import { useContext } from 'react'

// Imported from the context module, not the provider component, so hot-reloading
// the provider cannot swap the context identity out from under these hooks.
import { SolutionsModuleContext } from '@/providers/solutionsModuleContext'
import type { SolutionsServices } from '@/services/contracts'
import type { CurrentUser, Permission } from '@/types/user'
import { hasPermission } from '@/utils/permissions'

function useModuleContext() {
  const context = useContext(SolutionsModuleContext)
  if (!context) {
    throw new Error('Solutions components must be rendered inside <SolutionsModuleProvider>.')
  }
  return context
}

/** The resolved service container. The only way components reach the data layer. */
export function useServices(): SolutionsServices {
  return useModuleContext().services
}

export function useCurrentUser(): CurrentUser {
  return useModuleContext().currentUser
}

/**
 * Route builders for every screen in the module, prefixed with the mount point
 * supplied to the provider. Components never hard-code a URL.
 */
export function usePaths() {
  const { basePath } = useModuleContext()

  return {
    dashboard: `${basePath}/` || '/',
    mySolutions: `${basePath}/my-solutions`,
    solutions: `${basePath}/solutions`,
    completed: `${basePath}/completed`,
    solution: (id: string) => `${basePath}/solutions/${id}`,
  }
}

/**
 * Capability checks. Components ask `can('solution:approve')`, never
 * `user.role === 'HOBU'`, so new roles need no component changes.
 */
export function usePermissions() {
  const currentUser = useCurrentUser()

  return {
    currentUser,
    can: (permission: Permission) => hasPermission(currentUser, permission),
    canAny: (permissions: Permission[]) => permissions.some((p) => hasPermission(currentUser, p)),
  }
}
