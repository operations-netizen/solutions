/** Reads the cluster directly, to confirm what the app actually persisted. */
import dns from 'node:dns'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config()
dns.setServers(['8.8.8.8', '1.1.1.1'])

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
await client.connect()
const db = client.db(process.env.MONGODB_DB)

for (const name of ['solutions', 'approvals', 'comments', 'history', 'attachments', 'uploads.files', 'uploads.chunks', 'meta']) {
  const docs = await db.collection(name).find({}).toArray()
  console.log(`\n${name}: ${docs.length} document(s)`)
  for (const doc of docs.slice(0, 3)) {
    if (name === 'solutions') {
      console.log(`  ${doc.solutionNumber} "${doc.title}" — ${doc.status}, assigned ${doc.assignedUserId}, team ${doc.assignedTeam}`)
    } else if (name === 'approvals') {
      console.log(`  ${doc.stage} ${doc.approverId} — ${doc.status}`)
    } else if (name === 'comments') {
      console.log(`  ${doc.userId}: ${doc.message}`)
    } else if (name === 'history') {
      console.log(`  ${doc.action}: ${doc.description}`)
    } else if (name === 'uploads.files') {
      console.log(`  ${doc.filename} — ${doc.length} bytes, ${doc.metadata?.contentType ?? doc.contentType ?? '?'}`)
    } else if (name === 'uploads.chunks') {
      console.log(`  chunk of ${doc.files_id}, ${doc.data?.length() ?? '?'} bytes`)
    } else {
      console.log(`  ${JSON.stringify(doc).slice(0, 90)}`)
    }
  }
  if (docs.length > 3) console.log(`  … ${docs.length - 3} more`)
}
await client.close()
