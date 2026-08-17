import { CheckCircle2, Clock, Timer, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'

import { EmptyState } from '@/components/common/EmptyState'
import { NotificationBell } from '@/components/common/NotificationBell'
import { PageHeader } from '@/components/common/PageHeader'
import { SolutionFilters } from '@/components/solutions/SolutionFilters'
import { SolutionTable } from '@/components/solutions/SolutionTable'
import { StatCard } from '@/components/solutions/StatCard'
import { Card } from '@/components/ui/card'
import { useSolutions } from '@/hooks/solutions/useSolutions'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { SolutionFilters as Filters, SolutionSortKey } from '@/types/solution'

const EMPTY_FILTERS: Filters = {
  search: '',
  priority: 'ALL',
  assignedUserId: 'ALL',
  approvalStatus: 'ALL',
}

/**
 * Archive of delivered work. Read-only by default: the detail page already
 * refuses to edit or transition a completed solution, so nothing here needs a
 * second guard.
 */
export function CompletedSolutionsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<{ by: SolutionSortKey; dir: 'asc' | 'desc' }>({
    by: 'updatedAt',
    dir: 'desc',
  })

  const debouncedSearch = useDebouncedValue(filters.search ?? '', 250)

  const query = useMemo<Filters>(
    () => ({
      ...filters,
      search: debouncedSearch,
      status: 'COMPLETED',
      sortBy: sort.by,
      sortDir: sort.dir,
    }),
    [filters, debouncedSearch, sort],
  )

  const { data: solutions = [], isLoading } = useSolutions(query)

  const onTime = solutions.filter(
    (s) => s.completedAt !== null && s.completedAt <= s.dueDate,
  ).length
  const late = solutions.length - onTime
  /*
    Two derived figures, because a count of delivered work says nothing about how
    the delivery went. The rate is what a reader compares between months, and the
    median beats the mean here: one solution that sat open for a year would drag an
    average until it described nothing.
  */
  const onTimeRate = solutions.length === 0 ? 0 : Math.round((onTime / solutions.length) * 100)
  const cycleDays = solutions
    .filter((s) => s.completedAt !== null)
    .map((s) => (new Date(s.completedAt as string).getTime() - new Date(s.createdAt).getTime()) / 86_400_000)
    .sort((a, z) => a - z)
  const medianCycle =
    cycleDays.length === 0
      ? null
      : Math.round(
          cycleDays.length % 2 === 1
            ? cycleDays[(cycleDays.length - 1) / 2]
            : (cycleDays[cycleDays.length / 2 - 1] + cycleDays[cycleDays.length / 2]) / 2,
        )

  function handleSort(key: SolutionSortKey) {
    setSort((current) =>
      current.by === key
        ? { by: key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { by: key, dir: 'asc' },
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Completed Solutions"
        description="Delivered work, with the full history of how it got there."
        actions={<NotificationBell />}
      />

      {/*
        Four tiles rather than three, and the two new ones are the ones worth
        reading: a delivery record is judged on hit rate and how long things take,
        not on how many rows there are. Each count carries the sentence that makes
        it mean something.
      */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Delivered"
          value={solutions.length}
          icon={Trophy}
          accent="bg-emerald-100 text-emerald-600"
          isLoading={isLoading}
          note="reached the final gate"
        />
        <StatCard
          label="On time"
          value={onTimeRate}
          suffix="%"
          icon={CheckCircle2}
          accent="bg-emerald-100 text-emerald-600"
          isLoading={isLoading}
          note={`${onTime} of ${solutions.length} by the due date`}
        />
        <StatCard
          label="Median cycle time"
          value={medianCycle ?? 0}
          suffix={medianCycle === 1 ? ' day' : ' days'}
          icon={Timer}
          accent="bg-indigo-100 text-indigo-600"
          isLoading={isLoading}
          note="raised to completed"
        />
        <StatCard
          label="Closed late"
          value={late}
          icon={Clock}
          accent="bg-amber-100 text-amber-600"
          emphasis="warning"
          isLoading={isLoading}
          note={late === 0 ? 'nothing overran' : 'past the due date'}
        />
      </div>

      <SolutionFilters
        filters={filters}
        onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        onReset={() => setFilters(EMPTY_FILTERS)}
        hideStatus
        sort={sort}
        onSortChange={handleSort}
      />

      {!isLoading && solutions.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No completed solutions"
          description="Solutions appear here once they reach the end of the workflow."
        />
      ) : (
        <Card className="overflow-hidden">
          <SolutionTable
            solutions={solutions}
            isLoading={isLoading}
            variant="completed"
            sortBy={sort.by}
            sortDir={sort.dir}
            onSort={handleSort}
          />
        </Card>
      )}
    </div>
  )
}
