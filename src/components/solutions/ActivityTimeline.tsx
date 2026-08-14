import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Flag,
  MessageSquare,
  Paperclip,
  PenLine,
  PlusCircle,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import type { History, HistoryAction } from '@/types/solution'
import { formatDate, formatTime } from '@/utils/format'
import { useUserLookup } from '@/hooks/useDirectory'

interface ActivityTimelineProps {
  history: History[]
  /** Newest first by default; the detail page reads better that way. */
  order?: 'newest' | 'oldest'
  className?: string
}

const ACTION_META: Record<HistoryAction, { icon: LucideIcon; className: string }> = {
  CREATED: { icon: PlusCircle, className: 'bg-primary/10 text-primary' },
  UPDATED: { icon: PenLine, className: 'bg-slate-100 text-slate-600' },
  ASSIGNED: { icon: Users, className: 'bg-sky-100 text-sky-700' },
  DUE_DATE_CHANGED: { icon: CalendarClock, className: 'bg-amber-100 text-amber-700' },
  PRIORITY_CHANGED: { icon: Flag, className: 'bg-orange-100 text-orange-700' },
  APPROVER_ADDED: { icon: UserPlus, className: 'bg-violet-100 text-violet-700' },
  APPROVAL_REQUESTED: { icon: Send, className: 'bg-amber-100 text-amber-700' },
  APPROVED: { icon: ShieldCheck, className: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { icon: XCircle, className: 'bg-red-100 text-red-700' },
  STATUS_CHANGED: { icon: ArrowRight, className: 'bg-blue-100 text-blue-700' },
  COMMENT_ADDED: { icon: MessageSquare, className: 'bg-slate-100 text-slate-600' },
  ATTACHMENT_UPLOADED: { icon: Paperclip, className: 'bg-slate-100 text-slate-600' },
  COMPLETED: { icon: CheckCircle2, className: 'bg-emerald-100 text-emerald-700' },
}

/** Complete audit trail for a solution. */
export function ActivityTimeline({ history, order = 'newest', className }: ActivityTimelineProps) {
  const { getName } = useUserLookup()

  const entries = [...history].sort((a, b) =>
    order === 'newest'
      ? b.createdAt.localeCompare(a.createdAt)
      : a.createdAt.localeCompare(b.createdAt),
  )

  if (entries.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
  }

  return (
    /*
      The trail only ever grows — every transition, decision, comment, and upload
      lands here — so it scrolls inside a fixed frame rather than pushing the rest
      of the page down. `className` lands on the frame so a consumer can raise or
      drop the cap; `overscroll-contain` stops a wheel gesture at the end of the
      log from scrolling the page behind it.
    */
    <div className={cn('max-h-[28rem] overflow-y-auto overscroll-contain pr-1', className)}>
      <ol className="relative space-y-0">
        {entries.map((entry, index) => {
            const meta = ACTION_META[entry.action]
            const isLast = index === entries.length - 1
            const previous = entries[index - 1]
            const showDate = !previous || formatDate(previous.createdAt) !== formatDate(entry.createdAt)

            return (
              <li key={entry.id}>
                {showDate && (
                  <p
                    className={cn(
                      'pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground',
                      index > 0 && 'pt-3',
                    )}
                  >
                    {formatDate(entry.createdAt)}
                  </p>
                )}

                <div className="relative flex gap-3 pb-4">
                  {!isLast && (
                    <span
                      className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-border"
                      aria-hidden
                    />
                  )}

                  <span
                    className={cn(
                      'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      meta.className,
                    )}
                  >
                    <meta.icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1 pt-1">
                    <p className="text-sm leading-snug text-foreground">{entry.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {getName(entry.performedBy)} · {formatTime(entry.createdAt)}
                    </p>
                  </div>
                </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
