import { ArrowRight, Ban, CheckCircle2, Lock, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { InlineSpinner } from '@/components/solutions/StatusBadge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  toErrorMessage,
  useReviveSolution,
  useTransitionSolution,
  useVoidSolution,
} from '@/hooks/solutions/useSolutionMutations'
import { useCurrentUser, usePermissions } from '@/hooks/useSolutionsModule'
import type { SolutionDetail } from '@/types/solution'
import { formatDate, toDateInputValue } from '@/utils/format'
import {
  getNextTransition,
  isApprovalGate,
  isVoid,
  REVIVE_TARGETS,
  statusLabel,
  type ReviveTarget,
} from '@/utils/workflow'

interface WorkflowActionsProps {
  solution: SolutionDetail
}

/**
 * Full-width explanation of why the workflow cannot be advanced by hand.
 * Kept separate from the button so it can sit on its own row rather than
 * squeezing the header.
 */
export function WorkflowNotice({ solution }: WorkflowActionsProps) {
  if (solution.status === 'COMPLETED') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>This solution is complete.</span>
      </div>
    )
  }

  if (isVoid(solution.status)) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-700">
        <Ban className="h-4 w-4 shrink-0" />
        <span>
          Marked not feasible, so it sits outside the pipeline. Revoking it asks for a new due date
          and puts it back to work.
        </span>
      </div>
    )
  }

  if (isApprovalGate(solution.status)) {
    const pending = solution.approvals.filter(
      (a) => a.stage === solution.status && a.status === 'PENDING',
    ).length

    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
        <Lock className="h-4 w-4 shrink-0" />
        <span>
          Waiting on {pending} approval{pending === 1 ? '' : 's'}. The workflow advances once every
          approver has signed off.
        </span>
      </div>
    )
  }

  return null
}

/**
 * The one control that advances a solution.
 *
 * It only ever offers the transition the state machine allows from the current
 * status. At an approval gate it renders nothing: the only way forward is a
 * recorded decision in the approval panel.
 */
export function WorkflowActions({ solution }: WorkflowActionsProps) {
  const { can } = usePermissions()
  const currentUser = useCurrentUser()
  const transition = useTransitionSolution(solution.id)
  const voidSolution = useVoidSolution(solution.id)
  const [confirming, setConfirming] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [reviving, setReviving] = useState(false)
  const [reason, setReason] = useState('')

  const next = getNextTransition(solution.status)

  /*
    Ownership, not just permission. Holding `solution:transition` used to be
    enough, so anyone with the role saw "Send for approval" on work that was
    nothing to do with them.

    The person the solution is assigned to may always drive it — assignment is
    what confers the right, which matters because an assignee's role may not
    include `solution:transition` at all (an APPROVER's does not). The HOBU keeps
    a blanket override so stalled work can still be moved.

    One consequence worth knowing: a VIEWER who is assigned a solution can advance
    it. Assignment is the grant, so do not assign work to a read-only account.
  */
  const isAssignee = solution.assignedUserId === currentUser.id
  const canTransition = isAssignee || can('solution:override')
  /** Matches `voidSchema`, so the dialog and the service agree on the rule. */
  const reasonValid = reason.trim().length >= 5
  /** Something typed, but not enough of it — the case worth warning about. */
  const reasonTooShort = reason.trim().length > 0 && !reasonValid

  /*
    A voided solution offers exactly one control, and it is the way back. Sitting
    outside the pipeline means there is nothing to advance to.
  */
  if (isVoid(solution.status)) {
    if (!canTransition) return null

    return (
      <>
        <Button
          variant="outline"
          onClick={() => setReviving(true)}
          className="w-full sm:w-auto"
        >
          <RotateCcw className="h-4 w-4" />
          Revoke
        </Button>

        {reviving && (
          <ReviveDialog solution={solution} onClose={() => setReviving(false)} />
        )}
      </>
    )
  }

  if (solution.status === 'COMPLETED' || !canTransition) return null

  async function markNotFeasible() {
    if (!reasonValid) return
    try {
      await voidSolution.mutateAsync({ reason })
      setVoiding(false)
      setReason('')
    } catch (error) {
      toast.error('Could not void this solution', { description: toErrorMessage(error) })
    }
  }

  /*
    Voiding stays available at an approval gate — "not feasible" is exactly the
    kind of thing a gate surfaces — so this control renders even where there is no
    forward transition to offer.
  */
  /*
    Hidden rather than disabled when the workflow is not yours to move. A greyed
    button that can never become enabled is just noise on the page — the absence
    of the control is the clearer statement.
  */
  const voidControl = !canTransition ? null : (
    <>
      <Button
        variant="outline"
        onClick={() => setVoiding(true)}
        disabled={voidSolution.isPending}
        /*
          Full-strength text: muted foreground made an available action read as
          disabled. Its destructive nature shows on hover instead, matching how
          Reject is treated in the approval panel.
        */
        className="w-full sm:w-auto hover:border-red-200 hover:bg-red-50 hover:text-red-700"
      >
        {voidSolution.isPending ? <InlineSpinner /> : <Ban className="h-4 w-4" />}
        Not feasible
      </Button>

      <AlertDialog open={voiding} onOpenChange={setVoiding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {solution.solutionNumber} not feasible?</AlertDialogTitle>
            <AlertDialogDescription>
              It leaves the pipeline and stops counting as open work. Approvals and history are
              kept, so revoking the void later resumes rather than restarts. Say why — the reason
              is recorded against the solution.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="void-reason">
              Reason
              {/* Same marker `FormLabel` renders; this dialog is not a react-hook-form. */}
              <span aria-hidden className="ml-0.5 text-destructive">
                *
              </span>
            </Label>
            <Textarea
              id="void-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="What makes this unworkable?"
              aria-invalid={reason.trim().length > 0 && !reasonValid}
            />
            {/*
              A neutral hint while the field is empty, and a warning the moment
              what is typed is too short — so the rule is stated up front and then
              flagged if it is missed, rather than only being implied by a
              disabled button.
            */}
            {reasonTooShort ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                A little more detail, please — at least 5 characters ({reason.trim().length} so
                far).
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                At least 5 characters. This is what the timeline will show.
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!reasonValid || voidSolution.isPending}
              onClick={() => void markNotFeasible()}
            >
              Mark not feasible
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  if (isApprovalGate(solution.status) || !next) return voidControl

  async function advance() {
    if (!next) return
    try {
      await transition.mutateAsync(next.to)
      setConfirming(false)
    } catch (error) {
      toast.error('Could not move this solution', { description: toErrorMessage(error) })
    }
  }

  const goingToGate = isApprovalGate(next.to)
  /** Who signs off at the gate being entered, and what they have already said. */
  const gateRoster = solution.approvals.filter((approval) => approval.stage === next.to)
  const decidedAtGate = gateRoster.filter((approval) => approval.status !== 'PENDING').length

  return (
    <>
      {voidControl}

      <Button
        onClick={() => setConfirming(true)}
        disabled={transition.isPending}
        className="w-full sm:w-auto"
      >
        {transition.isPending ? <InlineSpinner /> : <ArrowRight className="h-4 w-4" />}
        {next.label}
      </Button>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{next.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {goingToGate ? (
                <>
                  {solution.solutionNumber} goes to{' '}
                  <strong className="text-foreground">{statusLabel(next.to)}</strong>.{' '}
                  {gateRoster.length === 0
                    ? 'No approvers are on this gate yet, so it cannot be sent.'
                    : 'Every approver must sign off before it moves on.'}
                  {/*
                    Only mentioned when it is actually true: warning that earlier
                    decisions will be cleared is noise on a first send, and the
                    warning that matters is the one you have not seen before.
                  */}
                  {decidedAtGate > 0 && ' Any decision already recorded here will be cleared.'}
                </>
              ) : (
                <>
                  {solution.solutionNumber} moves from{' '}
                  <strong className="text-foreground">{statusLabel(solution.status)}</strong> to{' '}
                  <strong className="text-foreground">{statusLabel(next.to)}</strong>.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Keep the dialog open until the mutation settles.
                event.preventDefault()
                void advance()
              }}
              disabled={transition.isPending}
            >
              {transition.isPending && <InlineSpinner />}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface ReviveDialogProps {
  solution: SolutionDetail
  onClose: () => void
}

/**
 * Revoking a void asks the two questions that decide what happens next: when is
 * it due now, and which stage does it come back into.
 *
 * The stage defaults to Discussion — a solution called off as not feasible
 * usually needs re-agreeing before anyone builds it — but any working stage is
 * selectable, because work that stalled in Development often resumes there.
 */
function ReviveDialog({ solution, onClose }: ReviveDialogProps) {
  const revive = useReviveSolution(solution.id)
  const [status, setStatus] = useState<ReviveTarget>('DISCUSSION')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const today = toDateInputValue(new Date())

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!dueDate) {
      setError('A new due date is required.')
      return
    }
    if (dueDate < today) {
      setError('The new due date cannot be in the past.')
      return
    }

    try {
      // End of day, matching how the create and edit forms store a due date.
      await revive.mutateAsync({
        status,
        dueDate: new Date(`${dueDate}T23:59:59`).toISOString(),
      })
      onClose()
    } catch (cause) {
      setError(toErrorMessage(cause))
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke the void on {solution.solutionNumber}</DialogTitle>
          <DialogDescription>
            It comes back into the pipeline with a fresh deadline. The previous due date was{' '}
            <strong className="text-foreground">{formatDate(solution.dueDate)}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="revive-due">New due date</Label>
            <Input
              id="revive-due"
              type="date"
              min={today}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="revive-stage">Comes back into</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as ReviveTarget)}>
              <SelectTrigger id="revive-stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVIVE_TARGETS.map((target) => (
                  <SelectItem key={target} value={target}>
                    {statusLabel(target)}
                    {target === 'DISCUSSION' ? ' (default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Approval gates are not offered: send it for approval from its stage instead.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 ring-1 ring-inset ring-red-200"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={revive.isPending}>
              {revive.isPending && <InlineSpinner />}
              Revoke void
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
