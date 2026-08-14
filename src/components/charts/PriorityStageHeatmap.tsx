import { Link } from 'react-router-dom'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { usePaths } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import { SOLUTION_PRIORITIES, type SolutionPriority } from '@/types/solution'
import { MATRIX_STAGES, type PriorityStageMatrix } from '@/utils/matrix'
import { PRIORITY_META } from '@/utils/solution'

/**
 * Sequential ramp, one hue, light to dark — the correct encoding for magnitude
 * on a grid. Verified with the palette validator in ordinal mode: lightness is
 * monotone, every adjacent step clears the ΔL floor, the light end clears the
 * surface at 2.91:1, and hue spread is 0°.
 *
 * Ink is paired per step so the count always clears contrast against its own
 * cell, which is also why a pale cell is never carrying the value alone.
 */
const RAMP = [
  { fill: '#818cf8', ink: '#1e1b4b' },
  { fill: '#6366f1', ink: '#1e1b4b' },
  { fill: '#4f46e5', ink: '#ffffff' },
  { fill: '#3730a3', ink: '#ffffff' },
] as const

interface PriorityStageHeatmapProps {
  matrix: PriorityStageMatrix
  className?: string
}

/** Which ramp step a count lands on, scaled to the busiest cell. */
function levelFor(count: number, peak: number): number {
  if (count === 0) return 0
  return Math.min(RAMP.length, Math.max(1, Math.ceil((count / peak) * RAMP.length)))
}

/**
 * Open work as priority against stage.
 *
 * Every cell prints its own count, so the colour only ranks the cells — no
 * value depends on judging a shade. Cells link into the filtered list.
 */
export function PriorityStageHeatmap({ matrix, className }: PriorityStageHeatmapProps) {
  const paths = usePaths()
  const { counts, rowTotals, columnTotals, peak, total } = matrix

  /*
    No early return for an empty matrix. Every cell already renders a dashed
    placeholder at zero, so the grid draws itself with the axes, the priority
    rows, and the totals all intact — an empty dashboard shows the shape of what
    is coming instead of a sentence standing in for a chart.
  */

  // Most severe first: that is the order the HOBU reads in.
  const rows = [...SOLUTION_PRIORITIES].reverse()

  return (
    <div className={cn('flex h-full flex-col justify-center gap-4', className)}>
      <TooltipProvider delayDuration={100}>
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-16" />
                {MATRIX_STAGES.map((stage) => (
                  <th
                    key={stage.key}
                    className="pb-1 text-center text-[11px] font-medium text-muted-foreground"
                  >
                    {stage.short}
                  </th>
                ))}
                <th className="pb-1 pl-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  All
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((priority) => (
                <tr key={priority}>
                  <th className="pr-1 text-left text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={cn('h-2 w-2 shrink-0 rounded-sm', PRIORITY_META[priority].dotClass)}
                        aria-hidden
                      />
                      {PRIORITY_META[priority].label}
                    </span>
                  </th>

                  {MATRIX_STAGES.map((stage) => (
                    <Cell
                      key={stage.key}
                      count={counts[priority][stage.key]}
                      peak={peak}
                      priority={priority}
                      stageLabel={stage.label}
                      to={`${paths.solutions}?tab=${
                        stage.key === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL' : stage.key
                      }`}
                    />
                  ))}

                  <td className="pl-2 text-right text-xs font-semibold tabular-nums text-foreground">
                    {rowTotals[priority]}
                  </td>
                </tr>
              ))}

              <tr>
                <th className="pr-1 pt-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  All
                </th>
                {MATRIX_STAGES.map((stage) => (
                  <td
                    key={stage.key}
                    className="pt-1 text-center text-xs font-semibold tabular-nums text-foreground"
                  >
                    {columnTotals[stage.key]}
                  </td>
                ))}
                <td className="pl-2 pt-1 text-right text-xs font-semibold tabular-nums text-foreground">
                  {total}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </TooltipProvider>

      {/* Scale legend, so the shading is readable as a quantity. */}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3.5">
        <span className="text-xs text-muted-foreground">
          {total === 0 ? 'No open solutions yet' : 'Open solutions only'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Fewer</span>
          {RAMP.map((step) => (
            <span
              key={step.fill}
              className={cn('h-2.5 w-4 rounded-sm transition-opacity', total === 0 && 'opacity-30')}
              style={{ backgroundColor: step.fill }}
              aria-hidden
            />
          ))}
          <span className="text-[11px] text-muted-foreground">More</span>
        </span>
      </div>
    </div>
  )
}

interface CellProps {
  count: number
  peak: number
  priority: SolutionPriority
  stageLabel: string
  to: string
}

function Cell({ count, peak, priority, stageLabel, to }: CellProps) {
  const level = levelFor(count, peak)
  const step = level > 0 ? RAMP[level - 1] : null

  if (count === 0) {
    return (
      <td className="p-0">
        <div className="flex h-9 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground/50">
          ·
        </div>
      </td>
    )
  }

  return (
    <td className="p-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={to}
            className="flex h-9 items-center justify-center rounded-md text-sm font-semibold tabular-nums transition-transform hover:scale-[1.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            style={{ backgroundColor: step?.fill, color: step?.ink }}
          >
            {count}
          </Link>
        </TooltipTrigger>
        <TooltipContent>
          {count} {PRIORITY_META[priority].label.toLowerCase()} solution{count === 1 ? '' : 's'} in{' '}
          {stageLabel}
        </TooltipContent>
      </Tooltip>
    </td>
  )
}
