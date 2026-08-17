/**
 * Priority against workflow stage, for open work.
 *
 * The donut slices the portfolio by stage and the badges slice it by priority;
 * neither can answer "is my critical work stuck at a gate?". That needs both
 * dimensions at once, which is what this cross-tab provides.
 */

import { SOLUTION_PRIORITIES, type SolutionPriority, type SolutionWithMeta } from '@/types/solution'
import { phaseOf } from './workflow'

/**
 * Columns of the matrix: the four open *phases*.
 *
 * There is no separate approval column. A gate belongs to the phase it is waiting
 * inside, so a solution at Testing Approval lands under Testing — where the work
 * actually is. A shared "Appr." column used to swallow both gates, which put
 * testing work in the same cell as discussion work and disagreed with the tiles.
 */
export const MATRIX_STAGES = [
  { key: 'DISCUSSION', label: 'Discussion', short: 'Disc.' },
  { key: 'DEVELOPMENT', label: 'Development', short: 'Dev.' },
  { key: 'TESTING', label: 'Testing', short: 'Test' },
  { key: 'EXECUTION', label: 'Execution', short: 'Exec.' },
] as const

export type MatrixStageKey = (typeof MATRIX_STAGES)[number]['key']

export interface PriorityStageMatrix {
  /** `counts[priority][stage]` */
  counts: Record<SolutionPriority, Record<MatrixStageKey, number>>
  rowTotals: Record<SolutionPriority, number>
  columnTotals: Record<MatrixStageKey, number>
  /** Highest single cell, used to scale the colour ramp. */
  peak: number
  total: number
}

function emptyRow(): Record<MatrixStageKey, number> {
  return {
    DISCUSSION: 0,
    DEVELOPMENT: 0,
    TESTING: 0,
    EXECUTION: 0,
  }
}

/** Which column a solution belongs to, or `null` if it is not open work. */
function stageKeyFor(solution: SolutionWithMeta): MatrixStageKey | null {
  const phase = phaseOf(solution.status)
  // Neither delivered nor called-off work is load, so neither gets a column.
  return phase === 'COMPLETED' || phase === 'VOID' ? null : phase
}

export function computePriorityStageMatrix(solutions: SolutionWithMeta[]): PriorityStageMatrix {
  const counts = {
    LOW: emptyRow(),
    MEDIUM: emptyRow(),
    HIGH: emptyRow(),
    CRITICAL: emptyRow(),
  } satisfies Record<SolutionPriority, Record<MatrixStageKey, number>>

  let total = 0
  for (const solution of solutions) {
    const stage = stageKeyFor(solution)
    if (!stage) continue
    counts[solution.priority][stage] += 1
    total += 1
  }

  const rowTotals = {} as Record<SolutionPriority, number>
  for (const priority of SOLUTION_PRIORITIES) {
    rowTotals[priority] = MATRIX_STAGES.reduce(
      (sum, stage) => sum + counts[priority][stage.key],
      0,
    )
  }

  const columnTotals = emptyRow()
  let peak = 0
  for (const stage of MATRIX_STAGES) {
    for (const priority of SOLUTION_PRIORITIES) {
      const value = counts[priority][stage.key]
      columnTotals[stage.key] += value
      if (value > peak) peak = value
    }
  }

  return { counts, rowTotals, columnTotals, peak, total }
}
