import { AlertTriangle, ClipboardList, FileQuestion, PenLine, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'

import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader } from '@/components/common/PageHeader'
import { SolutionFilters } from '@/components/solutions/SolutionFilters'
import { SolutionTable } from '@/components/solutions/SolutionTable'
import { StatCard } from '@/components/solutions/StatCard'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSolutions } from '@/hooks/solutions/useSolutions'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useCurrentUser } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import type { SolutionFilters as Filters, SolutionSortKey, SolutionWithMeta } from '@/types/solution'
import { awaitsApprovalFrom } from '@/utils/solution'

const EMPTY_FILTERS: Filters = {
  search: '',
  priority: 'ALL',
  approvalStatus: 'ALL',
  dueFrom: undefined,
  dueTo: undefined,
}

/**
 * The scopes this screen offers, each a different kind of personal stake.
 *
 * They are predicates rather than service filters because none of them is
 * expressible in `SolutionFilters` — "mine" is not a field on a solution. Each
 * one runs over the same fetched list, so switching tabs costs no request.
 */
const SCOPES = [
  // Plain "All" rather than "Everything of mine": the page title already says
  // whose these are, and the Tracker's strip opens with "All" too.
  { key: 'ALL', label: 'All' },
  { key: 'ASSIGNED', label: 'Assigned to me' },
  { key: 'RAISED', label: 'Raised by me' },
  { key: 'APPROVAL', label: 'Awaiting my approval' },
  { key: 'OVERDUE', label: 'Overdue' },
] as const

type ScopeKey = (typeof SCOPES)[number]['key']

function matchesScope(
  solution: SolutionWithMeta,
  scope: ScopeKey,
  userId: string,
): boolean {
  const assigned = solution.assignedUserId === userId
  const raised = solution.createdBy === userId
  const toApprove = awaitsApprovalFrom(solution, userId)

  switch (scope) {
    case 'ASSIGNED':
      return assigned
    case 'RAISED':
      return raised
    case 'APPROVAL':
      return toApprove
    case 'OVERDUE':
      return (assigned || raised || toApprove) && solution.isOverdue
    case 'ALL':
      return assigned || raised || toApprove
  }
}

/**
 * The signed-in person's own register: the same table the Tracker uses, scoped
 * to what they own, are assigned, or must sign off.
 *
 * "Mine" spans three kinds of stake because one screen has to serve a developer
 * who only holds assignments, an approver who only holds decisions, and the
 * HOBU, who raises the work and chases everyone else for it.
 */
export function MySolutionsPage() {
  const currentUser = useCurrentUser()
  const [scope, setScope] = useState<ScopeKey>('ALL')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  /*
    Recency, not deadline. Sorting by due date puts long-closed work at the top,
    because a solution completed in July still has the earliest date on the page.
    Use the Due date sort from the toolbar to ask the deadline question.
  */
  const [sort, setSort] = useState<{ by: SolutionSortKey; dir: 'asc' | 'desc' }>({
    by: 'updatedAt',
    dir: 'desc',
  })

  const debouncedSearch = useDebouncedValue(filters.search ?? '', 250)

  /*
    Search, priority, and date filters go to the service; the personal scoping is
    applied on top. One query serves every tab, which is what keeps the counts
    live without five more round trips.
  */
  const query = useMemo<Filters>(
    () => ({ ...filters, search: debouncedSearch, sortBy: sort.by, sortDir: sort.dir }),
    [filters, debouncedSearch, sort],
  )

  const { data: solutions = [], isLoading, isFetching } = useSolutions(query)

  const scoped = useMemo(
    () => solutions.filter((solution) => matchesScope(solution, scope, currentUser.id)),
    [solutions, scope, currentUser.id],
  )

  const counts = useMemo(() => {
    const entries = SCOPES.map(
      ({ key }) =>
        [key, solutions.filter((s) => matchesScope(s, key, currentUser.id)).length] as const,
    )
    return Object.fromEntries(entries) as Record<ScopeKey, number>
  }, [solutions, currentUser.id])

  function handleSort(key: SolutionSortKey) {
    setSort((current) =>
      current.by === key
        ? { by: key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { by: key, dir: 'asc' },
    )
  }

  const hasNarrowing =
    Boolean(filters.search) ||
    (filters.priority && filters.priority !== 'ALL') ||
    (filters.approvalStatus && filters.approvalStatus !== 'ALL') ||
    Boolean(filters.dueFrom) ||
    Boolean(filters.dueTo)

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Solutions"
        description="Everything you own, are assigned, or have to sign off — in one list."
      />

      {/*
        The tiles double as the tab counts' headline: each one names a scope the
        strip below can switch to, so a number that looks wrong is one click from
        the rows behind it.
      */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Awaiting your approval"
          value={counts.APPROVAL}
          icon={ShieldCheck}
          accent="bg-amber-100 text-amber-700"
          emphasis="warning"
          isLoading={isLoading}
        />
        <StatCard
          label="Assigned to you"
          value={counts.ASSIGNED}
          icon={ClipboardList}
          isLoading={isLoading}
        />
        <StatCard label="Raised by you" value={counts.RAISED} icon={PenLine} isLoading={isLoading} />
        <StatCard
          label="Your overdue"
          value={counts.OVERDUE}
          icon={AlertTriangle}
          accent="bg-red-100 text-red-600"
          emphasis="danger"
          isLoading={isLoading}
        />
      </div>

      <Tabs value={scope} onValueChange={(next) => setScope(next as ScopeKey)}>
        <TabsList className="w-full justify-start overflow-x-auto sm:w-auto">
          {SCOPES.map((item) => (
            <TabsTrigger key={item.key} value={item.key} className="gap-1.5">
              {item.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                  scope === item.key ? 'bg-primary/10 text-primary' : 'bg-background/60',
                )}
              >
                {counts[item.key]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <SolutionFilters
        filters={filters}
        onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        onReset={() => setFilters(EMPTY_FILTERS)}
        hideStatus
        // Every row here is already scoped to one person by the tab strip.
        hideAssignee
        sort={sort}
        onSortChange={handleSort}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {isLoading
            ? 'Loading solutions...'
            : `${scoped.length} solution${scoped.length === 1 ? '' : 's'}`}
          {isFetching && !isLoading && ' · updating'}
        </span>
      </div>

      {!isLoading && scoped.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title={EMPTY_TITLES[scope]}
          description={
            hasNarrowing
              ? 'Try clearing the search or filters to widen the results.'
              : EMPTY_DESCRIPTIONS[scope]
          }
        />
      ) : (
        <Card>
          <SolutionTable
            solutions={scoped}
            isLoading={isLoading}
            sortBy={sort.by}
            sortDir={sort.dir}
            onSort={handleSort}
          />
        </Card>
      )}
    </div>
  )
}

const EMPTY_TITLES: Record<ScopeKey, string> = {
  ALL: 'Nothing is yours yet',
  ASSIGNED: 'Nothing assigned to you',
  RAISED: 'You have not raised any solutions',
  APPROVAL: 'No approvals waiting on you',
  OVERDUE: 'Nothing of yours is overdue',
}

const EMPTY_DESCRIPTIONS: Record<ScopeKey, string> = {
  ALL: 'Solutions you raise, are assigned, or must approve will collect here.',
  ASSIGNED: 'No active solution is currently in your name.',
  RAISED: 'Anything you create is tracked here from Discussion onwards.',
  APPROVAL: 'Nothing is sitting at a gate where you are the approver.',
  OVERDUE: 'Every solution of yours is inside its due date.',
}
