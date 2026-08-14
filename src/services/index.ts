import { authService } from './auth/authService'
import type { SolutionsServices } from './contracts'
import { attachmentService } from './solutions/attachmentService'
import { chatService } from './solutions/chatService'
import { solutionService } from './solutions/solutionService'
import { userService } from './users/userService'

/**
 * The default, self-contained implementation used by the standalone app.
 * `SolutionsModuleProvider` merges any partial override on top of this, so a
 * host can replace one service (say, `users`) and keep the rest.
 */
export const localServices: SolutionsServices = {
  solutions: solutionService,
  chat: chatService,
  attachments: attachmentService,
  users: userService,
  auth: authService,
}

export * from './contracts'
export { db, isRemoteStore } from './db'
export { notifications } from './notifications/notificationService'
export { SolutionServiceError } from './solutions/solutionService'
export {
  isAttachmentDownloadable,
  MAX_ATTACHMENT_BYTES,
  resolveAttachmentUrl,
  toAttachmentInput,
} from './solutions/attachmentService'
export { createStaticAuthService } from './auth/authService'
