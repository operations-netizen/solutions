import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useCurrentUser, useServices } from '@/hooks/useSolutionsModule'
import { notifications } from '@/services/notifications/notificationService'
import { solutionKeys } from './queryKeys'

/**
 * Solution chat.
 *
 * If the chat service exposes `subscribe`, incoming messages are pushed
 * straight into the cache. The local implementation fans out in-process; a
 * socket implementation would deliver messages from other users the same way,
 * with no change here.
 */
export function useSolutionChat(solutionId: string | undefined) {
  const { chat } = useServices()
  const currentUser = useCurrentUser()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: solutionKeys.comments(solutionId ?? 'unknown'),
    queryFn: () => chat.getSolutionComments(solutionId as string),
    enabled: Boolean(solutionId),
  })

  useEffect(() => {
    if (!solutionId || !chat.subscribe) return

    return chat.subscribe(solutionId, () => {
      void queryClient.invalidateQueries({ queryKey: solutionKeys.comments(solutionId) })
    })
  }, [chat, solutionId, queryClient])

  const sendMessage = useMutation({
    mutationFn: (message: string) =>
      chat.addSolutionComment(solutionId as string, message, { actorId: currentUser.id }),
    onSuccess: (comment) => {
      void queryClient.invalidateQueries({ queryKey: solutionKeys.comments(comment.solutionId) })
      void queryClient.invalidateQueries({ queryKey: solutionKeys.detail(comment.solutionId) })
      void queryClient.invalidateQueries({ queryKey: solutionKeys.lists() })
      notifications.emit('NEW_CHAT_MESSAGE', {
        title: 'Message sent',
        description: 'Everyone following this solution has been notified.',
        solutionId: comment.solutionId,
      })
    },
  })

  return {
    comments: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    sendMessage,
  }
}
