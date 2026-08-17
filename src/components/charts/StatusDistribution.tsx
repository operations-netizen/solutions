import { useState } from 'react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { SolutionStatus } from '@/types/solution'
import { foldToPhases } from '@/utils/solution'
import { STATUS_META } from '@/utils/workflow'

/**
 * One class in the part-to-whole.
 *
 * The classes are the five workflow *phases*, so each approval gate is counted
 * inside the phase it is waiting in — a solution at Discussion Approval is still
 * discussion work. That keeps the classes mutually exclusive and summing to the
 * total, which a separate "Pending Approval" slice could not do once gates were
 * folded in: it would double-count. Pending approval is a flag, shown as a tile.
 */
export interface DistributionClass {
  key: string
  label: string
  count: number
  color: string
}

export function buildStatusClasses(byStatus: Record<SolutionStatus, number>): DistributionClass[] {
  const byPhase = foldToPhases(byStatus)

  return [
    {
      key: 'DISCUSSION',
      label: STATUS_META.DISCUSSION.label,
      count: byPhase.DISCUSSION,
      color: STATUS_META.DISCUSSION.chartColor,
    },
    {
      key: 'DEVELOPMENT',
      label: STATUS_META.DEVELOPMENT.label,
      count: byPhase.DEVELOPMENT,
      color: STATUS_META.DEVELOPMENT.chartColor,
    },
    {
      key: 'TESTING',
      label: STATUS_META.TESTING.label,
      count: byPhase.TESTING,
      color: STATUS_META.TESTING.chartColor,
    },
    {
      key: 'EXECUTION',
      label: STATUS_META.EXECUTION.label,
      count: byPhase.EXECUTION,
      color: STATUS_META.EXECUTION.chartColor,
    },
    {
      key: 'COMPLETED',
      label: STATUS_META.COMPLETED.label,
      count: byPhase.COMPLETED,
      color: STATUS_META.COMPLETED.chartColor,
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Donut geometry                                                      */
/* ------------------------------------------------------------------ */

const SIZE = 168
const THICKNESS = 26
const RADIUS = (SIZE - THICKNESS) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** Surface gap between slices, measured along the arc. */
const GAP = 3

interface StatusDistributionProps {
  classes: DistributionClass[]
  className?: string
}

export function StatusDistribution({ classes, className }: StatusDistributionProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  const total = classes.reduce((sum, item) => sum + (Number.isFinite(item.count) ? item.count : 0), 0)
  const present = classes.filter((item) => item.count > 0)

  const share = (count: number) => (total === 0 ? 0 : (count / total) * 100)
  const formatShare = (count: number) => `${Math.round(share(count))}%`

  // Walk the slices, accumulating how far round the ring each one starts.
  let offset = 0
  const slices = present.map((item) => {
    const length = (item.count / total) * CIRCUMFERENCE
    const slice = { ...item, length: Math.max(length - GAP, 1), start: offset }
    offset += length
    return slice
  })

  const active = hovered ? classes.find((item) => item.key === hovered) : null

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-7',
        className,
      )}
    >
      <TooltipProvider delayDuration={100}>
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            width={SIZE}
            height={SIZE}
            role="img"
            aria-label={
              total === 0
                ? 'Solution status distribution — no solutions yet'
                : `Solution status distribution across ${total} solutions`
            }
          >
            {/*
              Track ring. It sits under the slices, so it closes the hairline
              gaps rounding leaves between them — and when there is nothing to
              plot it is the whole chart, which keeps an empty dashboard showing
              the shape of the thing rather than a sentence where a chart goes.
            */}
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth={THICKNESS}
            />

            {/* Rotated so the first slice starts at twelve o'clock. */}
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {slices.map((slice) => {
                const isActive = hovered === slice.key
                const isDimmed = hovered !== null && !isActive

                return (
                  <Tooltip key={slice.key}>
                    <TooltipTrigger asChild>
                      <circle
                        cx={SIZE / 2}
                        cy={SIZE / 2}
                        r={RADIUS}
                        fill="none"
                        stroke={slice.color}
                        strokeWidth={isActive ? THICKNESS + 4 : THICKNESS}
                        strokeDasharray={`${slice.length} ${CIRCUMFERENCE - slice.length}`}
                        strokeDashoffset={-slice.start}
                        strokeLinecap="butt"
                        className="cursor-default transition-all duration-200"
                        style={{ opacity: isDimmed ? 0.35 : 1 }}
                        onMouseEnter={() => setHovered(slice.key)}
                        onMouseLeave={() => setHovered(null)}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {slice.label}: {slice.count} of {total} ({formatShare(slice.count)})
                    </TooltipContent>
                  </Tooltip>
                )
              })}
            </g>
          </svg>

          {/* Centre label: the hovered slice if there is one, otherwise the total. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-semibold leading-none tracking-tight text-foreground">
              {active ? active.count : total}
            </span>
            <span className="mt-1 max-w-[5.5rem] text-[11px] leading-tight text-muted-foreground">
              {active ? active.label : 'Total Solutions'}
            </span>
          </div>
        </div>
      </TooltipProvider>

      {/*
        The legend is also the table view: every value is readable here, so the
        donut never has to carry a number and no value is gated behind a hover.
      */}
      <ul className="w-full min-w-0 flex-1 space-y-2.5">
        {classes.map((item) => (
          <li
            key={item.key}
            className={cn(
              'flex items-center gap-3 rounded-md px-1.5 py-0.5 text-sm transition-colors',
              hovered === item.key && 'bg-muted',
            )}
            onMouseEnter={() => setHovered(item.key)}
            onMouseLeave={() => setHovered(null)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{item.label}</span>
            <span className="w-6 text-right font-medium tabular-nums text-foreground">
              {item.count}
            </span>
            <span className="w-10 text-right tabular-nums text-muted-foreground">
              {formatShare(item.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
