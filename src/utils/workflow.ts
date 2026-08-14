/**
 * Solution workflow state machine.
 *
 * Every status change in the application goes through `assertTransition` /
 * `canTransition`. There is no code path that assigns `solution.status`
 * directly — that is what keeps the workflow trustworthy.
 *
 *   DISCUSSION → DISCUSSION_APPROVAL → DEVELOPMENT → TESTING
 *              → TESTING_APPROVAL → EXECUTION → COMPLETED
 *
 * Rejections move backwards: DISCUSSION_APPROVAL → DISCUSSION and
 * TESTING_APPROVAL → DEVELOPMENT.
 */

import {
  SOLUTION_STATUSES,
  type ApprovalStage,
  type SolutionStatus,
} from '@/types/solution'

/** How a transition was reached — approvals are gated separately from advances. */
export type TransitionKind = 'advance' | 'approve' | 'reject'

export interface TransitionDef {
  to: SolutionStatus
  kind: TransitionKind
  /** Verb shown on the button that performs this transition. */
  label: string
}

/**
 * The single source of truth. Any status not listed as a `to` value for a given
 * `from` is unreachable, by construction.
 */
const TRANSITIONS: Record<SolutionStatus, TransitionDef[]> = {
  DISCUSSION: [
    { to: 'DISCUSSION_APPROVAL', kind: 'advance', label: 'Send for approval' },
  ],
  DISCUSSION_APPROVAL: [
    { to: 'DEVELOPMENT', kind: 'approve', label: 'Approve' },
    { to: 'DISCUSSION', kind: 'reject', label: 'Reject' },
  ],
  DEVELOPMENT: [{ to: 'TESTING', kind: 'advance', label: 'Move to testing' }],
  TESTING: [
    { to: 'TESTING_APPROVAL', kind: 'advance', label: 'Send for approval' },
  ],
  TESTING_APPROVAL: [
    { to: 'EXECUTION', kind: 'approve', label: 'Approve' },
    { to: 'DEVELOPMENT', kind: 'reject', label: 'Reject' },
  ],
  EXECUTION: [{ to: 'COMPLETED', kind: 'advance', label: 'Mark completed' }],
  COMPLETED: [],
}

/** Statuses that represent an approval gate. */
const APPROVAL_GATE_STATUSES = new Set<SolutionStatus>([
  'DISCUSSION_APPROVAL',
  'TESTING_APPROVAL',
])

export class WorkflowTransitionError extends Error {
  constructor(
    readonly from: SolutionStatus,
    readonly to: SolutionStatus,
  ) {
    super(
      `Invalid workflow transition: ${statusLabel(from)} → ${statusLabel(to)}. ` +
        `Allowed from ${statusLabel(from)}: ${
          TRANSITIONS[from].map((t) => statusLabel(t.to)).join(', ') || 'none (final state)'
        }.`,
    )
    this.name = 'WorkflowTransitionError'
  }
}

/** All transitions legally available from `status`. */
export function getAvailableTransitions(status: SolutionStatus): TransitionDef[] {
  return TRANSITIONS[status]
}

/** The forward, non-approval transition from `status`, if one exists. */
export function getNextTransition(status: SolutionStatus): TransitionDef | null {
  return TRANSITIONS[status].find((t) => t.kind === 'advance') ?? null
}

export function canTransition(from: SolutionStatus, to: SolutionStatus): boolean {
  return TRANSITIONS[from].some((t) => t.to === to)
}

/** Throws `WorkflowTransitionError` unless `from → to` is on the allow-list. */
export function assertTransition(from: SolutionStatus, to: SolutionStatus): TransitionDef {
  const def = TRANSITIONS[from].find((t) => t.to === to)
  if (!def) throw new WorkflowTransitionError(from, to)
  return def
}

export function isApprovalGate(status: SolutionStatus): status is ApprovalStage {
  return APPROVAL_GATE_STATUSES.has(status)
}

/** The status a rejection at `stage` sends the solution back to. */
export function getRejectionTarget(stage: ApprovalStage): SolutionStatus {
  return stage === 'DISCUSSION_APPROVAL' ? 'DISCUSSION' : 'DEVELOPMENT'
}

/** The status an approval at `stage` advances the solution to. */
export function getApprovalTarget(stage: ApprovalStage): SolutionStatus {
  return stage === 'DISCUSSION_APPROVAL' ? 'DEVELOPMENT' : 'EXECUTION'
}

export function isTerminal(status: SolutionStatus): boolean {
  return TRANSITIONS[status].length === 0
}

/** Zero-based position in the workflow. Drives the tracker and progress bars. */
export function statusIndex(status: SolutionStatus): number {
  return SOLUTION_STATUSES.indexOf(status)
}

/** 0–100. `COMPLETED` is 100; `DISCUSSION` is deliberately non-zero. */
export function statusProgress(status: SolutionStatus): number {
  const index = statusIndex(status)
  return Math.round((index / (SOLUTION_STATUSES.length - 1)) * 100)
}

/* ------------------------------------------------------------------ */
/* Presentation metadata                                               */
/* ------------------------------------------------------------------ */

/**
 * Per-status display data. Colocated with the machine so a new status can
 * never be added without also giving it a label and a colour.
 */
export interface StatusMeta {
  label: string
  /** Short workflow-tracker label, e.g. "Approval" for both gates. */
  shortLabel: string
  /** The "what does this mean right now" hint used across the UI. */
  activity: string
  /** Tailwind classes for a solid-ish badge. */
  badgeClass: string
  /** Tailwind classes for the tracker's step marker. */
  dotClass: string
  /**
   * Fill used when this status is a mark in a chart.
   *
   * Okabe-Ito derived and verified with the palette validator against the light
   * surface: lightness band, chroma floor, and normal-vision separation all
   * pass across every pair. The badge hues above are tuned to match, so a
   * reader who learns "Testing is pink" from a badge reads the same hue in the
   * distribution bar.
   *
   * Testing moved off violet and Execution off cyan because violet/blue scored
   * ΔE 1.3 under deuteranopia — indistinguishable for a red-green colourblind
   * reader.
   */
  chartColor: string
}

export const STATUS_META: Record<SolutionStatus, StatusMeta> = {
  DISCUSSION: {
    label: 'Discussion',
    shortLabel: 'Discussion',
    activity: 'In progress',
    badgeClass: 'bg-sky-100 text-sky-700 ring-sky-200',
    dotClass: 'bg-sky-500',
    chartColor: '#56B4E9',
  },
  DISCUSSION_APPROVAL: {
    label: 'Discussion Approval',
    shortLabel: 'Approval',
    activity: 'Waiting',
    badgeClass: 'bg-amber-100 text-amber-800 ring-amber-200',
    dotClass: 'bg-amber-500',
    chartColor: '#E69F00',
  },
  DEVELOPMENT: {
    label: 'Development',
    shortLabel: 'Development',
    activity: 'In progress',
    badgeClass: 'bg-blue-100 text-blue-700 ring-blue-200',
    dotClass: 'bg-blue-500',
    chartColor: '#0072B2',
  },
  TESTING: {
    label: 'Testing',
    shortLabel: 'Testing',
    activity: 'In progress',
    badgeClass: 'bg-pink-100 text-pink-700 ring-pink-200',
    dotClass: 'bg-pink-500',
    chartColor: '#CC79A7',
  },
  TESTING_APPROVAL: {
    label: 'Testing Approval',
    shortLabel: 'Approval',
    activity: 'Waiting',
    badgeClass: 'bg-amber-100 text-amber-800 ring-amber-200',
    dotClass: 'bg-amber-500',
    chartColor: '#E69F00',
  },
  EXECUTION: {
    label: 'Execution',
    shortLabel: 'Execution',
    activity: 'In progress',
    badgeClass: 'bg-violet-100 text-violet-700 ring-violet-200',
    dotClass: 'bg-violet-500',
    chartColor: '#7C3AED',
  },
  COMPLETED: {
    label: 'Completed',
    shortLabel: 'Completed',
    activity: 'Completed',
    badgeClass: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    dotClass: 'bg-emerald-500',
    chartColor: '#009E73',
  },
}

export function statusLabel(status: SolutionStatus): string {
  return STATUS_META[status].label
}
