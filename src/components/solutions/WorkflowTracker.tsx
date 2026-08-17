import { Check, Circle, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  PIPELINE_STATUSES,
  type Approval,
  type History,
  type SolutionStatus,
} from '@/types/solution'
import { formatDateTime } from '@/utils/format'
import { isClosed, isVoid, statusIndex, STATUS_META } from '@/utils/workflow'

type StepState = 'completed' | 'current' | 'pending' | 'rejected'

interface WorkflowTrackerProps {
  status: SolutionStatus
  /** Used to mark a gate that sent the solution back. */
  approvals?: Approval[]
  /** Used to date each completed step. */
  history?: History[]
  orientation?: 'vertical' | 'horizontal'
  className?: string
}

/**
 * The workflow at a glance: what is done, what is happening now, what is left,
 * and whether anything was sent back.
 */
export function WorkflowTracker({
  status,
  approvals = [],
  history = [],
  orientation = 'vertical',
  className,
}: WorkflowTrackerProps) {
  /*
    A voided solution has no pipeline position — `statusIndex` returns -1 — so the
    furthest stage it actually reached is recovered from the history instead.
    Otherwise the tracker would claim nothing had ever started, which is wrong for
    work that was called off at, say, the Discussion gate.
  */
  const voided = isVoid(status)
  const reached = history
    .map((entry) => statusIndex(entry.toStatus ?? 'DISCUSSION'))
    .reduce((max, index) => (index > max ? index : max), -1)
  const currentIndex = voided ? reached : statusIndex(status)

  /**
   * A gate counts as rejected while the solution sits at or before it with a
   * rejection on record. Once it is approved and passed, the step reads as
   * completed and the rejection lives on in the timeline instead.
   */
  const rejectedStages = new Set(
    approvals
      .filter((a) => a.status === 'REJECTED' && statusIndex(a.stage) >= currentIndex)
      .map((a) => a.stage as SolutionStatus),
  )

  const steps = PIPELINE_STATUSES.map((step, index) => {
    let state: StepState = 'pending'
    if (rejectedStages.has(step)) state = 'rejected'
    else if (index < currentIndex) state = 'completed'
    /*
      The step a closed solution sits on is done, not in progress: arriving at
      Completed *is* the finish, and a voided solution's pipeline is not running
      either. Only live work has a current step.
    */
    else if (index === currentIndex) state = isClosed(status) ? 'completed' : 'current'

    // Most recent time the solution entered this step.
    const entered = history.filter((h) => h.toStatus === step).at(-1)

    return { step, state, enteredAt: entered?.createdAt ?? null }
  })

  if (orientation === 'horizontal') {
    return (
      <ol className={cn('flex w-full items-center', voided && 'opacity-60', className)}>
        {steps.map(({ step, state }, index) => (
          <li key={step} className={cn('flex items-center', index < steps.length - 1 && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5">
              <StepMarker state={state} size="sm" />
              <span
                className={cn(
                  'whitespace-nowrap text-[11px] font-medium',
                  state === 'current' ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {STATUS_META[step].shortLabel}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'mx-1.5 mb-5 h-0.5 flex-1 rounded-full',
                  steps[index + 1].state === 'pending' || steps[index + 1].state === 'rejected'
                    ? 'bg-border'
                    : 'bg-primary',
                )}
              />
            )}
          </li>
        ))}
      </ol>
    )
  }

  return (
    <ol className={cn('relative space-y-0', voided && 'opacity-60', className)}>
      {steps.map(({ step, state, enteredAt }, index) => {
        const isLast = index === steps.length - 1
        const meta = STATUS_META[step]

        return (
          <li key={step} className="relative flex gap-3.5 pb-5 last:pb-0">
            {!isLast && (
              <span
                className={cn(
                  'absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 rounded-full',
                  state === 'completed' ? 'bg-primary' : 'bg-border',
                )}
                aria-hidden
              />
            )}

            <StepMarker state={state} />

            <div className={cn('min-w-0 flex-1 pt-0.5', state === 'current' && '-mt-0.5')}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p
                  className={cn(
                    'text-sm',
                    state === 'current'
                      ? 'font-semibold text-foreground'
                      : state === 'pending'
                        ? 'font-medium text-muted-foreground'
                        : 'font-medium text-foreground',
                  )}
                >
                  {meta.label}
                </p>
                {state === 'current' && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    {meta.activity}
                  </span>
                )}
                {state === 'rejected' && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
                    Rejected
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {state === 'pending'
                  ? 'Not started'
                  : enteredAt
                    ? formatDateTime(enteredAt)
                    : state === 'current'
                      ? 'In progress'
                      : 'Completed'}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function StepMarker({ state, size = 'md' }: { state: StepState; size?: 'sm' | 'md' }) {
  const dimensions = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7'
  const icon = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'

  const styles: Record<StepState, string> = {
    completed: 'border-primary bg-primary text-white',
    current: 'border-primary bg-card text-primary ring-4 ring-primary/15',
    pending: 'border-border bg-card text-muted-foreground',
    rejected: 'border-red-500 bg-red-500 text-white',
  }

  return (
    <span
      className={cn(
        'relative z-10 flex shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        dimensions,
        styles[state],
      )}
    >
      {state === 'completed' && <Check className={icon} strokeWidth={3} />}
      {state === 'rejected' && <X className={icon} strokeWidth={3} />}
      {state === 'current' && <span className="h-2 w-2 rounded-full bg-primary" />}
      {state === 'pending' && <Circle className={cn(icon, 'opacity-40')} />}
    </span>
  )
}
