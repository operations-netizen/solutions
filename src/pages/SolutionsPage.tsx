import { FileQuestion, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { SolutionCard } from '@/components/solutions/SolutionCard'
import { SolutionFilters, type ViewMode } from '@/components/solutions/SolutionFilters'
import { CreateSolutionDialog } from '@/components/solutions/SolutionFormDialog'
import { SolutionTable } from '@/components/solutions/SolutionTable'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSolutions, useSolutionStats } from '@/hooks/solutions/useSolutions'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { usePermissions } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import type { SolutionFilters as Filters, SolutionSortKey } from '@/types/solution'
import { STATUS_TABS, type StatusTabKey } from '@/utils/solution'

/**
 * Translate a tab into service filters. Tabs are a shortcut over the same
 * filter model the advanced panel uses, not a parallel mechanism.
 */
function tabFilters(tab: StatusTabKey): Pick<Filters, 'status' | 'bucket'> {
  switch (tab) {
    case 'ALL':
      return { status: 'ALL', bucket: 'ALL' }
    case 'PENDING_APPROVAL':
      return { status: 'ALL', bucket: 'PENDING_APPROVAL' }
    default:
      return { status: tab, bucket: 'ALL' }
  }
}

const EMPTY_FILTERS: Filters = {
  search: '',
  priority: 'ALL',
  assignedUserId: 'ALL',
  approvalStatus: 'ALL',
  dueFrom: undefined,
  dueTo: undefined,
}

export function SolutionsPage() {
  const { can } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('table')

  // The dashboard deep-links into this page via `?tab=` and `?overdue=`.
  const tab = (searchParams.get('tab') as StatusTabKey | null) ?? 'ALL'
  const overdueOnly = searchParams.get('overdue') === '1'

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<{ by: SolutionSortKey; dir: 'asc' | 'desc' }>({
    by: 'updatedAt',
    dir: 'desc',
  })

  const debouncedSearch = useDebouncedValue(filters.search ?? '', 250)

  const query = useMemo<Filters>(() => {
    const base = { ...filters, ...tabFilters(tab), search: debouncedSearch }
    // "Overdue" is a stronger constraint than the tab's own bucket.
    if (overdueOnly) base.bucket = 'OVERDUE'
    return { ...base, sortBy: sort.by, sortDir: sort.dir }
  }, [filters, tab, debouncedSearch, overdueOnly, sort])

  const { data: solutions = [], isLoading, isFetching } = useSolutions(query)
  const { data: stats } = useSolutionStats()

  const tabCounts: Record<StatusTabKey, number | undefined> = {
    ALL: stats?.total,
    DISCUSSION: stats?.byStatus.DISCUSSION,
    PENDING_APPROVAL: stats?.pendingApproval,
    DEVELOPMENT: stats?.byStatus.DEVELOPMENT,
    TESTING: stats?.byStatus.TESTING,
    EXECUTION: stats?.byStatus.EXECUTION,
    COMPLETED: stats?.completed,
  }

  function changeTab(next: string) {
    const params = new URLSearchParams(searchParams)
    if (next === 'ALL') params.delete('tab')
    else params.set('tab', next)
    // Switching tabs clears the dashboard's overdue deep-link.
    params.delete('overdue')
    setSearchParams(params, { replace: true })
  }

  function handleSort(key: SolutionSortKey) {
    setSort((current) =>
      current.by === key
        ? { by: key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { by: key, dir: 'asc' },
    )
  }

  const hasActiveNarrowing =
    Boolean(filters.search) ||
    overdueOnly ||
    tab !== 'ALL' ||
    (filters.priority && filters.priority !== 'ALL') ||
    (filters.assignedUserId && filters.assignedUserId !== 'ALL') ||
    (filters.approvalStatus && filters.approvalStatus !== 'ALL') ||
    Boolean(filters.dueFrom) ||
    Boolean(filters.dueTo)

  function resetEverything() {
    setFilters(EMPTY_FILTERS)
    setSearchParams(new URLSearchParams(), { replace: true })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Solution Tracker"
        description="Every solution in the business unit, at every stage from discussion to completion."
        actions={
          can('solution:create') && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Solution
            </Button>
          )
        }
      />

      {overdueOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          <span>Showing overdue solutions only.</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-red-800 hover:bg-red-100"
            onClick={() => changeTab(tab)}
          >
            Clear
          </Button>
        </div>
      )}

      <Tabs value={tab} onValueChange={changeTab}>
        {/* Hugs its tabs on desktop rather than stretching a half-empty strip
            across the page; still full-width and scrollable on small screens. */}
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          {STATUS_TABS.map((item) => (
            <TabsTrigger key={item.key} value={item.key} className="gap-1.5">
              {item.label}
              {tabCounts[item.key] !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                    tab === item.key ? 'bg-primary/10 text-primary' : 'bg-background/60',
                  )}
                >
                  {tabCounts[item.key]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <SolutionFilters
        filters={filters}
        onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        onReset={() => setFilters(EMPTY_FILTERS)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        hideStatus
        sort={sort}
        onSortChange={handleSort}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {isLoading ? 'Loading solutions...' : `${solutions.length} solution${solutions.length === 1 ? '' : 's'}`}
          {isFetching && !isLoading && ' · updating'}
        </span>
      </div>

      {isLoading ? (
        viewMode === 'table' ? (
          <Card>
            <SolutionTable solutions={[]} isLoading />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        )
      ) : solutions.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="No solutions match this view"
          description={
            hasActiveNarrowing
              ? 'Try clearing the search, filters, or tab to widen the results.'
              : 'Create the first solution to get started.'
          }
          action={
            hasActiveNarrowing ? (
              <Button variant="outline" onClick={resetEverything}>
                Clear filters
              </Button>
            ) : (
              can('solution:create') && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add Solution
                </Button>
              )
            )
          }
        />
      ) : viewMode === 'table' ? (
        <Card className="overflow-hidden">
          <SolutionTable
            solutions={solutions}
            sortBy={sort.by}
            sortDir={sort.dir}
            onSort={handleSort}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {solutions.map((solution) => (
            <SolutionCard key={solution.id} solution={solution} />
          ))}
        </div>
      )}

      <CreateSolutionDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
