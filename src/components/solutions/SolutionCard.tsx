import { CalendarDays, MessageSquare, Paperclip } from 'lucide-react'
import { Link } from 'react-router-dom'

import { UserCell } from '@/components/common/UserAvatar'
import {
  ApprovalStatusBadge,
  DueDateBadge,
  PriorityBadge,
  StatusBadge,
} from '@/components/solutions/StatusBadge'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useUserLookup } from '@/hooks/useDirectory'
import { usePaths } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import type { SolutionWithMeta } from '@/types/solution'
import { formatDate, formatRelative, truncate } from '@/utils/format'

interface SolutionCardProps {
  solution: SolutionWithMeta
  className?: string
}

/** Card presentation of a solution, used by the card view and dashboard lists. */
export function SolutionCard({ solution, className }: SolutionCardProps) {
  const paths = usePaths()
  const { getUser } = useUserLookup()
  const assignee = getUser(solution.assignedUserId)

  return (
    <Card
      className={cn(
        'group relative flex flex-col gap-4 p-5 transition-shadow hover:shadow-pop',
        solution.isOverdue && 'border-red-200',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-muted-foreground">
              {solution.solutionNumber}
            </span>
            <PriorityBadge priority={solution.priority} />
          </div>
          {/* The whole card is clickable via this stretched link. */}
          <Link
            to={paths.solution(solution.id)}
            className="block font-semibold leading-snug text-foreground after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 group-hover:text-primary"
          >
            {solution.title}
          </Link>
        </div>
      </div>

      <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
        {truncate(solution.problem, 160)}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={solution.status} />
        {solution.pendingStage && <ApprovalStatusBadge
            status={solution.approvalStatus}
            hasApprovers={solution.approvals.length > 0}
          />}
        <DueDateBadge daysUntilDue={solution.daysUntilDue} isOverdue={solution.isOverdue} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span className="font-medium text-foreground">{solution.progress}%</span>
        </div>
        <Progress
          value={solution.progress}
          indicatorClassName={solution.status === 'COMPLETED' ? 'bg-emerald-500' : undefined}
        />
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-3.5">
        <UserCell user={assignee} subtitle={solution.assignedTeam || assignee?.team} />

        <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDate(solution.dueDate)}
          </span>
          <span className="inline-flex items-center gap-3">
            {solution.commentCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                {solution.commentCount}
              </span>
            )}
            {solution.attachmentCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" />
                {solution.attachmentCount}
              </span>
            )}
            <span>{formatRelative(solution.updatedAt)}</span>
          </span>
        </div>
      </div>
    </Card>
  )
}
