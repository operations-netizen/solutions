/**
 * Local database abstraction.
 *
 * This is the *only* file in the project that knows data lives in
 * `localStorage`. Services talk to `db` through a tiny table API, so replacing
 * this with HTTP calls means rewriting the services and nothing else.
 *
 * It deliberately behaves like a remote store: every operation is async and
 * returns cloned data, so no caller can accidentally mutate the store in place
 * and get away with it locally only to break against a real API.
 */

import { createSeedSnapshot, type DatabaseSnapshot } from '@/data/mockSolutions'

/**
 * Bumped to `v2` when the seed dataset was emptied. Without a new key, a browser
 * that already ran the seeded build would keep serving those 25 demo solutions
 * out of `localStorage` forever, since a stored payload always wins over the
 * seed.
 */
const STORAGE_KEY = 'hobu.solutions.db.v2'

/** Small artificial delay so loading states are real during development. */
const LATENCY_MS = 220

export type TableName = keyof DatabaseSnapshot

function clone<T>(value: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : (JSON.parse(JSON.stringify(value)) as T)
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function load(): DatabaseSnapshot {
  if (!isBrowser()) return createSeedSnapshot()

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DatabaseSnapshot>
      // An empty list is now a legitimate state — a fresh install has no
      // solutions — so the shape is all that is checked. Requiring at least one
      // row here would discard a real, deliberately empty database.
      if (Array.isArray(parsed.solutions)) {
        return {
          solutions: parsed.solutions,
          approvals: parsed.approvals ?? [],
          comments: parsed.comments ?? [],
          history: parsed.history ?? [],
          attachments: parsed.attachments ?? [],
        }
      }
    }
  } catch {
    // Corrupt payload — fall through and reseed rather than dying on boot.
  }

  const seeded = createSeedSnapshot()
  save(seeded)
  return seeded
}

function save(snapshot: DatabaseSnapshot): void {
  if (!isBrowser()) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Quota exceeded or storage disabled: keep running from memory.
  }
}

function delay(ms = LATENCY_MS): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

let snapshot: DatabaseSnapshot | null = null

function state(): DatabaseSnapshot {
  snapshot ??= load()
  return snapshot
}

export const db = {
  /** Read a whole table. Returns a defensive copy. */
  async list<T extends TableName>(table: T): Promise<DatabaseSnapshot[T]> {
    await delay()
    return clone(state()[table])
  },

  /**
   * Read the whole store at once. Used by queries that join across tables
   * (a solution plus its approvals, comments, and attachments) — one
   * round-trip instead of four.
   */
  async read(): Promise<DatabaseSnapshot> {
    await delay()
    return clone(state())
  },

  /**
   * Apply a mutation to the store and persist it.
   * The recipe receives the live snapshot; the result is cloned on the way out.
   */
  async transact<R>(recipe: (draft: DatabaseSnapshot) => R): Promise<R> {
    await delay()
    const current = state()
    const result = recipe(current)
    save(current)
    return clone(result)
  },

  /** Drop all local data and reseed. Exposed for the "reset demo data" action. */
  async reset(): Promise<void> {
    await delay(0)
    snapshot = createSeedSnapshot()
    save(snapshot)
  },
}

export type LocalDatabase = typeof db
