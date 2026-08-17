import { authService } from './auth/authService'
import { createHttpAuthService } from './auth/httpAuthService'
import type { SolutionsServices } from './contracts'
import { apiBaseUrl, isRemoteStore } from './db'
import { attachmentService } from './solutions/attachmentService'
import { chatService } from './solutions/chatService'
import { solutionService } from './solutions/solutionService'
import { createHttpUserService } from './users/httpUserService'
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
  /*
    Identity and the directory follow the store. On MongoDB they come from the
    API — real sign-in against the `users` collection. On `localStorage` they stay
    the seeded HOBU with no login, which keeps the zero-setup mode working.
  */
  users: isRemoteStore ? createHttpUserService(apiBaseUrl) : userService,
  auth: isRemoteStore ? createHttpAuthService(apiBaseUrl) : authService,
}

/**
 * Sign out and start over.
 *
 * The reload is deliberate, not laziness: TanStack Query holds the previous
 * user's solutions, and their permissions are baked into a mounted provider.
 * Dropping the whole page is the only way to guarantee none of it survives into
 * the next session.
 */
export async function signOutAndReload(): Promise<void> {
  await localServices.auth.signOut?.()
  if (typeof window !== 'undefined') window.location.reload()
}

/** True when this build has a login screen at all. */
export const supportsSignIn = typeof localServices.auth.signIn === 'function'

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
export { AuthError, createHttpAuthService } from './auth/httpAuthService'
export { getSessionToken } from './auth/session'
