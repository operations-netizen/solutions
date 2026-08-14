import { CheckCircle2, Clock, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'

import { EmptyState } from '@/components/common/EmptyState'
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
        description="Delivered work, kept as a read-only record with its full workflow history."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Completed solutions"
          value={solutions.length}
          icon={Trophy}
          accent="bg-emerald-100 text-emerald-600"
          isLoading={isLoading}
        />
        <StatCard
          label="Closed on time"
          value={onTime}
          icon={CheckCircle2}
          accent="bg-emerald-100 text-emerald-600"
          isLoading={isLoading}
        />
        <StatCard
          label="Closed after due date"
          value={late}
          icon={Clock}
          accent="bg-amber-100 text-amber-600"
          emphasis="warning"
          isLoading={isLoading}
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
