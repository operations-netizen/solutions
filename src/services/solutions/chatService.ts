/**
 * Solution-scoped chat.
 *
 * Split from `solutionService` on purpose: chat is the part most likely to
 * become a live transport. A Socket.IO or WebSocket implementation only has to
 * satisfy this interface, and `subscribe` is where the live feed plugs in.
 */

import type { ActorContext, ChatService } from '@/services/contracts'
import { db } from '@/services/db'
import type { Comment } from '@/types/solution'
import { createId } from '@/utils/id'

/**
 * In-process fan-out so multiple mounted components see a new message
 * immediately. A real implementation replaces this with the socket's own
 * subscription.
 */
const listeners = new Map<string, Set<(comment: Comment) => void>>()

function emit(solutionId: string, comment: Comment): void {
  listeners.get(solutionId)?.forEach((listener) => {
    listener(comment)
  })
}

export const chatService: ChatService = {
  async getSolutionComments(solutionId: string): Promise<Comment[]> {
    const comments = await db.list('comments')
    return comments
      .filter((c) => c.solutionId === solutionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async addSolutionComment(
    solutionId: string,
    message: string,
    ctx: ActorContext,
  ): Promise<Comment> {
    const trimmed = message.trim()
    if (!trimmed) throw new Error('Message cannot be empty.')

    const comment = await db.transact((draft) => {
      const solution = draft.solutions.find((s) => s.id === solutionId)
      if (!solution) throw new Error(`Solution ${solutionId} was not found.`)

      const record: Comment = {
        id: createId('cmt'),
        solutionId,
        userId: ctx.actorId,
        message: trimmed,
        createdAt: new Date().toISOString(),
      }
      draft.comments.push(record)

      // A comment counts as activity on the solution.
      draft.history.push({
        id: createId('his'),
        solutionId,
        action: 'COMMENT_ADDED',
        fromStatus: null,
        toStatus: null,
        description: 'Comment added to the solution discussion',
        performedBy: ctx.actorId,
        createdAt: record.createdAt,
      })
      solution.updatedAt = record.createdAt

      return record
    })

    emit(solutionId, comment)
    return comment
  },

  subscribe(solutionId: string, onMessage: (comment: Comment) => void): () => void {
    const set = listeners.get(solutionId) ?? new Set()
    set.add(onMessage)
    listeners.set(solutionId, set)

    return () => {
      set.delete(onMessage)
      if (set.size === 0) listeners.delete(solutionId)
    }
  },
}
