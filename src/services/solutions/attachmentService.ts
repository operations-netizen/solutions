/**
 * Attachment handling.
 *
 * Against MongoDB the bytes are POSTed to `/api/files`, which streams them into
 * GridFS and hands back `/api/files/<id>` — a URL that still resolves after a
 * reload, from another browser, on another machine. Only that path plus the
 * metadata goes into the attachment row, so a snapshot write stays small.
 *
 * On `localStorage` the behaviour is unchanged: an object URL that lives as long
 * as the session, which is the honest lifetime of a local-only file.
 */

import type { ActorContext, AttachmentService } from '@/services/contracts'
import { authHeaders } from '@/services/auth/session'
import { apiBaseUrl, db, isRemoteStore } from '@/services/db'
import type { Attachment, NewAttachmentInput } from '@/types/solution'
import { createId } from '@/utils/id'

/** Reject oversized files before they reach the store. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

/** Stored paths are relative, so a row survives the API changing host or port. */
const STORED_PREFIX = '/api/files/'

/**
 * Turn a browser `File` into the service's input shape, uploading the bytes
 * first when there is somewhere durable to put them.
 *
 * Async because that upload is a real request: components await it rather than
 * constructing storage URLs themselves.
 */
export async function toAttachmentInput(file: File): Promise<NewAttachmentInput> {
  const mimeType = file.type || 'application/octet-stream'
  const base = {
    fileName: file.name,
    fileSize: file.size,
    mimeType,
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} is larger than the 25 MB upload limit.`)
  }

  if (!isRemoteStore) {
    return {
      ...base,
      fileUrl: typeof URL !== 'undefined' ? URL.createObjectURL(file) : `local://${file.name}`,
    }
  }

  const response = await fetch(`${apiBaseUrl}/api/files`, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType,
      // Header values must be latin-1; a name with accents or CJK would throw.
      'X-File-Name': encodeURIComponent(file.name),
      ...authHeaders(),
    },
    body: file,
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}) as { error?: string })
    throw new Error(detail.error ?? `Uploading ${file.name} failed (${response.status}).`)
  }

  const stored = (await response.json()) as { url: string }
  return { ...base, fileUrl: stored.url }
}

/**
 * Absolute URL for an attachment link. Stored rows hold a relative API path;
 * everything else (object URLs from a local session) is already absolute.
 */
export function resolveAttachmentUrl(fileUrl: string): string {
  return fileUrl.startsWith(STORED_PREFIX) ? `${apiBaseUrl}${fileUrl}` : fileUrl
}

/** Whether the bytes behind a row can actually be fetched. */
export function isAttachmentDownloadable(fileUrl: string): boolean {
  return fileUrl.startsWith(STORED_PREFIX) || fileUrl.startsWith('blob:')
}

export const attachmentService: AttachmentService = {
  async getAttachments(solutionId: string): Promise<Attachment[]> {
    const attachments = await db.list('attachments')
    return attachments
      .filter((a) => a.solutionId === solutionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async upload(
    solutionId: string,
    file: NewAttachmentInput,
    ctx: ActorContext,
  ): Promise<Attachment> {
    if (file.fileSize > MAX_ATTACHMENT_BYTES) {
      throw new Error(`${file.fileName} is larger than the 25 MB upload limit.`)
    }

    return db.transact((draft) => {
      const solution = draft.solutions.find((s) => s.id === solutionId)
      if (!solution) throw new Error(`Solution ${solutionId} was not found.`)

      const record: Attachment = {
        id: createId('att'),
        solutionId,
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        uploadedBy: ctx.actorId,
        createdAt: new Date().toISOString(),
      }
      draft.attachments.push(record)
      draft.history.push({
        id: createId('his'),
        solutionId,
        action: 'ATTACHMENT_UPLOADED',
        fromStatus: null,
        toStatus: null,
        description: `Attachment uploaded: ${file.fileName}`,
        performedBy: ctx.actorId,
        createdAt: record.createdAt,
      })
      solution.updatedAt = record.createdAt

      return record
    })
  },

  async remove(solutionId: string, attachmentId: string, ctx: ActorContext): Promise<void> {
    const stored = (await db.list('attachments')).find(
      (a) => a.id === attachmentId && a.solutionId === solutionId,
    )

    await db.transact((draft) => {
      const attachment = draft.attachments.find(
        (a) => a.id === attachmentId && a.solutionId === solutionId,
      )
      if (!attachment) return

      draft.attachments = draft.attachments.filter((a) => a.id !== attachmentId)
      draft.history.push({
        id: createId('his'),
        solutionId,
        action: 'UPDATED',
        fromStatus: null,
        toStatus: null,
        description: `Attachment removed: ${attachment.fileName}`,
        performedBy: ctx.actorId,
        createdAt: new Date().toISOString(),
      })
    })

    // Only after the row is gone: an orphaned row would be worse than orphaned
    // bytes, and a failure here must not undo a removal the user has seen.
    if (isRemoteStore && stored?.fileUrl.startsWith(STORED_PREFIX)) {
      const fileId = stored.fileUrl.slice(STORED_PREFIX.length)
      await fetch(`${apiBaseUrl}/api/files/${fileId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      }).catch(() => {})
    }
  },
}
