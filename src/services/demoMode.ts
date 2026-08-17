/**
 * Whether this build is a self-contained demo.
 *
 * Set `VITE_DEMO_MODE=on` and the app needs nothing behind it: the store seeds
 * itself from the demo dataset and sign-in is checked against the directory in the
 * bundle. That is what makes a static host — Vercel, Netlify, an S3 bucket — show
 * the same thing a local install with an API shows.
 *
 * Off by default, and ignored entirely when `VITE_API_URL` is set, so a real
 * deployment cannot accidentally serve demo passwords or seeded rows.
 */

/*
  The API URL is read here rather than imported as `isRemoteStore` from `./db`.
  That import would close a cycle — db → localDatabase → demoMode → db — and a
  `const` read across a circular ESM import throws before it is initialised, which
  shows up as a blank page rather than an error anyone can act on.
*/
const hasApi = Boolean(import.meta.env.VITE_API_URL?.trim())

export const DEMO_MODE = !hasApi && import.meta.env.VITE_DEMO_MODE === 'on'

/**
 * The password every demo account shares. Only meaningful in demo mode, where
 * there is no server to check anything: it exists so the sign-in screen behaves
 * the way it does against a real API, not as a security measure.
 */
export const DEMO_MODE_PASSWORD = 'hobu-demo-2026'
