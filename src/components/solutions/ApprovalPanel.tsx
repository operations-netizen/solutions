import { zodResolver } from '@hookform/resolvers/zod'
import {
  Check,
  CheckCircle2,
  Clock,
  Repeat,
  ShieldCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react'
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
  useRemoveApprover,
  useReplaceApprover,
} from '@/hooks/solutions/useSolutionMutations'
import { useUserLookup } from '@/hooks/useDirectory'
import { useCurrentUser, usePermissions } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import {
  APPROVAL_STAGES,
  type ApprovalStage,
  type Approval,
  type SolutionDetail,
} from '@/types/solution'
import { formatDateTime } from '@/utils/format'
import { rejectionSchema, type RejectionFormValues } from '@/utils/validation'
import {
  getApprovalTarget,
  getRejectionTarget,
  stageBefore,
  isVoid,
  statusIndex,
  statusLabel,
  STATUS_META,
} from '@/utils/workflow'

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
  const currentUser = useCurrentUser()
  const { getUser } = useUserLookup()
  const approve = useApproveSolution(solution.id)
  const addApprover = useAddApprover(solution.id)
  const removeApprover = useRemoveApprover(solution.id)
  const replaceApprover = useReplaceApprover(solution.id)
  /** Whose seat is being handed over, if any. */
  const [replacing, setReplacing] = useState<string | null>(null)
  const [rejecting, setRejecting] = useState<Approval | null>(null)

  /*
    Being on the roster is what authorises a decision — not the role.

    This used to check `can('solution:approve')`, which had it backwards in both
    directions: someone put on a gate could not sign off unless their role
    happened to include the permission (a QA Lead added as an approver was stuck),
    while any APPROVER could sign off on *somebody else's* row. Whoever the HOBU
    puts on a gate is the person that gate is waiting for.

    Signing on another person's behalf stays an override, since it puts a name to
    a decision its owner did not make. The history entry records both the
    approver and the actor.
  */
  const isOpen = solution.status !== 'COMPLETED' && !isVoid(solution.status)
  const canDecideFor = (approval: Approval) =>
    isOpen && (approval.approverId === currentUser.id || can('solution:override'))
  /*
    Managing the roster is an edit to the solution, so it rides the same permission
    as the Edit action rather than the approver's own — and only while the solution
    is live. The service refuses roster changes on a void solution too, so offering
    the control there would just be a button that errors.
  */
  const canManageRoster = can('solution:update') && isOpen
  /*
    Adding somebody to one gate and not the others contradicts the shared roster,
    so it is the HOBU's exception rather than a general feature — the same
    permission that lets them drive somebody else's workflow.
  */
  const canAddPerGate = canManageRoster && can('solution:override')

  async function handleApprove(approval: Approval) {
    try {
      await approve.mutateAsync({ approverId: approval.approverId })
    } catch (error) {
      toast.error('Could not record the approval', { description: toErrorMessage(error) })
    }
  }

  async function handleAddApprover(approverId: string, stage?: ApprovalStage) {
    try {
      await addApprover.mutateAsync({ approverId, stage })
    } catch (error) {
      toast.error('Could not add the approver', { description: toErrorMessage(error) })
    }
  }

  async function handleRemoveApprover(approverId: string) {
    try {
      await removeApprover.mutateAsync({ approverId })
    } catch (error) {
      toast.error('Could not remove the approver', { description: toErrorMessage(error) })
    }
  }

  async function handleReplaceApprover(fromApproverId: string, toApproverId: string) {
    try {
      await replaceApprover.mutateAsync({ fromApproverId, toApproverId })
      setReplacing(null)
    } catch (error) {
      toast.error('Could not change the approver', { description: toErrorMessage(error) })
    }
  }

  /*
    The roster is the solution's, not the gate's: the same people sign off
    everywhere, so it is edited once, here, rather than four times below. The
    union is what is displayed — somebody whose later rows were dropped after they
    had already decided still belongs on the list.
  */
  const roster = Array.from(new Set(solution.approvals.map((approval) => approval.approverId)))
  /**
   * Who still owes a decision. Only these people can be removed or replaced —
   * somebody whose rows are all decided has left the roster already, and their
   * approvals are history that no button should offer to touch.
   */
  const owes = (approverId: string) =>
    solution.approvals.some(
      (approval) => approval.approverId === approverId && approval.status === 'PENDING',
    )
  const active = roster.filter(owes)
  const past = roster.filter((approverId) => !owes(approverId))

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-lg border border-border bg-muted/30 p-3.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Approvers</h4>
          <span className="text-xs text-muted-foreground">
            {isOpen ? 'The same people sign off at every gate' : 'Every gate on this solution is closed'}
          </span>
        </div>

        {active.length === 0 ? (
          /*
            Only a live solution can be blocked by an empty roster. On a completed
            one there is no next gate to pass, and on a void one the pipeline is not
            running — saying it "cannot pass" there states a problem that does not
            exist, when the list of who signed off already tells the story.
          */
          isOpen ? (
            <p className="text-sm text-muted-foreground">
              Nobody is waiting to sign off, so this solution cannot pass its next gate.
            </p>
          ) : null
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {active.map((approverId) => {
              const approver = getUser(approverId)
              const name = approver?.name ?? approverId

              return (
                <li
                  key={approverId}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card py-0.5 pl-1 pr-1 text-xs font-medium"
                >
                  <UserAvatar user={approver} name={approverId} size="xs" />
                  {name}
                  {canManageRoster && (
                    <span className="flex items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-5 w-5 rounded-full"
                        disabled={replaceApprover.isPending}
                        onClick={() => setReplacing(replacing === approverId ? null : approverId)}
                        title={`Hand ${name}'s remaining gates to somebody else`}
                      >
                        <Repeat className="h-3 w-3" />
                        <span className="sr-only">Change {name}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="h-5 w-5 rounded-full hover:bg-red-50 hover:text-red-700"
                        disabled={removeApprover.isPending}
                        onClick={() => void handleRemoveApprover(approverId)}
                        title={`Remove ${name} from the gates still to come`}
                      >
                        <X className="h-3 w-3" />
                        <span className="sr-only">Remove {name}</span>
                      </Button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/*
          Kept visible but inert: their decisions are part of this solution's
          record, and a remove button here could only ever fail.
        */}
        {past.length > 0 && (
          <ul className="flex flex-wrap items-center gap-1.5">
            {past.map((approverId) => {
              const approver = getUser(approverId)
              return (
                <li
                  key={approverId}
                  title="Already recorded their decision. Kept for the record; no longer on a gate."
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border py-0.5 pl-1 pr-2 text-xs text-muted-foreground"
                >
                  <UserAvatar user={approver} name={approverId} size="xs" />
                  {approver?.name ?? approverId}
                  <Check className="h-3 w-3 text-emerald-600" />
                </li>
              )
            })}
          </ul>
        )}

        {replacing && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
            <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Hand {getUser(replacing)?.name ?? replacing}&rsquo;s remaining gates to
            </span>
            <div className="w-full max-w-[16rem]">
              <UserSelect
                value=""
                placeholder="Choose their replacement"
                excludeIds={roster}
                disabled={replaceApprover.isPending}
                onChange={(toApproverId) => void handleReplaceApprover(replacing, toApproverId)}
              />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setReplacing(null)}>
              Cancel
            </Button>
          </div>
        )}

        {canManageRoster && (
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="w-full max-w-xs">
              <UserSelect
                value=""
                placeholder="Add an approver"
                excludeIds={roster}
                disabled={addApprover.isPending}
                onChange={(approverId) => void handleAddApprover(approverId)}
              />
            </div>
          </div>
        )}
      </section>

      {APPROVAL_STAGES.map((stage) => {
        const stored = solution.approvals.filter((a) => a.stage === stage)
        /*
          A gate with no rows but a non-empty roster is one that was added after
          the solution: the rows appear when the gate is reached (the service
          materialises them). Showing the roster meanwhile is the truth about who
          will be asked — better than "nobody", which reads as a broken gate.
        */
        const approvals: Approval[] =
          stored.length > 0
            ? stored
            : /* `active`, not the whole roster: somebody who has been removed keeps
                 their recorded decisions, and listing them as a future approver on a
                 gate they are no longer on would be a promise nobody made. */
              active.map((approverId) => ({
                id: `pending-${stage}-${approverId}`,
                solutionId: solution.id,
                approverId,
                stage,
                status: 'PENDING' as const,
                comment: null,
                createdAt: '',
                approvedAt: null,
              }))
        const isActive = solution.status === stage
        /* Past this gate, its roster is history: a new pending row would be a
           decision nobody could act on, and the service refuses it too. */
        const isCleared = statusIndex(solution.status) > statusIndex(stage)
        /* Neither open nor behind us: the roster is listed so you know who signs
           off later, which is worth saying out loud on the gate. */
        const isUpcoming = !isActive && !isCleared && !isVoid(solution.status)

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
              {isCleared && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                  Cleared
                </span>
              )}
              {isUpcoming && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Later
                </span>
              )}
            </div>

            {approvals.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3.5 py-6 text-center text-sm text-muted-foreground">
                No approvers yet — add them above.
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
                const actionable = canDecideFor(approval) && isActive && approval.status !== 'APPROVED'

                return (
                  <li key={approval.id} className="flex flex-wrap items-start gap-3 bg-card p-3.5">
                    <UserAvatar user={approver} name={approval.approverId} size="md" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {approver?.name ?? approval.approverId}
                        </p>
                        <DecisionChip status={approval.status} reached={!isUpcoming} />
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

            {canAddPerGate && !isCleared && (
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="w-full max-w-xs">
                  <UserSelect
                    value=""
                    placeholder={`Add to ${STATUS_META[stage].label} only`}
                    /* Excludes whoever is on *this* gate, not the roster: the
                       point of this control is the person the other gates do not
                       need. */
                    excludeIds={approvals.map((approval) => approval.approverId)}
                    disabled={addApprover.isPending}
                    onChange={(approverId) => void handleAddApprover(approverId, stage)}
                  />
                </div>
              </div>
            )}

            {approvals.length > 0 && (isActive || isUpcoming) && (
              <p className="text-xs text-muted-foreground">
                {isActive
                  ? `All approvers must sign off before this solution moves to ${statusLabel(
                      getApprovalTarget(stage),
                    )}.`
                  : `Nothing to do here yet — this gate opens when ${statusLabel(
                      stageBefore(stage),
                    )} is sent for approval.`}
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

/**
 * A decision, or the absence of one.
 *
 * `PENDING` means two different things depending on the gate: at the open gate
 * somebody is genuinely being waited on, at a later one their turn simply has not
 * come. Amber on the second case reads as "this person is late", so an unreached
 * gate gets a grey chip that says so.
 */
function DecisionChip({ status, reached = true }: { status: Approval['status']; reached?: boolean }) {
  if (status === 'PENDING' && !reached) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
        <Clock className="h-3 w-3" />
        Not started
      </span>
    )
  }

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
