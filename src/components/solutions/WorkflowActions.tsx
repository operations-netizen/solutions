import { ArrowRight, CheckCircle2, Lock } from 'lucide-react'
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
import { toErrorMessage, useTransitionSolution } from '@/hooks/solutions/useSolutionMutations'
import { usePermissions } from '@/hooks/useSolutionsModule'
import type { SolutionDetail } from '@/types/solution'
import { getNextTransition, isApprovalGate, statusLabel } from '@/utils/workflow'

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
        <span>This solution is complete and read-only.</span>
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
  const transition = useTransitionSolution(solution.id)
  const [confirming, setConfirming] = useState(false)

  const next = getNextTransition(solution.status)
  const canTransition = can('solution:transition')

  if (solution.status === 'COMPLETED' || isApprovalGate(solution.status) || !next) return null

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

  return (
    <>
      <Button
        onClick={() => setConfirming(true)}
        disabled={!canTransition || transition.isPending}
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
                  {solution.solutionNumber} moves to{' '}
                  <strong className="text-foreground">{statusLabel(next.to)}</strong> and every
                  approver on the roster is asked for a decision. Any earlier decision at this gate
                  is cleared.
                </>
              ) : next.to === 'COMPLETED' ? (
                <>
                  {solution.solutionNumber} will be marked complete. Completed solutions become
                  read-only.
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
