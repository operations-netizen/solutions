import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { UserCell } from '@/components/common/UserAvatar'
import {
  ApprovalStatusBadge,
  DueDateBadge,
  PriorityBadge,
  StatusBadge,
} from '@/components/solutions/StatusBadge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useUserLookup } from '@/hooks/useDirectory'
import { usePaths } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import type { SolutionSortKey, SolutionWithMeta } from '@/types/solution'
import { formatDate, formatRelativeShort } from '@/utils/format'

interface SolutionTableProps {
  solutions: SolutionWithMeta[]
  isLoading?: boolean
  sortBy?: SolutionSortKey
  sortDir?: 'asc' | 'desc'
  onSort?: (key: SolutionSortKey) => void
  /** Completed view hides progress and shows completion date instead. */
  variant?: 'default' | 'completed'
}

export function SolutionTable({
  solutions,
  isLoading,
  sortBy,
  sortDir,
  onSort,
  variant = 'default',
}: SolutionTableProps) {
  const navigate = useNavigate()
  const paths = usePaths()
  const { getUser } = useUserLookup()

  function SortableHead({
    label,
    sortKey,
    className,
  }: {
    label: string
    sortKey: SolutionSortKey
    className?: string
  }) {
    if (!onSort) return <TableHead className={className}>{label}</TableHead>

    const active = sortBy === sortKey
    /*
      Direction is only meaningful for the column actually being sorted, so that
      one gets a real up/down arrow in the accent colour. The rest show a faint
      neutral hint that firms up on hover — enough to say "this is sortable"
      without nine arrows competing with the data.
    */
    const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
    return (
      <TableHead className={className}>
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={cn(
            'group/sort inline-flex items-center gap-1 uppercase tracking-wide transition-colors',
            active ? 'text-primary' : 'hover:text-foreground',
          )}
        >
          {label}
          <Icon
            className={cn(
              'h-3 w-3 transition-opacity',
              active ? 'opacity-100' : 'opacity-30 group-hover/sort:opacity-70',
            )}
          />
          {active && (
            <span className="sr-only">sorted {sortDir === 'asc' ? 'ascending' : 'descending'}</span>
          )}
        </button>
      </TableHead>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <SortableHead label="ID" sortKey="solutionNumber" />
          <SortableHead label="Solution" sortKey="title" />
          <TableHead>Assigned</TableHead>
          <SortableHead label="Priority" sortKey="priority" />
          <SortableHead label="Due date" sortKey="dueDate" />
          {variant === 'completed' ? (
            <TableHead>Completed</TableHead>
          ) : (
            <TableHead>Status</TableHead>
          )}
          <TableHead>{variant === 'completed' ? 'Outcome' : 'Approval'}</TableHead>
          {/*
            Least critical column: it gives up first when width is tight. The
            threshold is `2xl`, not `xl`, because the navigation rail takes 240px
            off the viewport — at `xl` the remaining space is ~1170px, which the
            other seven columns already fill.
          */}
          <SortableHead
            label="Updated"
            sortKey="updatedAt"
            className="hidden 2xl:table-cell"
          />
          <TableHead className="w-8" />
        </TableRow>
      </TableHeader>

      <TableBody>
        {solutions.map((solution) => {
          const assignee = getUser(solution.assignedUserId)
          const completedLate =
            solution.completedAt !== null && solution.completedAt > solution.dueDate

          return (
            <TableRow
              key={solution.id}
              onClick={() => navigate(paths.solution(solution.id))}
              className="group cursor-pointer"
            >
              <TableCell className="whitespace-nowrap font-mono text-xs font-semibold text-muted-foreground">
                {solution.solutionNumber}
              </TableCell>

              <TableCell className="max-w-[22rem]">
                <p className="truncate font-medium text-foreground">{solution.title}</p>
                {variant === 'default' && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Progress
                      value={solution.progress}
                      className="h-1 w-24"
                      indicatorClassName={
                        solution.status === 'COMPLETED' ? 'bg-emerald-500' : undefined
                      }
                    />
                    <span className="text-[11px] text-muted-foreground">{solution.progress}%</span>
                  </div>
                )}
              </TableCell>

              <TableCell>
                <UserCell user={assignee} subtitle={solution.assignedTeam || assignee?.team} />
              </TableCell>

              <TableCell>
                <PriorityBadge priority={solution.priority} />
              </TableCell>

              <TableCell>
                <div className="space-y-1">
                  <p className="whitespace-nowrap text-sm text-foreground">
                    {formatDate(solution.dueDate)}
                  </p>
                  <DueDateBadge
                    daysUntilDue={solution.daysUntilDue}
                    isOverdue={solution.isOverdue}
                  />
                </div>
              </TableCell>

              {variant === 'completed' ? (
                <TableCell className="whitespace-nowrap text-sm">
                  {formatDate(solution.completedAt)}
                </TableCell>
              ) : (
                <TableCell>
                  <StatusBadge status={solution.status} />
                </TableCell>
              )}

              <TableCell>
                {variant === 'completed' ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                      completedLate
                        ? 'bg-amber-100 text-amber-800 ring-amber-200'
                        : 'bg-emerald-100 text-emerald-700 ring-emerald-200',
                    )}
                  >
                    {completedLate ? 'Closed late' : 'On time'}
                  </span>
                ) : (
                  <ApprovalStatusBadge status={solution.approvalStatus} />
                )}
              </TableCell>

              <TableCell className="hidden whitespace-nowrap text-sm text-muted-foreground 2xl:table-cell">
                {formatRelativeShort(solution.updatedAt)}
              </TableCell>

              {/*
                A chevron on all 25 rows at once is noise, and a button-sized one
                cost a 64px column. It is a hover affordance now: the whole row is
                the click target anyway.
              */}
              <TableCell className="w-8 px-2">
                <ChevronRight
                  className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden
                />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
