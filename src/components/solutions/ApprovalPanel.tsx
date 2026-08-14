import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Clock, ShieldCheck, UserPlus, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { UserAvatar } from '@/components/common/UserAvatar'
import { UserSelect } from '@/components/common/UserSelect'
import { InlineSpinner } from '@/components/solutions/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import {
  toErrorMessage,
  useAddApprover,
  useApproveSolution,
  useRejectSolution,
} from '@/hooks/solutions/useSolutionMutations'
import { useUserLookup } from '@/hooks/useDirectory'
import { usePermissions } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import {
  APPROVAL_STAGES,
  type Approval,
  type ApprovalStage,
  type SolutionDetail,
} from '@/types/solution'
import { formatDateTime } from '@/utils/format'
import { rejectionSchema, type RejectionFormValues } from '@/utils/validation'
import { getRejectionTarget, statusIndex, statusLabel, STATUS_META } from '@/utils/workflow'

interface ApprovalPanelProps {
  solution: SolutionDetail
}

/**
 * Both approval gates and every recorded decision.
 *
 * A gate opens only when every approver on it has signed off; a single
 * rejection sends the solution back immediately, which is why rejecting
 * demands a reason.
 */
export function ApprovalPanel({ solution }: ApprovalPanelProps) {
  const { can } = usePermissions()
  const { getUser } = useUserLookup()
  const approve = useApproveSolution(solution.id)
  const addApprover = useAddApprover(solution.id)
  const [rejecting, setRejecting] = useState<Approval | null>(null)

  const canDecide = can('solution:approve') && solution.status !== 'COMPLETED'
  /* Managing the roster is an edit to the solution, so it rides the same
     permission as the Edit action rather than the approver's own. */
  const canManageRoster = can('solution:update') && solution.status !== 'COMPLETED'

  async function handleApprove(approval: Approval) {
    try {
      await approve.mutateAsync({ approverId: approval.approverId })
    } catch (error) {
      toast.error('Could not record the approval', { description: toErrorMessage(error) })
    }
  }

  async function handleAddApprover(stage: ApprovalStage, approverId: string) {
    try {
      await addApprover.mutateAsync({ approverId, stage })
    } catch (error) {
      toast.error('Could not add the approver', { description: toErrorMessage(error) })
    }
  }

  return (
    <div className="space-y-5">
      {APPROVAL_STAGES.map((stage) => {
        const approvals = solution.approvals.filter((a) => a.stage === stage)
        const isActive = solution.status === stage
        /* Past this gate, its roster is history: a new pending row would be a
           decision nobody could act on, and the service refuses it too. */
        const isCleared = statusIndex(solution.status) > statusIndex(stage)
        const canAddHere = canManageRoster && !isCleared

        return (
          <section key={stage} className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck
                className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')}
              />
              <h4 className="text-sm font-semibold">{STATUS_META[stage].label}</h4>
              {isActive && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Awaiting decision
                </span>
              )}
            </div>

            {approvals.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
                No approvers on this gate yet.
                {canAddHere && ' Add one below.'}
              </p>
            ) : (
            <ul
              className={cn(
                'divide-y divide-border overflow-hidden rounded-lg border border-border',
                isActive && 'border-primary/30 ring-1 ring-primary/10',
              )}
            >
              {approvals.map((approval) => {
                const approver = getUser(approval.approverId)
                const actionable = canDecide && isActive && approval.status !== 'APPROVED'

                return (
                  <li key={approval.id} className="flex flex-wrap items-start gap-3 bg-card p-3.5">
                    <UserAvatar user={approver} name={approval.approverId} size="md" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {approver?.name ?? approval.approverId}
                        </p>
                        <DecisionChip status={approval.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {approval.approvedAt
                          ? formatDateTime(approval.approvedAt)
                          : approver?.title ?? 'Awaiting decision'}
                      </p>
                      {approval.comment && (
                        <p
                          className={cn(
                            'mt-2 rounded-md px-3 py-2 text-sm',
                            approval.status === 'REJECTED'
                              ? 'bg-red-50 text-red-800'
                              : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {approval.comment}
                        </p>
                      )}
                    </div>

                    {actionable && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => void handleApprove(approval)}
                          disabled={approve.isPending}
                        >
                          {approve.isPending ? <InlineSpinner /> : <CheckCircle2 className="h-4 w-4" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          onClick={() => setRejecting(approval)}
                        >
                          <XCircle className="h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            )}

            {/*
              Each gate carries its own roster, so the picker is per-gate and
              excludes the people already on this one — not on the other.
            */}
            {canAddHere && (
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="w-full max-w-xs">
                  <UserSelect
                    value=""
                    placeholder={`Add approver to ${STATUS_META[stage].label}`}
                    excludeIds={approvals.map((approval) => approval.approverId)}
                    disabled={addApprover.isPending}
                    onChange={(approverId) => void handleAddApprover(stage, approverId)}
                  />
                </div>
              </div>
            )}

            {isActive && approvals.length > 0 && (
              <p className="text-xs text-muted-foreground">
                All approvers must sign off before this solution moves to{' '}
                {statusLabel(stage === 'DISCUSSION_APPROVAL' ? 'DEVELOPMENT' : 'EXECUTION')}.
              </p>
            )}
          </section>
        )
      })}

      {rejecting && (
        <RejectDialog
          solution={solution}
          approval={rejecting}
          onClose={() => setRejecting(null)}
        />
      )}
    </div>
  )
}

function DecisionChip({ status }: { status: Approval['status'] }) {
  const config = {
    PENDING: { label: 'Pending', className: 'bg-amber-100 text-amber-800 ring-amber-200', Icon: Clock },
    APPROVED: {
      label: 'Approved',
      className: 'bg-emerald-100 text-emerald-700 ring-emerald-200',
      Icon: CheckCircle2,
    },
    REJECTED: { label: 'Rejected', className: 'bg-red-100 text-red-700 ring-red-200', Icon: XCircle },
  }[status]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        config.className,
      )}
    >
      <config.Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}

interface RejectDialogProps {
  solution: SolutionDetail
  approval: Approval
  onClose: () => void
}

/** Rejection is destructive to the workflow, so the reason is mandatory. */
function RejectDialog({ solution, approval, onClose }: RejectDialogProps) {
  const reject = useRejectSolution(solution.id)
  const { getName } = useUserLookup()
  const target = getRejectionTarget(approval.stage)

  const form = useForm<RejectionFormValues>({
    resolver: zodResolver(rejectionSchema),
    defaultValues: { reason: '' },
  })

  async function handleSubmit(values: RejectionFormValues) {
    try {
      await reject.mutateAsync({ reason: values.reason, approverId: approval.approverId })
      onClose()
    } catch (error) {
      form.setError('reason', { message: toErrorMessage(error) })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject {solution.solutionNumber}</DialogTitle>
          <DialogDescription>
            Recording a rejection for {getName(approval.approverId)} returns this solution to{' '}
            <strong className="text-foreground">{statusLabel(target)}</strong> for rework.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Reason for rejection</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Explain what needs to change before this can be approved."
                      autoFocus
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    This is shown to the assignee and recorded on the activity timeline.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={reject.isPending}>
                {reject.isPending && <InlineSpinner />}
                Reject solution
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
