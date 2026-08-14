import { useQuery } from '@tanstack/react-query'

import { useServices } from '@/hooks/useSolutionsModule'
import type { SolutionFilters } from '@/types/solution'
import { solutionKeys } from './queryKeys'

/** Filtered, sorted solution list. Filtering happens in the service layer. */
export function useSolutions(filters: SolutionFilters = {}) {
  const { solutions } = useServices()

  return useQuery({
    queryKey: solutionKeys.list(filters),
    queryFn: () => solutions.getSolutions(filters),
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

/** Dashboard counters. */
export function useSolutionStats() {
  const { solutions } = useServices()

  return useQuery({
    queryKey: solutionKeys.stats(),
    queryFn: () => solutions.getStats(),
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
