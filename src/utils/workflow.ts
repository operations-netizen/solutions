/**
 * Solution workflow state machine.
 *
 * Every status change in the application goes through `assertTransition` /
 * `canTransition`. There is no code path that assigns `solution.status`
 * directly — that is what keeps the workflow trustworthy.
 *
 *   DISCUSSION → DISCUSSION_APPROVAL → DEVELOPMENT → DEVELOPMENT_APPROVAL
 *              → TESTING → TESTING_APPROVAL → EXECUTION → EXECUTION_APPROVAL
 *              → COMPLETED
 *
 * Every working stage ends in a gate, so *Send for approval* is now the only
 * advance in the application: nothing reaches the next stage, or completion,
 * without a recorded decision.
 *
 * Passing a gate is never manual: clearing an approval advances the solution by
 * itself, so no button can push work into a stage the approvers have not signed
 * off. The two moves that no gate covers — finishing development, and delivering
 * what was approved — are the only advances a person performs.
 *
 * Rejections move backwards, each to the work that produced what was rejected:
 * DISCUSSION_APPROVAL → DISCUSSION, DEVELOPMENT_APPROVAL → DEVELOPMENT, and
 * TESTING_APPROVAL → DEVELOPMENT, since a failure found in testing is fixed by
 * the developer rather than by testing it again.
 *
 * Any live status can also be voided — the work is not feasible — and a voided
 * solution can be revoked back into any working stage with a fresh due date.
 */

import {
  PIPELINE_STATUSES,
  type ApprovalStage,
  type PipelineStatus,
  type SolutionStatus,
} from '@/types/solution'

/** How a transition was reached — approvals are gated separately from advances. */
export type TransitionKind = 'advance' | 'approve' | 'reject' | 'void' | 'revive'

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
/** Voiding is available from every live status, so it is spliced in below. */
const VOID_TRANSITION: TransitionDef = { to: 'VOID', kind: 'void', label: 'Mark not feasible' }

/**
 * Stages a voided solution can be revoked into.
 *
 * Working stages only: entering an approval gate requires a roster and clears
 * decisions, which is not something a revival should do implicitly. Revoke into
 * Discussion (the default) and send it for approval from there.
 */
export const REVIVE_TARGETS = ['DISCUSSION', 'DEVELOPMENT', 'TESTING', 'EXECUTION'] as const

export type ReviveTarget = (typeof REVIVE_TARGETS)[number]

const TRANSITIONS: Record<SolutionStatus, TransitionDef[]> = {
  DISCUSSION: [
    { to: 'DISCUSSION_APPROVAL', kind: 'advance', label: 'Send for approval' },
    VOID_TRANSITION,
  ],
  DISCUSSION_APPROVAL: [
    { to: 'DEVELOPMENT', kind: 'approve', label: 'Approve' },
    { to: 'DISCUSSION', kind: 'reject', label: 'Reject' },
    VOID_TRANSITION,
  ],
  DEVELOPMENT: [
    { to: 'DEVELOPMENT_APPROVAL', kind: 'advance', label: 'Send for approval' },
    VOID_TRANSITION,
  ],
  DEVELOPMENT_APPROVAL: [
    { to: 'TESTING', kind: 'approve', label: 'Approve' },
    { to: 'DEVELOPMENT', kind: 'reject', label: 'Reject' },
    VOID_TRANSITION,
  ],
  TESTING: [
    { to: 'TESTING_APPROVAL', kind: 'advance', label: 'Send for approval' },
    VOID_TRANSITION,
  ],
  TESTING_APPROVAL: [
    { to: 'EXECUTION', kind: 'approve', label: 'Approve' },
    { to: 'DEVELOPMENT', kind: 'reject', label: 'Reject' },
    VOID_TRANSITION,
  ],
  EXECUTION: [
    { to: 'EXECUTION_APPROVAL', kind: 'advance', label: 'Send for approval' },
    VOID_TRANSITION,
  ],
  EXECUTION_APPROVAL: [
    { to: 'COMPLETED', kind: 'approve', label: 'Approve' },
    { to: 'EXECUTION', kind: 'reject', label: 'Reject' },
    VOID_TRANSITION,
  ],
  // Delivered work is final. Voiding it would rewrite history, not cancel work.
  COMPLETED: [],
  VOID: REVIVE_TARGETS.map((to) => ({ to, kind: 'revive' as const, label: 'Revoke' })),
}

/** Statuses that represent an approval gate. */
const APPROVAL_GATE_STATUSES = new Set<SolutionStatus>([
  'DISCUSSION_APPROVAL',
  'DEVELOPMENT_APPROVAL',
  'TESTING_APPROVAL',
  'EXECUTION_APPROVAL',
])

export class WorkflowTransitionError extends Error {
  constructor(
    readonly from: SolutionStatus,
    readonly to: SolutionStatus,
  ) {
    super(
      `Invalid workflow transition: ${statusLabel(from)} → ${statusLabel(to)}. ` +
        `Allowed from ${statusLabel(from)}: ${
          getAvailableTransitions(from)
            .map((t) => statusLabel(t.to))
            .join(', ') || 'none (final state)'
        }.`,
    )
    this.name = 'WorkflowTransitionError'
  }
}

/** All transitions legally available from `status`. */
export function getAvailableTransitions(status: SolutionStatus): TransitionDef[] {
  // `?? []` for the same reason `statusLabel` falls back: a solution stored under
  // a retired status has no transitions rather than crashing the page.
  return TRANSITIONS[status] ?? []
}

/** The forward, non-approval transition from `status`, if one exists. */
export function getNextTransition(status: SolutionStatus): TransitionDef | null {
  return getAvailableTransitions(status).find((t) => t.kind === 'advance') ?? null
}

export function canTransition(from: SolutionStatus, to: SolutionStatus): boolean {
  return getAvailableTransitions(from).some((t) => t.to === to)
}

/** Throws `WorkflowTransitionError` unless `from → to` is on the allow-list. */
export function assertTransition(from: SolutionStatus, to: SolutionStatus): TransitionDef {
  const def = getAvailableTransitions(from).find((t) => t.to === to)
  if (!def) throw new WorkflowTransitionError(from, to)
  return def
}

export function isApprovalGate(status: SolutionStatus): status is ApprovalStage {
  return APPROVAL_GATE_STATUSES.has(status)
}

/** Called off as not feasible. Reversible, unlike `COMPLETED`. */
export function isVoid(status: SolutionStatus): boolean {
  return status === 'VOID'
}

/** Nothing further can be done without a revival or a new solution. */
export function isClosed(status: SolutionStatus): boolean {
  return status === 'COMPLETED' || status === 'VOID'
}

/** The status a rejection at `stage` sends the solution back to. */
const REJECTION_TARGETS: Record<ApprovalStage, SolutionStatus> = {
  DISCUSSION_APPROVAL: 'DISCUSSION',
  DEVELOPMENT_APPROVAL: 'DEVELOPMENT',
  // Not back to Testing: what failed is the build, and the fix happens in
  // development, which then has to clear its own gate again.
  TESTING_APPROVAL: 'DEVELOPMENT',
  EXECUTION_APPROVAL: 'EXECUTION',
}

export function getRejectionTarget(stage: ApprovalStage): SolutionStatus {
  return REJECTION_TARGETS[stage]
}

/**
 * The working stage a gate sits behind — Testing for Testing Approval.
 *
 * Used to say when a gate opens. Naming the gate itself there is circular ("this
 * opens when it reaches Testing Approval"), which tells a reader nothing about
 * what has to happen first.
 */
export function stageBefore(stage: ApprovalStage): SolutionStatus {
  const index = statusIndex(stage)
  return index > 0 ? PIPELINE_STATUSES[index - 1] : stage
}

/** The status an approval at `stage` advances the solution to. */
const APPROVAL_TARGETS: Record<ApprovalStage, SolutionStatus> = {
  DISCUSSION_APPROVAL: 'DEVELOPMENT',
  DEVELOPMENT_APPROVAL: 'TESTING',
  TESTING_APPROVAL: 'EXECUTION',
  EXECUTION_APPROVAL: 'COMPLETED',
}

export function getApprovalTarget(stage: ApprovalStage): SolutionStatus {
  return APPROVAL_TARGETS[stage]
}

/* ------------------------------------------------------------------ */
/* Phases                                                              */
/* ------------------------------------------------------------------ */

/**
 * The workflow has seven states but only five *phases*, because an approval gate
 * is not a phase of its own — it is the tail of the phase that just finished.
 * A solution sitting at Discussion Approval is still discussion work: nobody has
 * started building it, and it is what a stakeholder means by "in discussion".
 *
 * Counting by phase is what every summary surface uses; counting by raw status is
 * for the tracker and the state machine.
 */
export const SOLUTION_PHASES = [
  'DISCUSSION',
  'DEVELOPMENT',
  'TESTING',
  'EXECUTION',
  'COMPLETED',
  'VOID',
] as const

export type SolutionPhase = (typeof SOLUTION_PHASES)[number]

/** Every status that counts towards a phase. Exhaustive and non-overlapping. */
export const PHASE_STATUSES: Record<SolutionPhase, readonly SolutionStatus[]> = {
  DISCUSSION: ['DISCUSSION', 'DISCUSSION_APPROVAL'],
  DEVELOPMENT: ['DEVELOPMENT', 'DEVELOPMENT_APPROVAL'],
  TESTING: ['TESTING', 'TESTING_APPROVAL'],
  EXECUTION: ['EXECUTION', 'EXECUTION_APPROVAL'],
  COMPLETED: ['COMPLETED'],
  VOID: ['VOID'],
}

/** Which phase a status belongs to. Each gate folds into the work before it. */
export function phaseOf(status: SolutionStatus): SolutionPhase {
  switch (status) {
    case 'DISCUSSION':
    case 'DISCUSSION_APPROVAL':
      return 'DISCUSSION'
    case 'DEVELOPMENT':
    case 'DEVELOPMENT_APPROVAL':
      return 'DEVELOPMENT'
    case 'TESTING':
    case 'TESTING_APPROVAL':
      return 'TESTING'
    case 'EXECUTION':
    case 'EXECUTION_APPROVAL':
      return 'EXECUTION'
    case 'COMPLETED':
      return 'COMPLETED'
    case 'VOID':
      return 'VOID'
  }
}

export function isTerminal(status: SolutionStatus): boolean {
  return getAvailableTransitions(status).length === 0
}

/**
 * Zero-based position in the pipeline, and **-1 for `VOID`**, which sits outside
 * it. Callers comparing positions therefore treat a voided solution as being
 * before every stage rather than after the last one — which is what stops it
 * from looking like it has cleared every approval gate.
 */
export function statusIndex(status: SolutionStatus): number {
  return PIPELINE_STATUSES.indexOf(status as PipelineStatus)
}

/**
 * 0–100: **steps reached**, out of the steps there are.
 *
 * Counting the current step is what makes the number match what a reader sees. The
 * old formula divided by the steps *behind* you, so reaching a stage scored the
 * stage before it: a solution in Development sat at 25% having cleared Discussion
 * and its gate, and a brand-new solution read 0% despite existing, being assigned
 * and having a roster — which the doc comment already claimed it did not.
 *
 * Measured against the pipeline, not `SOLUTION_STATUSES`: counting `VOID` as a
 * step would quietly pull `COMPLETED` below 100%.
 */
export function statusProgress(status: SolutionStatus): number {
  // Void sits outside the pipeline; there is no progress through a pipeline you left.
  if (status === 'VOID') return 0
  const index = statusIndex(status)
  if (index < 0) return 0
  return Math.round(((index + 1) / PIPELINE_STATUSES.length) * 100)
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
  DEVELOPMENT_APPROVAL: {
    label: 'Development Approval',
    shortLabel: 'Approval',
    activity: 'Waiting',
    badgeClass: 'bg-amber-100 text-amber-800 ring-amber-200',
    dotClass: 'bg-amber-500',
    chartColor: '#E69F00',
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
  EXECUTION_APPROVAL: {
    label: 'Execution Approval',
    shortLabel: 'Approval',
    activity: 'Waiting',
    badgeClass: 'bg-amber-100 text-amber-800 ring-amber-200',
    dotClass: 'bg-amber-500',
    chartColor: '#E69F00',
  },
  COMPLETED: {
    label: 'Completed',
    shortLabel: 'Completed',
    activity: 'Completed',
    badgeClass: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
    dotClass: 'bg-emerald-500',
    chartColor: '#009E73',
  },
  VOID: {
    label: 'Void',
    shortLabel: 'Void',
    activity: 'Not feasible',
    // Neutral slate, not red: this is work called off, not work that failed.
    badgeClass: 'bg-slate-200 text-slate-700 ring-slate-300',
    dotClass: 'bg-slate-400',
    chartColor: '#94A3B8',
  },
}

/**
 * Tolerant of a status this build does not define.
 *
 * History keeps the status names that were current when it was written, so a
 * status retired between releases is still asked for its label. Falling back to a
 * prettified name keeps an old activity trail readable instead of crashing the
 * page on a missing meta entry.
 */
export function statusLabel(status: SolutionStatus): string {
  const meta = STATUS_META[status] as StatusMeta | undefined
  if (meta) return meta.label
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ')
}
