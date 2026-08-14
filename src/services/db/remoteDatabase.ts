/**
 * The same store as `localDatabase`, backed by the API server and MongoDB.
 *
 * This is the *only* file in the project that knows data lives behind HTTP, just
 * as `localDatabase` is the only one that knows about `localStorage`. Both expose
 * the identical surface, so every service and every workflow rule above them is
 * unchanged — swapping the two is a one-line decision in `./index.ts`.
 *
 * Writes are read-modify-write against a version, matching the server: the
 * recipe runs on the cached snapshot, the result is pushed, and a 409 means
 * somebody else wrote first, so the recipe is replayed against fresh data.
 */

import type { DatabaseSnapshot } from '@/data/mockSolutions'
import type { TableName } from './localDatabase'

const EMPTY: DatabaseSnapshot = {
  solutions: [],
  approvals: [],
  comments: [],
  history: [],
  attachments: [],
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)
}

export class RemoteDatabaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RemoteDatabaseError'
  }
}

/** Raised internally when the server refuses a stale write. Never surfaces. */
class StaleSnapshotError extends Error {}

export function createRemoteDatabase(baseUrl: string) {
  const root = baseUrl.replace(/\/$/, '')

  let cache: DatabaseSnapshot | null = null
  let version = 0
  /** Concurrent callers share one in-flight fetch instead of racing. */
  let loading: Promise<DatabaseSnapshot> | null = null

  async function request(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(`${root}${path}`, init)
    } catch {
      throw new RemoteDatabaseError(
        `Cannot reach the API server at ${root}. Start it with \`npm run dev:api\`.`,
      )
    }
  }

  function adopt(payload: Record<string, unknown>): DatabaseSnapshot {
    version = typeof payload.version === 'number' ? payload.version : 0
    cache = {
      solutions: (payload.solutions ?? []) as DatabaseSnapshot['solutions'],
      approvals: (payload.approvals ?? []) as DatabaseSnapshot['approvals'],
      comments: (payload.comments ?? []) as DatabaseSnapshot['comments'],
      history: (payload.history ?? []) as DatabaseSnapshot['history'],
      attachments: (payload.attachments ?? []) as DatabaseSnapshot['attachments'],
    }
    return cache
  }

  async function fetchSnapshot(): Promise<DatabaseSnapshot> {
    const response = await request('/api/snapshot')
    if (!response.ok) {
      throw new RemoteDatabaseError(`The API server returned ${response.status} reading the store.`)
    }
    return adopt(await response.json())
  }

  function state(): Promise<DatabaseSnapshot> {
    if (cache) return Promise.resolve(cache)
    loading ??= fetchSnapshot().finally(() => {
      loading = null
    })
    return loading
  }

  async function push(next: DatabaseSnapshot): Promise<void> {
    const response = await request('/api/snapshot', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, tables: next }),
    })

    if (response.status === 409) {
      const body = (await response.json()) as { snapshot?: Record<string, unknown> }
      if (body.snapshot) adopt(body.snapshot)
      else await fetchSnapshot()
      throw new StaleSnapshotError()
    }

    if (!response.ok) {
      throw new RemoteDatabaseError(`The API server returned ${response.status} saving the store.`)
    }

    const body = (await response.json()) as { version: number }
    version = body.version
  }

  return {
    /*
      Both reads go to the server rather than the cache. `list` is what serves
      comments, attachments, history, and approvals, and answering those from a
      cache means a write made anywhere else stays invisible until something
      happens to call `read`. The cache exists for the write path below, where a
      stale snapshot is caught by the version check instead of being trusted.
    */
    async list<T extends TableName>(table: T): Promise<DatabaseSnapshot[T]> {
      return clone((await fetchSnapshot())[table])
    },

    async read(): Promise<DatabaseSnapshot> {
      return clone(await fetchSnapshot())
    },

    async transact<R>(recipe: (draft: DatabaseSnapshot) => R): Promise<R> {
      // Two passes at most: one on the cached snapshot, one on a fresh one after
      // a conflict. A third would mean sustained contention, which is a real
      // error rather than something to keep retrying through.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const draft = await state()
        const rollback = clone(draft)

        let result: R
        try {
          result = recipe(draft)
        } catch (error) {
          // A rule violation (`SolutionServiceError`) can leave the draft half
          // mutated, so drop those edits before letting the error through.
          cache = rollback
          throw error
        }

        try {
          await push(draft)
          return clone(result)
        } catch (error) {
          cache = rollback
          if (error instanceof StaleSnapshotError && attempt === 0) {
            await fetchSnapshot()
            continue
          }
          if (error instanceof StaleSnapshotError) {
            throw new RemoteDatabaseError(
              'Someone else changed this solution while you were saving. Reload and try again.',
            )
          }
          throw error
        }
      }

      throw new RemoteDatabaseError('The write could not be applied. Please try again.')
    },

    async reset(): Promise<void> {
      const response = await request('/api/reset', { method: 'POST' })
      if (!response.ok) {
        throw new RemoteDatabaseError(`The API server returned ${response.status} resetting.`)
      }
      const body = (await response.json()) as { version: number }
      version = body.version
      cache = clone(EMPTY)
    },
  }
}
