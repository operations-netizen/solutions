/**
 * Priority against workflow stage, for open work.
 *
 * The donut slices the portfolio by stage and the badges slice it by priority;
 * neither can answer "is my critical work stuck at a gate?". That needs both
 * dimensions at once, which is what this cross-tab provides.
 */

import { SOLUTION_PRIORITIES, type SolutionPriority, type SolutionWithMeta } from '@/types/solution'

/** Columns of the matrix. The two approval gates are merged into one. */
export const MATRIX_STAGES = [
  { key: 'DISCUSSION', label: 'Discussion', short: 'Disc.' },
  { key: 'PENDING_APPROVAL', label: 'Pending Approval', short: 'Appr.' },
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
    PENDING_APPROVAL: 0,
    DEVELOPMENT: 0,
    TESTING: 0,
    EXECUTION: 0,
  }
}

/** Which column a solution's status belongs to, or `null` if it is completed. */
function stageKeyFor(solution: SolutionWithMeta): MatrixStageKey | null {
  switch (solution.status) {
    case 'DISCUSSION':
      return 'DISCUSSION'
    case 'DISCUSSION_APPROVAL':
    case 'TESTING_APPROVAL':
      return 'PENDING_APPROVAL'
    case 'DEVELOPMENT':
      return 'DEVELOPMENT'
    case 'TESTING':
      return 'TESTING'
    case 'EXECUTION':
      return 'EXECUTION'
    // Completed work is not load, so it has no column.
    case 'COMPLETED':
      return null
  }
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
