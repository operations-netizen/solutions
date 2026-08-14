import { AlertTriangle, CheckCircle2, Circle, Clock, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { ApprovalStatus, SolutionPriority, SolutionStatus } from '@/types/solution'
import { APPROVAL_STATUS_META, PRIORITY_META } from '@/utils/solution'
import { STATUS_META } from '@/utils/workflow'

const BASE =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset'

interface StatusBadgeProps {
  status: SolutionStatus
  /** Append the plain-language activity ("In progress", "Waiting"). */
  showActivity?: boolean
  className?: string
}

/** The canonical way a workflow status is rendered. */
export function StatusBadge({ status, showActivity, className }: StatusBadgeProps) {
  const meta = STATUS_META[status]

  return (
    <span className={cn(BASE, meta.badgeClass, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClass)} aria-hidden />
      {meta.label}
      {showActivity && <span className="opacity-70">- {meta.activity}</span>}
    </span>
  )
}

interface PriorityBadgeProps {
  priority: SolutionPriority
  className?: string
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const meta = PRIORITY_META[priority]

  return (
    <span className={cn(BASE, meta.badgeClass, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClass)} aria-hidden />
      {meta.label}
    </span>
  )
}

interface ApprovalStatusBadgeProps {
  status: ApprovalStatus
  className?: string
}

const APPROVAL_ICON = {
  NOT_REQUIRED: Circle,
  PENDING: Clock,
  APPROVED: CheckCircle2,
  REJECTED: AlertTriangle,
} as const

export function ApprovalStatusBadge({ status, className }: ApprovalStatusBadgeProps) {
  const meta = APPROVAL_STATUS_META[status]
  const Icon = APPROVAL_ICON[status]

  return (
    <span className={cn(BASE, meta.badgeClass, className)}>
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  )
}

interface DueDateBadgeProps {
  /** Days until due; negative means overdue. `null` renders nothing. */
  daysUntilDue: number | null
  isOverdue: boolean
  className?: string
}

/**
 * Only shown when the date needs attention. A due date three weeks out is
 * information, not a signal, and gets no badge.
 */
export function DueDateBadge({ daysUntilDue, isOverdue, className }: DueDateBadgeProps) {
  if (daysUntilDue === null) return null

  if (isOverdue) {
    return (
      <span className={cn(BASE, 'bg-red-100 text-red-700 ring-red-200', className)}>
        <AlertTriangle className="h-3 w-3" />
        Overdue by {Math.abs(daysUntilDue)}d
      </span>
    )
  }

  if (daysUntilDue <= 7) {
    return (
      <span className={cn(BASE, 'bg-amber-100 text-amber-800 ring-amber-200', className)}>
        <Clock className="h-3 w-3" />
        {daysUntilDue === 0 ? 'Due today' : `Due in ${daysUntilDue}d`}
      </span>
    )
  }

  return null
}

/** Small spinner used inside buttons during a mutation. */
export function InlineSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
}
