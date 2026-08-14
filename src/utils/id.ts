/** Id generation. Swapped for server-issued ids once a real backend exists. */

let counter = 0

export function createId(prefix: string): string {
  const globalCrypto = typeof crypto !== 'undefined' ? crypto : undefined
  if (globalCrypto?.randomUUID) return `${prefix}-${globalCrypto.randomUUID()}`
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}
