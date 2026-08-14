/**
 * Connectivity probe for the configured cluster. Reads `.env` via dotenv and
 * never prints the credential.
 *
 * Mirrors what the server does on startup: try the URI as given, and if the SRV
 * lookup is refused — Node resolves SRV through c-ares against the system
 * nameserver, which some networks reject even when ordinary name resolution
 * works — retry through public resolvers.
 */
import dns from 'node:dns'
import dotenv from 'dotenv'
import { MongoClient } from 'mongodb'

dotenv.config()

const { MONGODB_URI, MONGODB_DB = 'hobu_solutions' } = process.env

if (!MONGODB_URI) {
  console.error('MONGODB_URI is missing. Copy .env.example to .env and fill it in.')
  process.exit(1)
}

async function attempt(label) {
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
  try {
    await client.connect()
    const ping = await client.db('admin').command({ ping: 1 })
    const names = (await client.db(MONGODB_DB).listCollections().toArray()).map((c) => c.name)
    console.log(`${label}: CONNECTED  ping=${JSON.stringify(ping)}  collections=[${names.join(', ')}]`)
    return true
  } catch (error) {
    console.log(`${label}: failed — ${String(error.message).slice(0, 160)}`)
    return false
  } finally {
    await client.close().catch(() => {})
  }
}

if (!(await attempt('system resolver'))) {
  const resolvers = (process.env.MONGODB_DNS_SERVERS ?? '8.8.8.8,1.1.1.1').split(',')
  dns.setServers(resolvers)
  const ok = await attempt(`via ${resolvers.join(', ')}`)
  process.exitCode = ok ? 0 : 1
}
