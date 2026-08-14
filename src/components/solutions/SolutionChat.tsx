import { MessageSquare, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { UserAvatar } from '@/components/common/UserAvatar'
import { InlineSpinner } from '@/components/solutions/StatusBadge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useSolutionChat } from '@/hooks/solutions/useSolutionChat'
import { toErrorMessage } from '@/hooks/solutions/useSolutionMutations'
import { useUserLookup } from '@/hooks/useDirectory'
import { useCurrentUser, usePermissions } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import { formatDate, formatTime } from '@/utils/format'

interface SolutionChatProps {
  solutionId: string
  /** Completed solutions are read-only. */
  readOnly?: boolean
}

/** Solution-scoped discussion thread. */
export function SolutionChat({ solutionId, readOnly }: SolutionChatProps) {
  const { comments, isLoading, sendMessage } = useSolutionChat(solutionId)
  const { getUser } = useUserLookup()
  const currentUser = useCurrentUser()
  const { can } = usePermissions()
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const canPost = can('solution:comment') && !readOnly

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [comments.length])

  async function submit() {
    const message = draft.trim()
    if (!message) return

    try {
      await sendMessage.mutateAsync(message)
      setDraft('')
    } catch (error) {
      toast.error('Message not sent', { description: toErrorMessage(error) })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-1 py-1">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        )}

        {!isLoading && comments.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Use this thread to keep discussion about this solution in one place.
            </p>
          </div>
        )}

        {comments.map((comment, index) => {
          const author = getUser(comment.userId)
          const isMine = comment.userId === currentUser.id
          const previous = comments[index - 1]
          const showDate =
            !previous || formatDate(previous.createdAt) !== formatDate(comment.createdAt)

          return (
            <div key={comment.id} className="space-y-4">
              {showDate && (
                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {formatDate(comment.createdAt)}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              )}

              <div className={cn('flex gap-2.5', isMine && 'flex-row-reverse')}>
                <UserAvatar user={author} name={comment.userId} size="sm" className="mt-0.5" />
                <div className={cn('max-w-[85%] space-y-1', isMine && 'items-end text-right')}>
                  <div
                    className={cn(
                      'flex items-baseline gap-2',
                      isMine && 'flex-row-reverse',
                    )}
                  >
                    <span className="text-xs font-semibold text-foreground">
                      {isMine ? 'You' : (author?.name ?? comment.userId)}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatTime(comment.createdAt)}
                    </span>
                  </div>
                  <p
                    className={cn(
                      'inline-block whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm leading-relaxed',
                      isMine
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground',
                    )}
                  >
                    {comment.message}
                  </p>
                </div>
              </div>
            </div>
          )
        })}

        <div ref={endRef} />
      </div>

      {canPost ? (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter adds a line.
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submit()
                }
              }}
              placeholder="Write a message..."
              rows={2}
              className="min-h-[44px] resize-none"
            />
            <Button
              onClick={() => void submit()}
              disabled={!draft.trim() || sendMessage.isPending}
              size="icon"
              className="h-[44px] w-11 shrink-0"
            >
              {sendMessage.isPending ? <InlineSpinner /> : <Send className="h-4 w-4" />}
              <span className="sr-only">Send</span>
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Press Enter to send, Shift + Enter for a new line.
          </p>
        </div>
      ) : (
        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
          {readOnly
            ? 'This solution is completed. The discussion is kept as a read-only record.'
            : 'You do not have permission to post in this discussion.'}
        </p>
      )}
    </div>
  )
}
