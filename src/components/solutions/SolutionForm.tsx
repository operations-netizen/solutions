import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import { UserSelect } from '@/components/common/UserSelect'
import { ApproverSelect } from '@/components/solutions/ApproverSelect'
import { AttachmentPicker } from '@/components/solutions/AttachmentPicker'
import { InlineSpinner } from '@/components/solutions/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useUsers } from '@/hooks/useDirectory'
import { SOLUTION_PRIORITIES, type NewAttachmentInput } from '@/types/solution'
import { toDateInputValue } from '@/utils/format'
import { PRIORITY_META } from '@/utils/solution'
import {
  buildEditSolutionSchema,
  solutionFormSchema,
  type SolutionFormValues,
} from '@/utils/validation'

export interface SolutionFormSubmitValues extends SolutionFormValues {
  attachments: NewAttachmentInput[]
}

interface SolutionFormProps {
  mode?: 'create' | 'edit'
  defaultValues?: Partial<SolutionFormValues>
  /** Edit mode validates the due date against the original creation date. */
  createdAt?: string
  onSubmit: (values: SolutionFormSubmitValues) => Promise<unknown>
  onCancel: () => void
  submitLabel?: string
  /** Rendered above the form; used for server-side errors. */
  banner?: ReactNode
}

const EMPTY_DEFAULTS: SolutionFormValues = {
  title: '',
  problem: '',
  proposedSolution: '',
  description: '',
  assignedUserId: '',
  priority: 'MEDIUM',
  dueDate: '',
  approverIds: [],
}

export function SolutionForm({
  mode = 'create',
  defaultValues,
  createdAt,
  onSubmit,
  onCancel,
  submitLabel,
  banner,
}: SolutionFormProps) {
  const { data: users = [] } = useUsers()
  const [attachments, setAttachments] = useState<NewAttachmentInput[]>([])

  const schema = mode === 'edit' && createdAt ? buildEditSolutionSchema(createdAt) : solutionFormSchema

  const form = useForm<SolutionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...EMPTY_DEFAULTS, ...defaultValues },
    mode: 'onBlur',
  })

  const isSubmitting = form.formState.isSubmitting

  async function handleSubmit(values: SolutionFormValues) {
    await onSubmit({ ...values, attachments })
  }

  return (
    <Form {...form}>
      {/*
        Laid out for a dialog that does not scroll itself (`scrollBody={false}`):
        this form is the flex child that takes the remaining height, scrolls its
        fields, and keeps the action bar on the bottom edge. `min-h-0` is what
        lets the middle section shrink instead of pushing the bar off-screen.
      */}
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6">
          {banner}

          <Section title="Basic information">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Solution title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. CRM automation for lead routing" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="problem"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Problem / requirement</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="What is going wrong today, and what does it cost us?"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Describe the current situation and its impact, not the fix.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="proposedSolution"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>Proposed solution</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="What do we intend to build or change?" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Detailed description</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Scope, phases, dependencies, anything the approvers should know."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Section>

          {/*
            Owner and approvers are the same decision — who is involved — so they
            share a row. `items-start` keeps both fields top-aligned when the
            approver chips grow the right-hand column.
          */}
          <Section>
            <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
              {/*
                A solution is owned by a person, never by a team — one name to hold
                accountable at every stage. The team is not asked for: it follows
                from whoever is assigned, and the service derives it.
              */}
              <FormField
                control={form.control}
                name="assignedUserId"
                render={({ field, fieldState }) => {
                  const selected = users.find((user) => user.id === field.value)
                  return (
                    <FormItem>
                      <FormLabel required>Assign to</FormLabel>
                      <UserSelect
                        value={field.value}
                        onChange={field.onChange}
                        invalid={!!fieldState.error}
                      />
                      {/* The team is a consequence of the choice, so confirm it here. */}
                      {selected && <FormDescription>Team: {selected.team}</FormDescription>}
                      <FormMessage />
                    </FormItem>
                  )
                }}
              />

              <FormField
                control={form.control}
                name="approverIds"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel required>Approvers</FormLabel>
                    <ApproverSelect
                      value={field.value}
                      onChange={field.onChange}
                      invalid={!!fieldState.error}
                    />
                    <FormDescription>Sign off at both gates: Discussion and Testing.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Section>

          <Section title="Planning">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SOLUTION_PRIORITIES.map((priority) => (
                          <SelectItem key={priority} value={priority}>
                            <span className="flex items-center gap-2">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${PRIORITY_META[priority].dotClass}`}
                              />
                              {PRIORITY_META[priority].label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dueDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>Due date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        min={mode === 'create' ? toDateInputValue(new Date()) : undefined}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </Section>

          {mode === 'create' && (
            <Section title="Attachments">
              <AttachmentPicker
                value={attachments}
                onChange={setAttachments}
                disabled={isSubmitting}
              />
            </Section>
          )}
        </div>

        {/*
          Outside the scroll area, so it is flush with the dialog's bottom edge at
          every scroll position — nothing passes underneath it and no dead space
          is left below it.
        */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card p-4 sm:flex-row sm:justify-end sm:px-6">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <InlineSpinner />}
            {submitLabel ?? (mode === 'create' ? 'Create solution' : 'Save changes')}
          </Button>
        </div>
      </form>
    </Form>
  )
}

/** The heading is optional: a section whose fields speak for themselves omits it. */
function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      {title && (
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  )
}
