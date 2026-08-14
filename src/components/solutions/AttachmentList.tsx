import { Download, FileText, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { toErrorMessage, useRemoveAttachment } from '@/hooks/solutions/useSolutionMutations'
import { useUserLookup } from '@/hooks/useDirectory'
import { usePermissions } from '@/hooks/useSolutionsModule'
import { isAttachmentDownloadable, resolveAttachmentUrl } from '@/services'
import type { Attachment } from '@/types/solution'
import { formatDate, formatFileSize } from '@/utils/format'

interface AttachmentListProps {
  solutionId: string
  attachments: Attachment[]
  readOnly?: boolean
}

export function AttachmentList({ solutionId, attachments, readOnly }: AttachmentListProps) {
  const { can } = usePermissions()
  const { getName } = useUserLookup()
  const removeAttachment = useRemoveAttachment(solutionId)

  const canManage = can('solution:attach') && !readOnly

  if (attachments.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        No attachments on this solution.
      </p>
    )
  }

  async function remove(attachment: Attachment) {
    try {
      await removeAttachment.mutateAsync(attachment.id)
      toast.success('Attachment removed', { description: attachment.fileName })
    } catch (error) {
      toast.error('Could not remove the attachment', { description: toErrorMessage(error) })
    }
  }

  /*
    A row is downloadable when something can actually serve the bytes: a stored
    `/api/files/...` path, or an object URL from this same session. The old check
    only excluded `local://`, so a dead `blob:` URL from a previous session still
    rendered a download button that silently failed.
  */

  return (
    <ul className="space-y-2">
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{attachment.fileName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {formatFileSize(attachment.fileSize)} · {getName(attachment.uploadedBy)} ·{' '}
              {formatDate(attachment.createdAt)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isAttachmentDownloadable(attachment.fileUrl) && (
              <Button variant="ghost" size="icon-sm" asChild>
                <a
                  href={resolveAttachmentUrl(attachment.fileUrl)}
                  download={attachment.fileName}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="h-4 w-4" />
                  <span className="sr-only">Download {attachment.fileName}</span>
                </a>
              </Button>
            )}
            {canManage && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void remove(attachment)}
                disabled={removeAttachment.isPending}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">Remove {attachment.fileName}</span>
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
