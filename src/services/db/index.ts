/**
 * Which store the app runs on.
 *
 * `VITE_API_URL` set  → MongoDB, through the API server in `server/`.
 * `VITE_API_URL` unset → `localStorage`, exactly as before.
 *
 * Both implementations expose the identical surface, so nothing above this line
 * — no service, no hook, no component — knows or cares which one is live. The
 * URL is safe to expose in the bundle; the connection string it fronts is not,
 * which is why the credential never leaves the server.
 */

import { db as localDb } from './localDatabase'
import { createRemoteDatabase } from './remoteDatabase'

const apiUrl = import.meta.env.VITE_API_URL?.trim()

export const db = apiUrl ? createRemoteDatabase(apiUrl) : localDb

/** True when the app is talking to MongoDB rather than `localStorage`. */
export const isRemoteStore = Boolean(apiUrl)

/**
 * Root of the API, without a trailing slash. Empty in local mode.
 * Attachment uploads need it directly: file bytes go to `/api/files`, not
 * through the snapshot.
 */
export const apiBaseUrl = apiUrl ? apiUrl.replace(/\/$/, '') : ''

export type { TableName } from './localDatabase'
