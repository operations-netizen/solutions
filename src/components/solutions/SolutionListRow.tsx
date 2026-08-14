import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Code2,
  FlaskConical,
  MessagesSquare,
  Rocket,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { UserAvatar } from '@/components/common/UserAvatar'
import { PriorityBadge } from '@/components/solutions/StatusBadge'
import { useUserLookup } from '@/hooks/useDirectory'
import { usePaths } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import type { SolutionStatus, SolutionWithMeta } from '@/types/solution'
import { formatDate, formatRelative } from '@/utils/format'
import { STATUS_META } from '@/utils/workflow'

/** A glyph per stage, so the row is scannable before any text is read. */
const STATUS_ICON: Record<SolutionStatus, LucideIcon> = {
  DISCUSSION: MessagesSquare,
  DISCUSSION_APPROVAL: ShieldCheck,
  DEVELOPMENT: Code2,
  TESTING: FlaskConical,
  TESTING_APPROVAL: ShieldCheck,
  EXECUTION: Rocket,
  COMPLETED: ShieldCheck,
}

interface SolutionListRowProps {
  solution: SolutionWithMeta
  /** What the trailing badge should carry. */
  meta?: 'status' | 'due' | 'updated'
  /** Show the assignee on the detail line. */
  showAssignee?: boolean
}

/**
 * Compact solution row used by the dashboard panels.
 *
 * Two lines and a single trailing badge, rather than three columns of stacked
 * content. Everything factual sits on the detail line where it reads in one
 * pass, which also means no column can shift horizontally between rows as badge
 * widths change.
 */
export function SolutionListRow({
  solution,
  meta = 'status',
  showAssignee = false,
}: SolutionListRowProps) {
  const paths = usePaths()
  const { getUser } = useUserLookup()
  const assignee = getUser(solution.assignedUserId)
  const Icon = solution.isOverdue ? AlertTriangle : STATUS_ICON[solution.status]

  return (
    <Link
      to={paths.solution(solution.id)}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition-colors',
        'hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
          solution.isOverdue
            ? 'bg-red-50 text-red-600'
            : 'bg-muted text-muted-foreground group-hover:bg-card',
        )}
        aria-hidden
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-snug text-foreground group-hover:text-primary">
          {solution.title}
        </p>

        {/* One detail line: identifier, who has it, and the relevant date. */}
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="shrink-0 font-mono">{solution.solutionNumber}</span>

          {showAssignee && assignee && (
            <>
              <Dot />
              <UserAvatar user={assignee} size="xs" />
              <span className="truncate">{assignee.name}</span>
            </>
          )}

          {!showAssignee && solution.assignedTeam && (
            <>
              <Dot />
              <span className="truncate">{solution.assignedTeam}</span>
            </>
          )}

          {meta === 'updated' && (
            <>
              <Dot />
              <span className="shrink-0 whitespace-nowrap">
                {formatRelative(solution.updatedAt)}
              </span>
            </>
          )}

          {meta === 'due' && (
            <>
              <Dot />
              <span className="shrink-0 whitespace-nowrap">
                Due {formatDate(solution.dueDate)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* A single trailing badge, vertically centred — nothing stacked. */}
      <span className="shrink-0">
        {meta === 'updated' && <PriorityBadge priority={solution.priority} />}

        {meta === 'status' && (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
              STATUS_META[solution.status].badgeClass,
            )}
          >
            {STATUS_META[solution.status].label}
          </span>
        )}

        {meta === 'due' && <DueChip solution={solution} />}
      </span>

      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground/70"
        aria-hidden
      />
    </Link>
  )
}

function Dot() {
  return <span aria-hidden>·</span>
}

/** Overdue reads red, due-soon amber, anything further out stays quiet. */
function DueChip({ solution }: { solution: SolutionWithMeta }) {
  const base =
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset'

  if (solution.isOverdue) {
    return (
      <span className={cn(base, 'bg-red-100 text-red-700 ring-red-200')}>
        <AlertTriangle className="h-3 w-3" />
        {Math.abs(solution.daysUntilDue ?? 0)}d late
      </span>
    )
  }

  if (solution.daysUntilDue !== null && solution.daysUntilDue <= 7) {
    return (
      <span className={cn(base, 'bg-amber-100 text-amber-800 ring-amber-200')}>
        <Clock className="h-3 w-3" />
        {solution.daysUntilDue === 0 ? 'Today' : `${solution.daysUntilDue}d`}
      </span>
    )
  }

  return (
    <span className={cn(base, 'bg-secondary text-muted-foreground ring-border')}>
      {formatDate(solution.dueDate)}
    </span>
  )
}
