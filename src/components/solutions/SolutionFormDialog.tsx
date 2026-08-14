import { AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  SolutionForm,
  type SolutionFormSubmitValues,
} from '@/components/solutions/SolutionForm'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  toErrorMessage,
  useCreateSolution,
  useUpdateSolution,
} from '@/hooks/solutions/useSolutionMutations'
import { usePaths } from '@/hooks/useSolutionsModule'
import type { SolutionDetail } from '@/types/solution'
import { toDateInputValue } from '@/utils/format'

interface CreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Navigate to the new solution after creating it. */
  navigateOnCreate?: boolean
}

/** "+ Add Solution" modal. New solutions always start in Discussion. */
export function CreateSolutionDialog({
  open,
  onOpenChange,
  navigateOnCreate = true,
}: CreateDialogProps) {
  const navigate = useNavigate()
  const paths = usePaths()
  const createSolution = useCreateSolution()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(values: SolutionFormSubmitValues) {
    setError(null)
    try {
      const solution = await createSolution.mutateAsync({
        title: values.title,
        problem: values.problem,
        proposedSolution: values.proposedSolution,
        description: values.description,
        priority: values.priority,
        assignedUserId: values.assignedUserId,
        // Store the due date as an end-of-day instant so a solution is not
        // overdue on the morning of the day it is due.
        dueDate: new Date(`${values.dueDate}T23:59:59`).toISOString(),
        approverIds: values.approverIds,
        attachments: values.attachments,
      })

      onOpenChange(false)
      if (navigateOnCreate) navigate(paths.solution(solution.id))
    } catch (cause) {
      setError(toErrorMessage(cause))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      {/*
        `scrollBody={false}`: the form scrolls its own fields so the title above
        and the action bar below stay fixed to the dialog's edges. Padding moves
        inside for the same reason — `pr-12` keeps the text clear of the close button.
      */}
      <DialogContent scrollBody={false} className="flex max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border p-6 pr-12">
          <DialogTitle>Add solution</DialogTitle>
          <DialogDescription>
            Capture the problem and the proposed fix. The solution starts in Discussion and moves
            through the workflow from there.
          </DialogDescription>
        </DialogHeader>

        <SolutionForm
          mode="create"
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          banner={error ? <FormError message={error} /> : null}
        />
      </DialogContent>
    </Dialog>
  )
}

interface EditDialogProps {
  solution: SolutionDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditSolutionDialog({ solution, open, onOpenChange }: EditDialogProps) {
  const updateSolution = useUpdateSolution(solution.id)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(values: SolutionFormSubmitValues) {
    setError(null)
    try {
      await updateSolution.mutateAsync({
        title: values.title,
        problem: values.problem,
        proposedSolution: values.proposedSolution,
        description: values.description,
        priority: values.priority,
        assignedUserId: values.assignedUserId,
        dueDate: new Date(`${values.dueDate}T23:59:59`).toISOString(),
        approverIds: values.approverIds,
      })
      onOpenChange(false)
    } catch (cause) {
      setError(toErrorMessage(cause))
    }
  }

  // Distinct approvers across both gates form the roster.
  const approverIds = Array.from(new Set(solution.approvals.map((a) => a.approverId)))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      {/*
        `scrollBody={false}`: the form scrolls its own fields so the title above
        and the action bar below stay fixed to the dialog's edges. Padding moves
        inside for the same reason — `pr-12` keeps the text clear of the close button.
      */}
      <DialogContent scrollBody={false} className="flex max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border p-6 pr-12">
          <DialogTitle>Edit {solution.solutionNumber}</DialogTitle>
          <DialogDescription>
            Changes to assignment, due date, and priority are recorded on the activity timeline.
          </DialogDescription>
        </DialogHeader>

        <SolutionForm
          mode="edit"
          createdAt={solution.createdAt}
          defaultValues={{
            title: solution.title,
            problem: solution.problem,
            proposedSolution: solution.proposedSolution,
            description: solution.description,
            assignedUserId: solution.assignedUserId,
            priority: solution.priority,
            dueDate: toDateInputValue(solution.dueDate),
            approverIds,
          }}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          banner={error ? <FormError message={error} /> : null}
        />
      </DialogContent>
    </Dialog>
  )
}

function FormError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  )
}
