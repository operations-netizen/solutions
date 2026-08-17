/**
 * Push a demo dataset into the running API.
 *
 * For showing the app to somebody: five solutions placed at different points in
 * the workflow, with approval trails, history and chat that match the state
 * machine rather than being invented. `SEEDS` in `src/data/mockSolutions.ts` stays
 * empty so a real install starts clean — this is opt-in.
 *
 *   npm run seed:demo            append to whatever is already there
 *   npm run seed:demo -- --reset  replace the register with the demo set
 *
 * Appending renumbers the demo rows so they continue after the highest existing
 * SOL-nnn: two solutions sharing a number would be a worse demo than no demo.
 *
 * The dataset is TypeScript that imports from `src/`, so it is bundled with the
 * esbuild that ships with Vite rather than duplicated here in JavaScript.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const API = (process.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')
const EMAIL = process.env.SEED_DEMO_EMAIL ?? 'tarun.gogia@dws.com'
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? process.env.SEED_PASSWORD ?? 'hobu-demo-2026'
const RESET = process.argv.includes('--reset')

async function main() {
  const snapshot = await buildDemoSnapshot()
  const token = await signIn()
  const current = await read(token)

  const existing = RESET ? emptySnapshot() : current
  const merged = merge(existing, snapshot)

  await write(token, current.version, merged)

  // The rows as written, not as built: they were renumbered on the way in, and
  // printing the pre-merge numbers would report numbers that are not in the store.
  const added = merged.solutions.slice(merged.solutions.length - snapshot.solutions.length)

  console.log(
    `${RESET ? 'Replaced' : 'Added'} ${added.length} demo solutions ` +
      `(${merged.solutions.length} in the register now).`,
  )
  for (const solution of added) {
    console.log(`  ${solution.solutionNumber}  ${solution.status.padEnd(22)} ${solution.title}`)
  }
  console.log('\nRemove them again with "Erase all data" in the sidebar, as the HOBU.')
}

/** Bundle the TypeScript dataset and read the snapshot out of it. */
async function buildDemoSnapshot() {
  const dir = mkdtempSync(join(tmpdir(), 'hobu-demo-'))
  const out = join(dir, 'demo.mjs')
  try {
    /*
      esbuild's JS API rather than its executable. On Windows `node_modules/.bin`
      holds a `.cmd` shim, not a binary — spawning it without a shell fails, and
      the real `.exe` sits in a platform-specific package whose path is not ours
      to guess. The API is the same install either way.
    */
    const esbuild = await import('esbuild')
    await esbuild.build({
      entryPoints: ['src/data/demoSeed.ts'],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      alias: { '@': './src' },
      outfile: out,
      logLevel: 'error',
    })
    const { createDemoSnapshot } = await import(`file://${out.replace(/\\/g, '/')}`)
    return createDemoSnapshot()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function emptySnapshot() {
  return { version: 0, solutions: [], approvals: [], comments: [], history: [], attachments: [] }
}

/**
 * Append, renumbering the demo solutions so they continue after what is there.
 * Ids are already unique — only the human-facing number can collide.
 */
function merge(existing, demo) {
  const highest = existing.solutions.reduce((max, solution) => {
    const n = Number(String(solution.solutionNumber).replace(/\D/g, ''))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)

  const solutions = demo.solutions.map((solution, index) => ({
    ...solution,
    solutionNumber: `SOL-${String(highest + index + 1).padStart(3, '0')}`,
  }))

  return {
    solutions: [...existing.solutions, ...solutions],
    approvals: [...existing.approvals, ...demo.approvals],
    comments: [...existing.comments, ...demo.comments],
    history: [...existing.history, ...demo.history],
    attachments: [...existing.attachments, ...demo.attachments],
  }
}

async function signIn() {
  const response = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).catch(() => {
    throw new Error(`Cannot reach the API at ${API}. Start it with "npm run dev:api".`)
  })

  if (!response.ok) {
    throw new Error(
      `Sign-in failed for ${EMAIL} (${response.status}). ` +
        'Set SEED_DEMO_EMAIL and SEED_DEMO_PASSWORD if the demo password has been changed.',
    )
  }
  return (await response.json()).token
}

async function read(token) {
  const response = await fetch(`${API}/api/snapshot`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Reading the snapshot failed (${response.status}).`)
  return response.json()
}

async function write(token, version, tables) {
  const response = await fetch(`${API}/api/snapshot`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ version, tables }),
  })
  if (response.status === 409) {
    throw new Error('Somebody wrote to the database while this was running. Try again.')
  }
  if (!response.ok) throw new Error(`Writing the snapshot failed (${response.status}).`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
