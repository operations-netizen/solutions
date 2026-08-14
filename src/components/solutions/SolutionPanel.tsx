import { ChevronRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/common/EmptyState'
import { SolutionListRow } from '@/components/solutions/SolutionListRow'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { SolutionWithMeta } from '@/types/solution'

/**
 * A titled list of solutions with a count, a "view all" link, and an empty
 * state. The dashboard and the personal queue both need exactly this, so it
 * lives here rather than being written twice.
 */
export interface SolutionPanelProps {
  title: string
  icon: LucideIcon
  viewAllTo: string
  solutions: SolutionWithMeta[]
  isLoading: boolean
  meta: 'status' | 'due' | 'updated'
  tone?: 'default' | 'danger'
  showAssignee?: boolean
  className?: string
  emptyTitle: string
  emptyDescription: string
}

export function SolutionPanel({
  title,
  icon: Icon,
  viewAllTo,
  solutions,
  isLoading,
  meta,
  tone = 'default',
  showAssignee,
  className,
  emptyTitle,
  emptyDescription,
}: SolutionPanelProps) {
  return (
    // `min-w-0` stops the grid item from being sized by its content, which is
    // what pushes the whole page into horizontal scroll on narrow screens.
    // No `self-start`: panels stretch to their grid row so the two cards in a
    // row always end level. `min-h` gives a floor so a row of two short panels
    // still has presence.
    <Card className={cn('flex min-h-[20rem] min-w-0 flex-col', className)}>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <Icon
            className={cn('h-4 w-4', tone === 'danger' ? 'text-red-500' : 'text-muted-foreground')}
          />
          {title}
          {solutions.length > 0 && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                tone === 'danger'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {solutions.length}
            </span>
          )}
        </CardTitle>

        {/* A quiet link, not a competing button — the rows are the content. */}
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="-mr-2 shrink-0 gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Link to={viewAllTo}>
            View all
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : solutions.length === 0 ? (
          <EmptyState
            icon={Icon}
            title={emptyTitle}
            description={emptyDescription}
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <div className="-mx-1.5 divide-y divide-border/70">
            {solutions.map((solution) => (
              <SolutionListRow
                key={solution.id}
                solution={solution}
                meta={meta}
                showAssignee={showAssignee}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
