import type { SolutionFilters } from '@/types/solution'

/** Centralised cache keys so invalidation is never a guessing game. */
export const solutionKeys = {
  all: ['solutions'] as const,
  lists: () => [...solutionKeys.all, 'list'] as const,
  list: (filters: SolutionFilters) => [...solutionKeys.lists(), filters] as const,
  details: () => [...solutionKeys.all, 'detail'] as const,
  detail: (id: string) => [...solutionKeys.details(), id] as const,
  stats: () => [...solutionKeys.all, 'stats'] as const,
  comments: (id: string) => [...solutionKeys.detail(id), 'comments'] as const,
  history: (id: string) => [...solutionKeys.detail(id), 'history'] as const,
}

export const directoryKeys = {
  users: ['directory', 'users'] as const,
  teams: ['directory', 'teams'] as const,
}
