import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  History as HistoryIcon,
  Lock,
  MessageSquare,
  Paperclip,
  Pencil,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '@/components/common/EmptyState'
import { UserCell } from '@/components/common/UserAvatar'
import { ActivityTimeline } from '@/components/solutions/ActivityTimeline'
import { ApprovalPanel } from '@/components/solutions/ApprovalPanel'
import { AttachmentList } from '@/components/solutions/AttachmentList'
import { AttachmentPicker } from '@/components/solutions/AttachmentPicker'
import { EditSolutionDialog } from '@/components/solutions/SolutionFormDialog'
import { SolutionChat } from '@/components/solutions/SolutionChat'
import {
  ApprovalStatusBadge,
  DueDateBadge,
  PriorityBadge,
  StatusBadge,
} from '@/components/solutions/StatusBadge'
import { WorkflowActions, WorkflowNotice } from '@/components/solutions/WorkflowActions'
import { WorkflowTracker } from '@/components/solutions/WorkflowTracker'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCanViewSolution, useSolution } from '@/hooks/solutions/useSolutions'
import { useUploadAttachment } from '@/hooks/solutions/useSolutionMutations'
import { useUserLookup } from '@/hooks/useDirectory'
import { usePaths, usePermissions } from '@/hooks/useSolutionsModule'
import { APPROVAL_STAGES, type NewAttachmentInput, type SolutionDetail } from '@/types/solution'
import { formatDate, formatDateTime } from '@/utils/format'

interface SolutionDetailsProps {
  solutionId: string
  /** Show a back link to the list. Off when embedded in a drawer. */
  showBackLink?: boolean
}

export function SolutionDetails({ solutionId, showBackLink = true }: SolutionDetailsProps) {
  const paths = usePaths()
  const { can } = usePermissions()
  const { getUser, getName } = useUserLookup()
  const { data: solution, isLoading, isError } = useSolution(solutionId)
  const canView = useCanViewSolution(solution)
  const [editOpen, setEditOpen] = useState(false)

  if (isLoading) return <DetailsSkeleton />

  /*
    Looped in, or not at all. A solution is readable by the people it involves —
    assignee, raiser, approvers — plus whoever holds `solution:viewAll`. Said
    plainly rather than shown as "not found", which would be a lie about why.
  */
  if (solution && canView === false) {
    return (
      <EmptyState
        icon={Lock}
        title="You are not on this solution"
        description="Only the people looped into a solution — the assignee, whoever raised it, and its approvers — can open it."
        action={
          <Button variant="outline" asChild>
            <Link to={paths.solutions}>Back to solutions</Link>
          </Button>
        }
      />
    )
  }

  if (isError || !solution) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Solution not found"
        description="This solution may have been removed, or the link is out of date."
        action={
          <Button variant="outline" asChild>
            <Link to={paths.solutions}>Back to solutions</Link>
          </Button>
        }
      />
    )
  }

  const readOnly = solution.status === 'COMPLETED'
  const assignee = getUser(solution.assignedUserId)
  /** Whoever raised it — the person the assignee answers to on this solution. */
  const raiser = getUser(solution.createdBy)
  const approverIds = Array.from(new Set(solution.approvals.map((a) => a.approverId)))

  return (
    <div className="space-y-5">
      {showBackLink && (
        <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
          <Link to={paths.solutions}>
            <ArrowLeft className="h-4 w-4" />
            Back to solutions
          </Link>
        </Button>
      )}

      {/*
        Header as the hero of the page: a faint indigo wash behind it separates
        "what this is" from the panels of detail below, which are plain white.
      */}
      <Card className="relative overflow-hidden p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(36rem 18rem at 0% 0%, hsl(243 75% 51% / 0.07), transparent 65%),' +
              'radial-gradient(28rem 16rem at 100% 0%, hsl(262 83% 58% / 0.05), transparent 60%)',
          }}
        />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                {solution.solutionNumber}
              </span>
              <StatusBadge status={solution.status} />
              <PriorityBadge priority={solution.priority} />
              {/*
                At a gate awaiting decisions the status badge already says so —
                "Testing Approval" *is* "waiting for approval" — so this would be
                the same fact twice. A recorded decision (Approved / Rejected) and
                the pre-gate "Not yet" still earn their place.
              */}
              {solution.approvalStatus !== 'PENDING' && (
                <ApprovalStatusBadge
                  status={solution.approvalStatus}
                  hasApprovers={solution.approvals.length > 0}
                />
              )}
              <DueDateBadge
                daysUntilDue={solution.daysUntilDue}
                isOverdue={solution.isOverdue}
              />
            </div>

            <h1 className="text-balance text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] text-foreground">
              {solution.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {/*
                Labelled, because two people appear on this line and a bare pair
                of names does not say which of them owns the work.
              */}
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                Assigned to{' '}
                <span className="font-medium text-foreground">
                  {assignee?.name ?? 'Unassigned'}
                </span>
                {/* Team is not repeated here — the Details panel already carries it,
                    and this line is about who holds the work, not which team. */}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <UserCheck className="h-4 w-4" />
                Assigned by{' '}
                <span className="font-medium text-foreground">
                  {raiser?.name ?? solution.createdBy}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                Due {formatDate(solution.dueDate)}
              </span>
              {solution.completedAt && (
                <span className="inline-flex items-center gap-1.5 text-emerald-700">
                  <ShieldCheck className="h-4 w-4" />
                  Completed {formatDate(solution.completedAt)}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row lg:items-start">
            {can('solution:update') && !readOnly && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            )}
            <WorkflowActions solution={solution} />
          </div>
        </div>

        <div className="relative mt-6 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium uppercase tracking-wide text-muted-foreground">
              Workflow progress
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary">
              {solution.progress}%
            </span>
          </div>
          <Progress
            value={solution.progress}
            indicatorClassName={
              readOnly ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : undefined
            }
          />
        </div>

        {/* Full width, so a long explanation never squeezes the title. */}
        <div className="mt-4 empty:mt-0">
          <WorkflowNotice solution={solution} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column. `min-w-0` keeps long content from widening the grid. */}
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Tabs defaultValue="overview">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="overview" className="gap-1.5">
                <ClipboardList className="h-4 w-4" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="approvals" className="gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                Approvers
                {solution.pendingStage && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                    {
                      solution.approvals.filter(
                        (a) => a.stage === solution.pendingStage && a.status === 'PENDING',
                      ).length
                    }
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="chat" className="gap-1.5">
                <MessageSquare className="h-4 w-4" />
                Chat
                {solution.commentCount > 0 && (
                  <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] font-semibold">
                    {solution.commentCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5">
                <HistoryIcon className="h-4 w-4" />
                Activity
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-5">
              <GlanceStrip solution={solution} />

              {/*
                Paired, because they are read as a pair — the problem and what is
                proposed about it — and because two short cards stacked left a
                column of dead space beside a rail that runs the height of the page.
              */}
              <div className="grid gap-5 xl:grid-cols-2">
                <Section title="Problem">
                  <Prose text={solution.problem} />
                </Section>

                <Section title="Proposed solution">
                  <Prose text={solution.proposedSolution} />
                </Section>
              </div>

              {solution.description && (
                <Section title="Detailed description">
                  <Prose text={solution.description} />
                </Section>
              )}

              <Section
                title="Attachments"
                count={solution.attachments.length}
                icon={Paperclip}
              >
                <div className="space-y-3">
                  <AttachmentList
                    solutionId={solution.id}
                    attachments={solution.attachments}
                    readOnly={readOnly}
                  />
                  {can('solution:attach') && !readOnly && (
                    <AttachmentUploader solutionId={solution.id} />
                  )}
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="approvals" className="mt-4">
              <Card>
                <CardContent className="pt-5">
                  <ApprovalPanel solution={solution} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="chat" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Solution Discussion</CardTitle>
                </CardHeader>
                <CardContent className="flex h-[32rem] flex-col pt-0">
                  <SolutionChat solutionId={solution.id} readOnly={readOnly} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ActivityTimeline history={solution.history} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Side column */}
        {/* Sticky on wide screens: the workflow is reference material, and scrolling
            a long discussion should not scroll away where the solution stands. */}
        <div className="min-w-0 space-y-5 lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Workflow</CardTitle>
            </CardHeader>
            <CardContent>
              <WorkflowTracker
                status={solution.status}
                approvals={solution.approvals}
                history={solution.history}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-2.5">
                <FieldLabel>Assigned to</FieldLabel>
                <UserCell user={assignee} subtitle={solution.assignedTeam || assignee?.team} />
              </div>

              <Separator />

              {/* Hairlines rather than gaps: eight facts read as a table of
                  record, and the rhythm survives one of them wrapping. */}
              <dl className="-my-1 divide-y divide-border/60 text-sm">
                <Field label="Priority">
                  <PriorityBadge priority={solution.priority} />
                </Field>
                <Field label="Stage">
                  <StatusBadge status={solution.status} />
                </Field>
                <Field label="Due date">{formatDate(solution.dueDate)}</Field>
                <Field label="Created by">{getName(solution.createdBy)}</Field>
                <Field label="Created">{formatDateTime(solution.createdAt)}</Field>
                <Field label="Last updated">{formatDateTime(solution.updatedAt)}</Field>
                {solution.completedAt && (
                  <Field label="Completed">{formatDateTime(solution.completedAt)}</Field>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Approvers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {approverIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approvers assigned.</p>
              ) : (
                approverIds.map((id) => {
                  /*
                    A name alone says who, not where they stand. The count is
                    across gates, which is what makes it worth showing at all: one
                    person can be two gates ahead of another.
                  */
                  const rows = solution.approvals.filter((a) => a.approverId === id)
                  const signed = rows.filter((a) => a.status === 'APPROVED').length
                  const rejected = rows.some((a) => a.status === 'REJECTED')
                  const allSigned = rows.length > 0 && signed === rows.length

                  return (
                    <div key={id} className="flex items-center justify-between gap-3">
                      <UserCell user={getUser(id)} name={id} />
                      {rejected ? (
                        <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                          Rejected
                        </span>
                      ) : allSigned ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                          <ShieldCheck className="h-3 w-3" />
                          Signed off
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                          {signed}/{rows.length} gates
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {editOpen && (
        <EditSolutionDialog solution={solution} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

/**
 * Four facts that are otherwise only implicit in the page: how long this has been
 * running, how far the approvals have got, and how much conversation and evidence
 * is attached.
 *
 * Not decoration for an empty column — these are the questions asked about a
 * solution in a status meeting, and every one of them was previously answerable
 * only by reading a tab or doing arithmetic on two timestamps.
 */
function GlanceStrip({ solution }: { solution: SolutionDetail }) {
  const started = new Date(solution.createdAt).getTime()
  const ended = solution.completedAt ? new Date(solution.completedAt).getTime() : Date.now()
  const days = Math.max(0, Math.round((ended - started) / 86_400_000))

  /* A gate counts as cleared when every approver on it has signed off — the same
     rule the workflow uses to open one, so the two can never disagree. */
  const cleared = APPROVAL_STAGES.filter((stage) => {
    const roster = solution.approvals.filter((approval) => approval.stage === stage)
    return roster.length > 0 && roster.every((approval) => approval.status === 'APPROVED')
  }).length

  const items = [
    {
      label: solution.completedAt ? 'Cycle time' : 'In flight',
      value: days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`,
    },
    { label: 'Gates cleared', value: `${cleared} of ${APPROVAL_STAGES.length}` },
    { label: 'Comments', value: String(solution.commentCount) },
    { label: 'Attachments', value: String(solution.attachments.length) },
  ]

  return (
    <Card className="p-0">
      <dl className="grid grid-cols-2 divide-border/60 sm:grid-cols-4 sm:divide-x">
        {items.map((item) => (
          <div key={item.label} className="px-4 py-3.5">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {item.label}
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function Section({
  title,
  count,
  icon: Icon,
  children,
}: {
  title: string
  count?: number
  icon?: typeof Paperclip
  children: React.ReactNode
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        {/* Small uppercase label rather than a heading: it names the field without
            competing with the solution title above it. */}
        <CardTitle className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {title}
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}

function Prose({ text }: { text: string }) {
  if (!text.trim()) {
    return <p className="text-sm italic text-muted-foreground">Not filled in.</p>
  }

  return (
    <p className="whitespace-pre-wrap text-[0.9375rem] leading-[1.65] text-foreground/90">{text}</p>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</dt>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <FieldLabel>{label}</FieldLabel>
      <dd className="text-right text-sm text-foreground">{children}</dd>
    </div>
  )
}

/** Upload widget that commits straight to the attachment service. */
function AttachmentUploader({ solutionId }: { solutionId: string }) {
  const upload = useUploadAttachment(solutionId)
  const [pending, setPending] = useState<NewAttachmentInput[]>([])

  async function commit(files: NewAttachmentInput[]) {
    setPending(files)
    for (const file of files) {
      await upload.mutateAsync(file)
    }
    setPending([])
  }

  return (
    <AttachmentPicker
      value={pending}
      onChange={(files) => void commit(files)}
      disabled={upload.isPending}
    />
  )
}

function DetailsSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-44 w-full rounded-xl" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Skeleton className="h-10 w-96" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
        <div className="space-y-5">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}
