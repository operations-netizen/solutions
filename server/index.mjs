/**
 * API server — the only process that holds the database credentials.
 *
 * The browser cannot speak to MongoDB: the driver needs a raw TCP socket, and
 * anything reachable from a Vite bundle is public, so a connection string in the
 * frontend would publish the cluster. This server sits between them.
 *
 * It deliberately stays dumb. Every workflow rule — the state machine, approval
 * roll-up, history — lives in `src/services/solutions/solutionService.ts` and
 * stays there; this exposes the same snapshot-read / snapshot-write store that
 * `localDatabase` did, backed by five real collections instead of localStorage.
 * That keeps the domain in one place rather than reimplementing it here, at the
 * cost of read-modify-write writes (see the `version` check below).
 */

import cors from 'cors'
import crypto from 'node:crypto'
import dns from 'node:dns'
import dotenv from 'dotenv'
import express from 'express'
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb'

import directory from '../src/data/directory.json' with { type: 'json' }

dotenv.config()

const {
  MONGODB_URI,
  MONGODB_DB = 'hobu_solutions',
  API_PORT = 4000,
  /**
   * Set by the platform, not by us.
   *
   * Koyeb, Render, Fly and friends inject `PORT` and health-check that exact port;
   * a service listening anywhere else looks dead to them and is killed. `API_PORT`
   * stays as the local default so nothing changes for `npm run dev:api`.
   */
  PORT,
  /** Password given to every seeded user on first run. Change it in .env. */
  SEED_PASSWORD = 'hobu-demo-2026',
  /**
   * Comma-separated origins allowed to call this API — the deployed front end.
   * Unset means any origin, which is right for local development and wrong for a
   * public deployment.
   */
  ALLOWED_ORIGINS,
} = process.env

const LISTEN_PORT = Number(PORT ?? API_PORT)

if (!MONGODB_URI) {
  console.error('MONGODB_URI is missing. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

/** The five tables the app stores, mirrored one-to-one as collections. */
const TABLES = ['solutions', 'approvals', 'comments', 'history', 'attachments']
const META_ID = 'snapshot'

/**
 * Atlas connection strings are `mongodb+srv://`, which needs a DNS SRV lookup.
 * Node resolves SRV through c-ares against the machine's configured nameserver,
 * and some setups (this one included) refuse those queries even though ordinary
 * name resolution works. Falling back to a public resolver fixes it without
 * touching the URI. Override with MONGODB_DNS_SERVERS if your network needs it.
 */
async function connect() {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
  try {
    await client.connect()
    return client
  } catch (error) {
    if (!/querySrv|ECONNREFUSED|EAI_AGAIN|ENOTFOUND/.test(String(error.message))) throw error
    await client.close().catch(() => {})

    const resolvers = (process.env.MONGODB_DNS_SERVERS ?? '8.8.8.8,1.1.1.1').split(',')
    console.warn(`SRV lookup failed via the system resolver; retrying via ${resolvers.join(', ')}`)
    dns.setServers(resolvers)

    const retry = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
    await retry.connect()
    return retry
  }
}

/**
 * Turn a connection failure into an instruction.
 *
 * On a hosted platform this is the only thing anybody sees: the process dies at
 * boot and the dashboard reports "unhealthy". A driver stack trace does not
 * mention that the cause is usually one of two settings.
 */
function explain(error) {
  const message = String(error?.message ?? error)
  if (/bad auth|Authentication failed/i.test(message)) {
    return 'MongoDB rejected the credentials. Check the user and password in MONGODB_URI (a password with @ : / ? # needs percent-encoding).'
  }
  if (/IP that isn't whitelisted|not allowed to access|ETIMEDOUT|ServerSelectionTimeout|timed out/i.test(message)) {
    return "MongoDB was unreachable. Atlas only accepts connections from allowlisted addresses, and a host without a static outbound IP needs 0.0.0.0/0 on the cluster's IP access list."
  }
  if (/querySrv|EAI_AGAIN|ENOTFOUND/i.test(message)) {
    return 'The cluster hostname did not resolve. Check the host in MONGODB_URI, or set MONGODB_DNS_SERVERS if this network blocks SRV lookups.'
  }
  return null
}

let client
try {
  client = await connect()
} catch (error) {
  console.error('Could not connect to MongoDB.')
  const hint = explain(error)
  if (hint) console.error(hint)
  console.error(error?.message ?? error)
  process.exit(1)
}
const database = client.db(MONGODB_DB)
/**
 * File contents live in GridFS, not in the snapshot. An attachment row carries
 * only its metadata plus `/api/files/<id>`, so a snapshot write stays small and a
 * file is never bounded by the 16MB BSON document limit.
 */
const files = new GridFSBucket(database, { bucketName: 'uploads' })
const MAX_FILE_BYTES = 25 * 1024 * 1024

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

/** Sessions last a working week; a longer-lived token is a liability. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * scrypt rather than bcrypt so there is no native dependency to build, and it is
 * what `node:crypto` offers for password hashing. Per-user salt, and the compare
 * is constant-time — a plain `===` on hashes leaks timing information.
 */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

function passwordMatches(password, record) {
  if (!record?.passwordSalt || !record?.passwordHash) return false
  const { hash } = hashPassword(password, record.passwordSalt)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(record.passwordHash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Never let a hash or salt leave the server, even to an authenticated caller. */
function publicUser(record) {
  if (!record) return null
  const { passwordHash, passwordSalt, _id, ...rest } = record
  return rest
}

/**
 * Reconcile the `users` collection with `directory.json` on every start.
 *
 * The file is authoritative for *who exists* and for their profile fields:
 * someone added there gets a login, someone renamed there is renamed, and
 * someone **removed there loses their account and any live session**. Without
 * that last part a person dropped from the directory would keep signing in
 * indefinitely, which is the kind of gap nobody notices until it matters.
 *
 * Credentials are the exception: the password hash lives only in the database and
 * is never written here, so a changed password is never reset to the seed.
 */
async function seedUsers() {
  const users = database.collection('users')
  const present = new Set(
    (await users.find({}, { projection: { _id: 1 } }).toArray()).map((row) => row._id),
  )

  const missing = directory.users.filter((user) => !present.has(user.id))
  if (missing.length > 0) {
    await users.insertMany(
      missing.map((user) => {
        // A salt per account, so two users sharing the seed password do not
        // share a hash.
        const { salt, hash } = hashPassword(SEED_PASSWORD)
        return { _id: user.id, ...user, passwordSalt: salt, passwordHash: hash }
      }),
    )
    console.log(`Seeded ${missing.length} user(s) with the seed password`)
  }

  // Profile fields only: `$set` never mentions passwordHash or passwordSalt.
  const existing = directory.users.filter((user) => present.has(user.id))
  if (existing.length > 0) {
    const changes = await users.bulkWrite(
      existing.map(({ id, ...profile }) => ({
        updateOne: { filter: { _id: id }, update: { $set: profile } },
      })),
    )
    if (changes.modifiedCount > 0) {
      console.log(`Updated ${changes.modifiedCount} user profile(s) from directory.json`)
    }
  }

  /*
    Anyone in the collection but not in the file is removed, along with their
    sessions so the revocation is immediate rather than lasting until expiry.
  */
  const allowed = new Set(directory.users.map((user) => user.id))
  const strays = [...present].filter((id) => !allowed.has(id))

  if (strays.length > 0) {
    // Solutions reference users by id, so say plainly what will dangle.
    const referenced = await database.collection('solutions').countDocuments({
      $or: [{ assignedUserId: { $in: strays } }, { createdBy: { $in: strays } }],
    })

    await database.collection('users').deleteMany({ _id: { $in: strays } })
    const { deletedCount } = await database
      .collection('sessions')
      .deleteMany({ userId: { $in: strays } })

    console.warn(
      `Removed ${strays.length} user(s) absent from directory.json: ${strays.join(', ')}` +
        ` (${deletedCount} session(s) revoked)`,
    )
    if (referenced > 0) {
      console.warn(
        `  ${referenced} solution(s) still reference a removed user by id; ` +
          'their name will render as the raw id.',
      )
    }
  }

  /*
    Expired sessions are only dropped when someone tries to use one, so they
    otherwise sit in the collection for a week. Sweeping them on start keeps the
    session list a list of who is actually signed in.
  */
  const { deletedCount: expired } = await database
    .collection('sessions')
    .deleteMany({ expiresAt: { $lt: new Date() } })
  if (expired > 0) console.log(`Swept ${expired} expired session(s)`)

  const total = present.size + missing.length - strays.length
  console.log(`Directory: ${total} users`)
  return total
}

/** Resolves the bearer token to a user, or null. Expired sessions are dropped. */
async function userForRequest(req) {
  const header = req.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null

  const session = await database.collection('sessions').findOne({ _id: token })
  if (!session) return null

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await database.collection('sessions').deleteOne({ _id: token })
    return null
  }

  return publicUser(await database.collection('users').findOne({ _id: session.userId }))
}

/** Express middleware: 401 unless the request carries a live session. */
async function requireSession(req, res, next) {
  try {
    const user = await userForRequest(req)
    if (!user) return res.status(401).json({ error: 'Not signed in' })
    req.user = user
    next()
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}
await database.command({ ping: 1 })
console.log(`Connected to MongoDB database "${MONGODB_DB}"`)
await seedUsers()

/** Documents carry their own `id`; Mongo's `_id` is never sent to the client. */
const WITHOUT_MONGO_ID = { projection: { _id: 0 } }

async function readVersion() {
  const meta = await database.collection('meta').findOne({ _id: META_ID })
  return meta?.version ?? 0
}

async function readSnapshot() {
  const [version, ...tables] = await Promise.all([
    readVersion(),
    ...TABLES.map((name) => database.collection(name).find({}, WITHOUT_MONGO_ID).toArray()),
  ])
  return { version, ...Object.fromEntries(TABLES.map((name, i) => [name, tables[i]])) }
}

const app = express()
/*
  Auth rides an `Authorization` header rather than cookies, so a wildcard origin
  does not expose an authenticated session to another site the way it would with
  credentials. It still tells any page it may read responses, so a deployment
  names its front end explicitly.
*/
const allowedOrigins = (ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(
  cors(
    allowedOrigins.length === 0
      ? undefined
      : {
          origin(origin, callback) {
            // No Origin header at all: curl, health checks, same-origin requests.
            if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
            /*
              Declined by omitting the header, not by throwing. Throwing turns a
              disallowed origin into a 500 with a stack trace in the logs, when the
              browser was going to block the response on the missing header anyway.
            */
            callback(null, false)
          },
        },
  ),
)
// File bytes go to GridFS via /api/files, never through this body — but a whole
// snapshot of solutions, history and comments still outgrows the 100kb default.
app.use(express.json({ limit: '8mb' }))

/*
  Platforms default their HTTP health check to `/`, and a 404 there reads as a dead
  service. Answering it also gives a human opening the API's URL something other
  than "Cannot GET /".
*/
app.get('/', (_req, res) => {
  res.json({ service: 'hobu-solutions-api', health: '/api/health' })
})

app.get('/api/health', async (_req, res) => {
  try {
    await database.command({ ping: 1 })
    res.json({ ok: true, database: MONGODB_DB, version: await readVersion() })
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message })
  }
})


/* ------------------------------------------------------------------ */
/* Auth routes                                                         */
/* ------------------------------------------------------------------ */

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body ?? {}
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' })
  }

  try {
    const record = await database
      .collection('users')
      .findOne({ email: email.trim().toLowerCase() })

    /*
      One message for "no such user" and "wrong password" both: distinguishing
      them tells an attacker which addresses are real.
    */
    if (!record || !passwordMatches(password, record)) {
      return res.status(401).json({ error: 'Those credentials do not match an account.' })
    }

    const token = crypto.randomBytes(32).toString('hex')
    await database.collection('sessions').insertOne({
      _id: token,
      userId: record._id,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    })

    res.json({ token, user: publicUser(record) })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/auth/session', requireSession, (req, res) => {
  res.json({ user: req.user })
})

app.post('/api/auth/logout', async (req, res) => {
  const header = req.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  // Signing out is idempotent: an unknown token is already signed out.
  if (token) await database.collection('sessions').deleteOne({ _id: token }).catch(() => {})
  res.status(204).end()
})

/** The directory, from the database rather than the frontend bundle. */
app.get('/api/users', requireSession, async (_req, res) => {
  try {
    const users = await database.collection('users').find({}).toArray()
    res.json({
      users: users.map(publicUser).sort((a, b) => a.name.localeCompare(b.name)),
      teams: directory.teams,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/snapshot', requireSession, async (_req, res) => {
  try {
    res.json(await readSnapshot())
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * Replace the store wholesale, guarded by a version.
 *
 * The client sends the version it read; a mismatch means somebody else wrote in
 * between, so the write is refused with 409 and the current snapshot. The client
 * refetches and replays its change rather than silently clobbering.
 */
app.put('/api/snapshot', requireSession, async (req, res) => {
  const { version, tables } = req.body ?? {}

  if (typeof version !== 'number' || !tables) {
    return res.status(400).json({ error: 'Body must be { version: number, tables: {...} }' })
  }

  try {
    const current = await readVersion()
    if (current !== version) {
      return res.status(409).json({ error: 'Snapshot is stale', snapshot: await readSnapshot() })
    }

    for (const name of TABLES) {
      const documents = Array.isArray(tables[name]) ? tables[name] : []
      const collection = database.collection(name)
      await collection.deleteMany({})
      if (documents.length > 0) {
        // `id` is the domain key; mirroring it into `_id` makes the documents
        // readable in Atlas and stops duplicates on a replayed write.
        await collection.insertMany(documents.map((doc) => ({ _id: doc.id, ...doc })))
      }
    }

    const next = current + 1
    await database
      .collection('meta')
      .updateOne({ _id: META_ID }, { $set: { version: next, updatedAt: new Date() } }, { upsert: true })

    res.json({ version: next })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * Receives one file as a raw body — `Content-Type` carries the MIME type and
 * `X-File-Name` the name. Raw rather than multipart so no parser dependency is
 * needed for a single-file upload, and the request streams straight into GridFS
 * instead of being buffered whole.
 */
app.post('/api/files', requireSession, (req, res) => {
  const fileName = decodeURIComponent(req.get('x-file-name') ?? 'upload')
  const contentType = req.get('content-type') ?? 'application/octet-stream'

  /*
    The MIME type goes in `metadata`, not the driver's legacy `contentType`
    option, which driver 7 no longer persists — files came back as
    application/octet-stream regardless of what was uploaded.
  */
  const upload = files.openUploadStream(fileName, { contentType, metadata: { contentType } })
  let bytes = 0
  let aborted = false

  req.on('data', (chunk) => {
    bytes += chunk.length
    if (bytes > MAX_FILE_BYTES && !aborted) {
      aborted = true
      upload.abort().catch(() => {})
      res.status(413).json({ error: `${fileName} is larger than the 25 MB limit.` })
    }
  })

  req.on('error', () => {
    if (!aborted) {
      aborted = true
      upload.abort().catch(() => {})
      res.status(400).json({ error: 'The upload was interrupted.' })
    }
  })

  upload.on('error', (error) => {
    if (!aborted) {
      aborted = true
      res.status(500).json({ error: error.message })
    }
  })

  upload.on('finish', () => {
    if (aborted) return
    // Relative on purpose: the row stays valid if the API moves host or port.
    res.status(201).json({ id: String(upload.id), url: `/api/files/${upload.id}`, size: bytes })
  })

  req.pipe(upload)
})

/*
  Deliberately not behind `requireSession`: this URL is used as a plain `<a href>`
  download, which cannot carry an Authorization header. The id is an unguessable
  ObjectId, so it is a capability URL — good enough for attachments here, but a
  deployment holding sensitive files wants signed, expiring links instead.
*/
/** Streams a stored file back, named so the browser saves it correctly. */
app.get('/api/files/:id', async (req, res) => {
  let id
  try {
    id = new ObjectId(req.params.id)
  } catch {
    return res.status(400).json({ error: 'Malformed file id' })
  }

  try {
    const [record] = await database.collection('uploads.files').find({ _id: id }).toArray()
    if (!record) return res.status(404).json({ error: 'File not found' })

    res.setHeader(
      'Content-Type',
      record.metadata?.contentType ?? record.contentType ?? 'application/octet-stream',
    )
    res.setHeader('Content-Length', record.length)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(record.filename)}`,
    )

    const download = files.openDownloadStream(id)
    download.on('error', () => res.destroy())
    download.pipe(res)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/** Called when an attachment row is deleted, so the bytes do not outlive it. */
app.delete('/api/files/:id', requireSession, async (req, res) => {
  try {
    await files.delete(new ObjectId(req.params.id))
    res.status(204).end()
  } catch (error) {
    // Already gone is a success from the caller's point of view.
    if (/FileNotFound/i.test(String(error.message))) return res.status(204).end()
    res.status(400).json({ error: error.message })
  }
})

/**
 * Wipe the solution data — what the "Reset demo data" button calls.
 * Users and sessions are not touched: resetting the demo must not sign you out
 * or delete the accounts you log in with.
 */
app.post('/api/reset', requireSession, async (_req, res) => {
  try {
    await Promise.all(TABLES.map((name) => database.collection(name).deleteMany({})))
    // Drop the file bytes as well; metadata alone would leave orphaned chunks.
    await files.drop().catch(() => {})
    const next = (await readVersion()) + 1
    await database
      .collection('meta')
      .updateOne({ _id: META_ID }, { $set: { version: next, updatedAt: new Date() } }, { upsert: true })
    res.json({ version: next })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// `0.0.0.0` explicitly: a container that binds only to loopback is unreachable
// from outside itself, which reads as a failed deploy rather than a bound port.
app.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`API listening on port ${LISTEN_PORT}`)
  console.log(
    allowedOrigins.length === 0
      ? 'CORS: any origin (set ALLOWED_ORIGINS before deploying publicly)'
      : `CORS: ${allowedOrigins.join(', ')}`,
  )
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await client.close().catch(() => {})
    process.exit(0)
  })
}
