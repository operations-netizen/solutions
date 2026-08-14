/**
 * The module's single entry point for host applications.
 *
 * Standalone:
 *   <SolutionsModuleProvider><SolutionsRoutes /></SolutionsModuleProvider>
 *
 * Inside the CRM:
 *   <SolutionsModuleProvider
 *     currentUser={crmUser}
 *     services={{ solutions: crmSolutionApi, users: crmDirectory }}
 *     notificationAdapter={crmNotificationBridge}
 *     withQueryClient={false}   // the CRM already provides one
 *   >
 *     <SolutionsRoutes />
 *   </SolutionsModuleProvider>
 *
 * Anything not supplied falls back to the local implementation, so the module
 * can be integrated a piece at a time rather than in one big bang.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  SolutionsModuleContext,
  type SolutionsModuleContextValue,
} from '@/providers/solutionsModuleContext'
import { localServices } from '@/services'
import type { SolutionsServices } from '@/services/contracts'
import { notifications } from '@/services/notifications/notificationService'
import type { NotificationAdapter } from '@/types/notification'
import type { CurrentUser } from '@/types/user'

export { SolutionsModuleContext, type SolutionsModuleContextValue }

export interface SolutionsModuleProviderProps {
  children: ReactNode
  /** Override any subset of the services; the rest stay local. */
  services?: Partial<SolutionsServices>
  /** Supply the signed-in user directly, bypassing `services.auth`. */
  currentUser?: CurrentUser
  /** Where domain notifications go. Defaults to nothing (see `AppNotifications`). */
  notificationAdapter?: NotificationAdapter
  /** Pass the host's client, or `false` if the host already renders a provider. */
  queryClient?: QueryClient
  withQueryClient?: boolean
  /** URL prefix the module is mounted under, e.g. `/crm/solutions`. */
  basePath?: string
  /** Rendered while the current user is being resolved. */
  fallback?: ReactNode
}

function createDefaultQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}

export function SolutionsModuleProvider({
  children,
  services: overrides,
  currentUser: providedUser,
  notificationAdapter,
  queryClient,
  withQueryClient = true,
  basePath = '',
  fallback = null,
}: SolutionsModuleProviderProps) {
  const services = useMemo<SolutionsServices>(
    () => ({ ...localServices, ...overrides }),
    [overrides],
  )

  const [client] = useState(() => queryClient ?? createDefaultQueryClient())
  const [resolvedUser, setResolvedUser] = useState<CurrentUser | null>(providedUser ?? null)

  useEffect(() => {
    if (providedUser) {
      setResolvedUser(providedUser)
      return
    }

    let cancelled = false
    void services.auth.getCurrentUser().then((user) => {
      if (!cancelled) setResolvedUser(user)
    })
    return () => {
      cancelled = true
    }
  }, [providedUser, services.auth])

  useEffect(() => {
    if (!notificationAdapter) return
    return notifications.register(notificationAdapter)
  }, [notificationAdapter])

  const value = useMemo<SolutionsModuleContextValue | null>(
    () =>
      resolvedUser
        ? { services, currentUser: resolvedUser, basePath: basePath.replace(/\/$/, '') }
        : null,
    [services, resolvedUser, basePath],
  )

  if (!value) return <>{fallback}</>

  const tree = (
    <SolutionsModuleContext.Provider value={value}>{children}</SolutionsModuleContext.Provider>
  )

  return withQueryClient ? <QueryClientProvider client={client}>{tree}</QueryClientProvider> : tree
}
