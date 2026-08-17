import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { useCurrentUser, usePermissions, useServices } from '@/hooks/useSolutionsModule'
import type { SolutionFilters, SolutionWithMeta } from '@/types/solution'
import { isParticipant } from '@/utils/solution'
import { solutionKeys } from './queryKeys'

/**
 * Narrows every read to what the signed-in person may see.
 *
 * `solution:viewAll` sees the register; everybody else sees the solutions they are
 * looped into. Applied here rather than in each page so a page cannot forget it,
 * and folded into the filters so the list, the counters and the tabs all agree.
 *
 * This is a UI boundary, not a security one: the API hands the whole snapshot to
 * any signed-in session, so a determined reader can still see it. Enforcing this
 * properly means filtering server-side.
 */
export function useVisibilityFilter(): Pick<SolutionFilters, 'participantId'> {
  const { can } = usePermissions()
  const currentUser = useCurrentUser()
  const all = can('solution:viewAll')

  return useMemo(
    () => (all ? {} : { participantId: currentUser.id }),
    [all, currentUser.id],
  )
}

/** Filtered, sorted solution list. Filtering happens in the service layer. */
export function useSolutions(filters: SolutionFilters = {}) {
  const { solutions } = useServices()
  const visibility = useVisibilityFilter()
  const scoped = { ...filters, ...visibility }

  return useQuery({
    queryKey: solutionKeys.list(scoped),
    queryFn: () => solutions.getSolutions(scoped),
    // Keeps the table populated while a filter change refetches, which avoids
    // a full-page spinner on every keystroke.
    placeholderData: (previous) => previous,
  })
}

/** Full detail payload: solution, approvals, history, comments, attachments. */
export function useSolution(id: string | undefined) {
  const { solutions } = useServices()

  return useQuery({
    queryKey: solutionKeys.detail(id ?? 'unknown'),
    queryFn: () => solutions.getSolution(id as string),
    enabled: Boolean(id),
  })
}

/**
 * Whether the signed-in person may read this solution: they are looped into it, or
 * they hold `solution:viewAll`. `undefined` while it is still loading, so a page
 * does not flash an access message at somebody who does have access.
 */
export function useCanViewSolution(solution: SolutionWithMeta | undefined) {
  const { can } = usePermissions()
  const currentUser = useCurrentUser()

  if (!solution) return undefined
  if (can('solution:viewAll')) return true
  return isParticipant(solution, currentUser.id)
}

/** Dashboard counters, over the same set the list would return. */
export function useSolutionStats() {
  const { solutions } = useServices()
  const visibility = useVisibilityFilter()

  return useQuery({
    queryKey: [...solutionKeys.stats(), visibility],
    queryFn: () => solutions.getStats(visibility),
  })
}

export function useSolutionHistory(id: string | undefined) {
  const { solutions } = useServices()

  return useQuery({
    queryKey: solutionKeys.history(id ?? 'unknown'),
    queryFn: () => solutions.getSolutionHistory(id as string),
    enabled: Boolean(id),
  })
}
