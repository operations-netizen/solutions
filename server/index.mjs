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
import dns from 'node:dns'
import dotenv from 'dotenv'
import express from 'express'
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb'

dotenv.config()

const { MONGODB_URI, MONGODB_DB = 'hobu_solutions', API_PORT = 4000 } = process.env

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

const client = await connect()
const database = client.db(MONGODB_DB)
/**
 * File contents live in GridFS, not in the snapshot. An attachment row carries
 * only its metadata plus `/api/files/<id>`, so a snapshot write stays small and a
 * file is never bounded by the 16MB BSON document limit.
 */
const files = new GridFSBucket(database, { bucketName: 'uploads' })
const MAX_FILE_BYTES = 25 * 1024 * 1024
await database.command({ ping: 1 })
console.log(`Connected to MongoDB database "${MONGODB_DB}"`)

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
app.use(cors())
// File bytes go to GridFS via /api/files, never through this body — but a whole
// snapshot of solutions, history and comments still outgrows the 100kb default.
app.use(express.json({ limit: '8mb' }))

app.get('/api/health', async (_req, res) => {
  try {
    await database.command({ ping: 1 })
    res.json({ ok: true, database: MONGODB_DB, version: await readVersion() })
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message })
  }
})

app.get('/api/snapshot', async (_req, res) => {
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
app.put('/api/snapshot', async (req, res) => {
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
app.post('/api/files', (req, res) => {
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
app.delete('/api/files/:id', async (req, res) => {
  try {
    await files.delete(new ObjectId(req.params.id))
    res.status(204).end()
  } catch (error) {
    // Already gone is a success from the caller's point of view.
    if (/FileNotFound/i.test(String(error.message))) return res.status(204).end()
    res.status(400).json({ error: error.message })
  }
})

/** Wipe everything — what the "Reset demo data" button calls. */
app.post('/api/reset', async (_req, res) => {
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

app.listen(Number(API_PORT), () => {
  console.log(`API listening on http://localhost:${API_PORT}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await client.close().catch(() => {})
    process.exit(0)
  })
}
