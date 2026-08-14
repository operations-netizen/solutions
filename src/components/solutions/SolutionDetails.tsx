import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  History as HistoryIcon,
  MessageSquare,
  Paperclip,
  Pencil,
  ShieldCheck,
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
import { useSolution } from '@/hooks/solutions/useSolutions'
import { useUploadAttachment } from '@/hooks/solutions/useSolutionMutations'
import { useUserLookup } from '@/hooks/useDirectory'
import { usePaths, usePermissions } from '@/hooks/useSolutionsModule'
import type { NewAttachmentInput } from '@/types/solution'
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
  const [editOpen, setEditOpen] = useState(false)

  if (isLoading) return <DetailsSkeleton />

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

      {/* Header */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-muted-foreground">
                {solution.solutionNumber}
              </span>
              <StatusBadge status={solution.status} showActivity />
              <PriorityBadge priority={solution.priority} />
              <ApprovalStatusBadge status={solution.approvalStatus} />
              <DueDateBadge
                daysUntilDue={solution.daysUntilDue}
                isOverdue={solution.isOverdue}
              />
            </div>

            <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground">
              {solution.title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {assignee?.name ?? 'Unassigned'}
                {solution.assignedTeam && ` · ${solution.assignedTeam}`}
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

        <div className="mt-5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Workflow progress</span>
            <span className="font-medium text-foreground">{solution.progress}%</span>
          </div>
          <Progress
            value={solution.progress}
            indicatorClassName={readOnly ? 'bg-emerald-500' : undefined}
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
              <Section title="Problem">
                <Prose text={solution.problem} />
              </Section>

              <Section title="Proposed solution">
                <Prose text={solution.proposedSolution} />
              </Section>

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
        <div className="min-w-0 space-y-5">
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

              <dl className="space-y-3 text-sm">
                <Field label="Priority">
                  <PriorityBadge priority={solution.priority} />
                </Field>
                <Field label="Status">
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
            <CardContent className="space-y-2.5 pt-0">
              {approverIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approvers assigned.</p>
              ) : (
                approverIds.map((id) => (
                  <UserCell key={id} user={getUser(id)} name={id} />
                ))
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
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
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{text}</p>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</dt>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
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
