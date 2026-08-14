import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { directoryKeys } from '@/hooks/solutions/queryKeys'
import { useServices } from '@/hooks/useSolutionsModule'
import type { User } from '@/types/user'

/** Users available as assignees and approvers. */
export function useUsers() {
  const { users } = useServices()

  return useQuery({
    queryKey: directoryKeys.users,
    queryFn: () => users.getUsers(),
    staleTime: 5 * 60_000,
  })
}

export function useTeams() {
  const { users } = useServices()

  return useQuery({
    queryKey: directoryKeys.teams,
    queryFn: () => users.getTeams(),
    staleTime: 5 * 60_000,
  })
}

/**
 * `id -> User` map plus a safe `getUser`, so components can render a name for
 * an id without doing their own lookup or crashing on an unknown id.
 */
export function useUserLookup() {
  const { data: users = [] } = useUsers()

  return useMemo(() => {
    const map = new Map(users.map((user) => [user.id, user]))
    return {
      users,
      map,
      getUser: (id: string): User | undefined => map.get(id),
      getName: (id: string): string => map.get(id)?.name ?? 'Unknown user',
    }
  }, [users])
}
