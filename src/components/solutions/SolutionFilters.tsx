import { ArrowDown, ArrowDownUp, ArrowUp, Check, LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUsers } from '@/hooks/useDirectory'
import { cn } from '@/lib/utils'
import {
  APPROVAL_STATUSES,
  SOLUTION_PRIORITIES,
  SOLUTION_SORT_KEYS,
  SOLUTION_STATUSES,
  type SolutionFilters as Filters,
  type SolutionSortKey,
} from '@/types/solution'
import { APPROVAL_STATUS_META, PRIORITY_META, SORT_LABELS } from '@/utils/solution'
import { STATUS_META } from '@/utils/workflow'

export type ViewMode = 'table' | 'cards'

interface SolutionFiltersProps {
  filters: Filters
  onChange: (patch: Partial<Filters>) => void
  onReset: () => void
  viewMode?: ViewMode
  onViewModeChange?: (mode: ViewMode) => void
  /** Hide the status filter where a tab strip already controls it. */
  hideStatus?: boolean
  /** Hide the assignee filter on a screen that is already scoped to one person. */
  hideAssignee?: boolean
  /** Current sort. Omit to leave the sort menu out entirely. */
  sort?: { by: SolutionSortKey; dir: 'asc' | 'desc' }
  /** Same handler the table headers use: re-picking the active key flips direction. */
  onSortChange?: (key: SolutionSortKey) => void
}

/** Which of the advanced filters are currently narrowing the list. */
function countActive(filters: Filters, hideStatus?: boolean, hideAssignee?: boolean): number {
  let count = 0
  if (!hideStatus && filters.status && filters.status !== 'ALL') count += 1
  if (filters.priority && filters.priority !== 'ALL') count += 1
  if (!hideAssignee && filters.assignedUserId && filters.assignedUserId !== 'ALL') count += 1
  if (filters.approvalStatus && filters.approvalStatus !== 'ALL') count += 1
  if (filters.dueFrom) count += 1
  if (filters.dueTo) count += 1
  return count
}

export function SolutionFilters({
  filters,
  onChange,
  onReset,
  viewMode,
  onViewModeChange,
  hideStatus,
  hideAssignee,
  sort,
  onSortChange,
}: SolutionFiltersProps) {
  const { data: users = [] } = useUsers()
  const activeCount = countActive(filters, hideStatus, hideAssignee)

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search ?? ''}
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder="Search by title, solution ID, or assigned user"
          className="pl-9 pr-9"
          aria-label="Search solutions"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => onChange({ search: '' })}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Clear search</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/*
          The table headers are not the only way to sort: `createdAt` has no
          column at all, and `updatedAt` loses its column below `2xl`. This also
          makes the current sort legible at a glance instead of implicit.
        */}
        {sort && onSortChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <ArrowDownUp className="h-4 w-4" />
                <span className="hidden whitespace-nowrap lg:inline">
                  {SORT_LABELS[sort.by]}
                </span>
                {sort.dir === 'asc' ? (
                  <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="sr-only">
                  Sorted by {SORT_LABELS[sort.by]},
                  {sort.dir === 'asc' ? ' ascending' : ' descending'}
                </span>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              {SOLUTION_SORT_KEYS.map((key) => {
                const active = sort.by === key
                return (
                  <DropdownMenuItem key={key} onClick={() => onSortChange(key)}>
                    <Check className={cn('h-4 w-4', !active && 'invisible')} />
                    <span className="flex-1">{SORT_LABELS[key]}</span>
                    {/* On the active row this arrow is also what selecting it flips. */}
                    {active &&
                      (sort.dir === 'asc' ? (
                        <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ))}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeCount > 0 && (
                <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>

          <PopoverContent align="end" className="w-80 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Filter solutions</p>
              {activeCount > 0 && (
                <Button variant="ghost" size="sm" onClick={onReset} className="h-7 px-2 text-xs">
                  Clear all
                </Button>
              )}
            </div>

            {!hideStatus && (
              <FilterRow label="Stage">
                {/* This panel only ever picks one status; a list comes from the
                    tab strip, which selects a whole phase. */}
                <Select
                  value={typeof filters.status === 'string' ? filters.status : 'ALL'}
                  onValueChange={(value) => onChange({ status: value as Filters['status'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All stages</SelectItem>
                    {SOLUTION_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {STATUS_META[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterRow>
            )}

            <FilterRow label="Priority">
              <Select
                value={filters.priority ?? 'ALL'}
                onValueChange={(value) => onChange({ priority: value as Filters['priority'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All priorities</SelectItem>
                  {SOLUTION_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {PRIORITY_META[priority].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>

            {!hideAssignee && (
              <FilterRow label="Assigned user">
                <Select
                  value={filters.assignedUserId ?? 'ALL'}
                  onValueChange={(value) => onChange({ assignedUserId: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Anyone</SelectItem>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterRow>
            )}

            <FilterRow label="Approval status">
              <Select
                value={filters.approvalStatus ?? 'ALL'}
                onValueChange={(value) =>
                  onChange({ approvalStatus: value as Filters['approvalStatus'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Any approval state</SelectItem>
                  {APPROVAL_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {APPROVAL_STATUS_META[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterRow>

            <div className="grid grid-cols-2 gap-3">
              <FilterRow label="Due from">
                <Input
                  type="date"
                  value={filters.dueFrom ?? ''}
                  onChange={(event) => onChange({ dueFrom: event.target.value || undefined })}
                />
              </FilterRow>
              <FilterRow label="Due to">
                <Input
                  type="date"
                  value={filters.dueTo ?? ''}
                  onChange={(event) => onChange({ dueTo: event.target.value || undefined })}
                />
              </FilterRow>
            </div>
          </PopoverContent>
        </Popover>

        {viewMode && onViewModeChange && (
          <div className="flex items-center rounded-md border border-input bg-card p-0.5 shadow-xs">
            <ViewToggle
              active={viewMode === 'table'}
              onClick={() => onViewModeChange('table')}
              label="Table view"
            >
              <List className="h-4 w-4" />
            </ViewToggle>
            <ViewToggle
              active={viewMode === 'cards'}
              onClick={() => onViewModeChange('cards')}
              label="Card view"
            >
              <LayoutGrid className="h-4 w-4" />
            </ViewToggle>
          </div>
        )}
      </div>
    </div>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

function ViewToggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        'rounded px-2 py-1.5 transition-colors',
        active ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}
