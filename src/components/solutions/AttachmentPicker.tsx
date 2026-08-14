import { Loader2, Paperclip, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MAX_ATTACHMENT_BYTES, toAttachmentInput } from '@/services'
import type { NewAttachmentInput } from '@/types/solution'
import { formatFileSize } from '@/utils/format'

interface AttachmentPickerProps {
  value: NewAttachmentInput[]
  onChange: (files: NewAttachmentInput[]) => void
  disabled?: boolean
}

/**
 * File selection UI. Conversion to a storable shape happens in
 * `toAttachmentInput`, which is where the bytes are actually uploaded — so this
 * component never constructs a storage URL, it just waits for one.
 */
export function AttachmentPicker({ value, onChange, disabled }: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(0)

  /**
   * Sequential rather than `Promise.all`: a batch of large files should not open
   * five concurrent uploads, and one failure must not discard the others.
   */
  async function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return

    const files = Array.from(fileList)
    setUploading(files.length)

    const accepted: NewAttachmentInput[] = []
    try {
      for (const file of files) {
        if (file.size > MAX_ATTACHMENT_BYTES) {
          toast.error(`${file.name} is too large`, { description: 'The upload limit is 25 MB.' })
          continue
        }
        try {
          accepted.push(await toAttachmentInput(file))
        } catch (error) {
          toast.error(`Could not upload ${file.name}`, {
            description: error instanceof Error ? error.message : 'Please try again.',
          })
        }
      }
    } finally {
      setUploading(0)
    }

    if (accepted.length) onChange([...value, ...accepted])
  }

  const busy = disabled || uploading > 0

  return (
    <div className="space-y-2">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!busy) void addFiles(event.dataTransfer.files)
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center transition-colors',
          dragging && 'border-primary bg-primary/5',
          busy && 'opacity-60',
        )}
      >
        {uploading > 0 ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="h-5 w-5 text-muted-foreground" />
        )}
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            {uploading > 0
              ? `Uploading ${uploading} file${uploading === 1 ? '' : 's'}…`
              : 'Drag files here, or browse'}
          </p>
          <p className="text-xs text-muted-foreground">Up to 25 MB per file</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Browse files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          disabled={busy}
          onChange={(event) => {
            void addFiles(event.target.files)
            // Allow re-selecting the same file after removing it.
            event.target.value = ''
          }}
        />
      </div>

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((file, index) => (
            <li
              key={`${file.fileName}-${index}`}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.fileName}</p>
                <p className="text-xs text-muted-foreground">{formatFileSize(file.fileSize)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={disabled}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Remove {file.fileName}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
