# HOBU Solutions

Solution management for a Head of Business Unit. A solution is raised, discussed,
approved, built, tested, approved again, executed, and closed — and at every point
the HOBU can see exactly where it stands and who is holding it up.

This is a **standalone application today** and a **drop-in CRM module tomorrow**.
It is not a CRM: there are no contacts, leads, campaigns, or deals, and there
never should be.

```
Discussion → Discussion Approval → Development → Development Approval
           → Testing → Testing Approval → Execution → Execution Approval → Completed

reject: Discussion Approval → Discussion      Testing Approval   → Development
        Development Approval → Development     Execution Approval → Execution
```

**Every working stage ends in a gate, and a gate is never passed by hand.** That
makes *Send for approval* the only advance in the application: clearing a gate is
what moves a solution to the next stage, and clearing the last one is what
completes it. No button pushes work into a stage its approvers have not signed
off, and none marks a solution complete.

A rejection returns the solution to the work that produced what was rejected —
except at Testing Approval, which goes back to Development, because a fault found
in testing is fixed by the developer rather than by testing it again.

## Showing it to someone

Nothing needs hosting to demo it. Two processes, one browser:

```bash
npm run dev:api     # the API + MongoDB
npm run dev         # the app, http://localhost:5173
npm run seed:demo   # five solutions spread across the workflow
```

`seed:demo` appends, renumbering its rows so they continue after whatever is
already there, and prints what it added. `--reset` replaces the register instead.
Undo it with **Erase all data** in the sidebar, as the HOBU.

A walkthrough that shows the whole model in about three minutes. It names
solutions rather than numbers, because numbering continues from whatever the
register already held:

1. **Sign in as Tarun Gogia** (Head of Business Unit). The dashboard is the
   overview: where every solution sits, and what is waiting on a decision.
2. **Open "Quote approval takes four days"** — at the Discussion gate, with John
   Doe signed off and Mark Wilson still to decide. The Approvers tab shows the one
   roster, which gate is open, and which are still ahead.
3. **Sign out, sign in as Mark Wilson.** Same solution: **Approve** and **Reject**
   appear on his row and on nobody else's. Approving moves the solution to
   Development by itself — no button does that.
4. **Sign in as Priya Nair** (Manager). Her register is nearly empty: she is not
   looped into these solutions, and *Add Solution* is not hers either.
5. Back as Tarun: **Not feasible** on any solution, with a reason, then **Revoke**
   with a new due date. Voided work leaves the pipeline without losing its history.

"Duplicate contacts on import" carries a rejection in its Activity tab, and
"Territory rules are a spreadsheet" is overdue, if either comes up.

### Demo mode: the same demo with nothing behind it

`VITE_DEMO_MODE=on`, with `VITE_API_URL` unset, makes the build self-contained:
the store seeds itself from the demo dataset and sign-in is checked against the
directory in the bundle. The sign-in screen, the accounts, the gates and the
per-row approval authority all behave as they do against the API — verified by
signing in as Mark Wilson in a demo build and watching his approval move a
solution to Development.

What it is not: shared. Each visitor gets their own copy in their own browser, so
nobody sees anybody else's work, and clearing site data resets it. Attachments
cannot be stored either — there is no GridFS. Demo mode is ignored whenever
`VITE_API_URL` is set, so a real deployment cannot serve seeded rows or a demo
password by accident.

## Deploying it

Two pieces, two hosts: a static bundle and a long-lived API. The API is not
serverless-shaped — it opens one MongoDB connection and one GridFS bucket at boot
and keeps them — so it wants a platform that runs a process, not a function.

**API on Koyeb** (or Render, Fly, Railway — anything that runs a container):

1. Deploy from this repo using the `Dockerfile`. It installs production
   dependencies, copies `server/` plus `src/data/directory.json`, and runs
   `node server/index.mjs`.
2. Environment: `MONGODB_URI`, `MONGODB_DB`, `SEED_PASSWORD`, and
   `ALLOWED_ORIGINS` set to the front end's URL. `PORT` is injected by the
   platform and takes precedence over `API_PORT`.
3. Health check: `GET /api/health` — returns `{ ok, database, version }` without a
   session.
4. Atlas: allow the platform's egress. Koyeb has no static outbound IP on the free
   plan, so this means `0.0.0.0/0` on the IP access list, and therefore a strong
   database password rather than a demo one.

**Front end on Vercel:**

1. `vercel.json` is already here: it builds with `npm run build`, serves `dist`,
   and rewrites every non-asset path to `index.html` so a refresh on
   `/solutions/:id` does not 404.
2. Set `VITE_API_URL` to the API's public URL.
3. Or deploy the demo on its own: set `VITE_DEMO_MODE=on`, leave `VITE_API_URL`
   unset, and the site needs no API and no database at all. See *Demo mode* above
   for what that costs.
3. `VITE_*` variables are inlined into the browser bundle. Never put the
   connection string in one.

**Before a public URL exists**, two things in this repo are demo conveniences and
not safe defaults:

- The sign-in screen ships a hardcoded demo password (`src/App.tsx`) and fills it
  on a click, so anyone with the URL can sign in as the HOBU.
- Solution visibility is enforced in the read hooks, not on the server:
  `GET /api/snapshot` returns everything to any signed-in session.

## Running it

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI
npm run dev:api        # API + MongoDB, http://localhost:4000
npm run dev            # app, http://localhost:5173
npm run build          # typecheck + production bundle
npm run typecheck
npm run check:mongo    # prove the cluster is reachable
```

Two processes: the app in the browser, and an API server that owns the database
connection. **A browser cannot talk to MongoDB** — the driver needs a raw TCP
socket, and any `VITE_*` variable is inlined into the bundle you ship, so a
connection string there would publish the cluster. The credential lives in `.env`
(gitignored) and never leaves `server/`.

| Store | When | Notes |
| --- | --- | --- |
| MongoDB | `VITE_API_URL` is set | Five collections — `solutions`, `approvals`, `comments`, `history`, `attachments` — plus attachment bytes in GridFS (`uploads.*`). |
| `localStorage` | `VITE_API_URL` is unset | The original zero-setup mode; no server needed. Attachment files last only for the session. |

Attachment **contents** never travel in a snapshot. The browser POSTs the file to
`/api/files`, which streams it into GridFS and returns `/api/files/<id>`; the row
stores that path plus the metadata. So a snapshot write stays small, no file is
bounded by the 16MB BSON document limit, and a download still works after a
reload or from another machine. Deleting an attachment deletes its bytes, and the
reset button drops the GridFS collections along with the rest.

### Signing in

On MongoDB the app has a real login. Seven accounts — one per role, plus a second
approver so a gate has a real roster — are seeded into a `users` collection from
`src/data/directory.json` with scrypt-hashed passwords (per-user salt,
constant-time compare). `SEED_PASSWORD` in `.env` sets the initial password.
`directory.json` is authoritative for **who exists**. On each start the server
adds anyone missing, updates changed profile fields, and **removes any account not
in the file — revoking its sessions immediately** — so dropping a person from the
directory actually takes their login away. Passwords are the exception: the hash
lives only in the database and is never rewritten, so nobody is reset to the seed.
Expired sessions are swept at the same time.

The login screen carries a one-click chip per account, built from that same file,
so you can sign in as any role without typing. It is demo scaffolding: delete
`DEMO_ACCOUNTS` / `DEMO_PASSWORD` in `src/App.tsx` and change `SEED_PASSWORD` when
real accounts exist. `POST /api/auth/login` returns a session token, good for a
week, and **every data route requires it**: `/api/snapshot`, `/api/reset`, and file
uploads all answer `401` without one. Wrong password and unknown email return the
same message, so the endpoint cannot be used to enumerate accounts.

Your role decides what you can do — sign in as `rahul.verma@dws.com` and the
"Add Solution" button is gone, because `DEVELOPER` has no `solution:create`. Sign
out from the foot of the sidebar; it reloads the page deliberately, so no cached
query outlives the session.

On `localStorage` there is no login at all: the seeded HOBU is simply who you are,
which keeps the zero-setup mode working. `AuthGate` skips itself when the auth
service has no `signIn`.

`src/services/db/index.ts` picks between them, and both expose the same surface —
no service, hook, or component knows which is live. Data starts empty either way;
the first solution is created through the UI, and the reset button at the foot of
the sidebar clears everything back to that state.

The server stays deliberately dumb: it reads and writes the whole snapshot rather
than modelling the domain, so every workflow rule stays in
`services/solutions/solutionService.ts` instead of being reimplemented in a second
place. Writes are therefore read-modify-write, guarded by a `version` — a stale
write gets a `409` and the client replays it against fresh data. That is sound for
one operator; a genuinely concurrent, multi-user deployment wants an endpoint per
contract method, which is the natural next step and needs no UI change.

If `npm run dev:api` reports `querySrv ECONNREFUSED`, the machine's DNS resolver
is refusing SRV lookups; the server retries via public resolvers automatically and
`MONGODB_DNS_SERVERS` overrides which ones.

The directory ships five users, one per role, which is the minimum that still
exercises the whole workflow: the HOBU raises a solution, a developer builds it,
QA tests it, and an approver signs off at both gates. To seed sample solutions
again, add `SolutionSeed` objects to `SEEDS` in `src/data/mockSolutions.ts`; the
builder there gives each one a consistent approval trail, history, and chat.

Light mode only, by design — there is no dark palette and no theme toggle.

## Architecture

The whole point of the layering is that **integration touches one layer**.

```
  components/ pages/ hooks/      ← UI. Knows about types and hooks. Nothing else.
          ↓ (talks only to)
  services/contracts.ts          ← interfaces. THE integration seam.
          ↓ (implemented by)
  services/**/…                  ← local implementations, swappable per service
          ↓
  services/db/index.ts           ← picks the store
   ├── localDatabase.ts          ← the only file that knows about localStorage
   └── remoteDatabase.ts         ← the only file that knows about the API
```

| Path | Responsibility |
| --- | --- |
| `src/types/` | Domain shapes. No React, no transport. |
| `src/utils/workflow.ts` | The state machine. Every transition is validated here. |
| `src/utils/solution.ts` | Pure derivations: approval roll-up, overdue, filtering, sorting. |
| `src/utils/permissions.ts` | Role → permission table. |
| `src/utils/validation.ts` | Zod schemas, shared by every form. |
| `src/services/contracts.ts` | Interfaces the host implements. |
| `src/services/` | Local implementations of those interfaces. |
| `src/hooks/` | TanStack Query bindings + cache invalidation + notification emission. |
| `src/components/solutions/` | Every solution-specific component. |
| `src/pages/` | Thin route wrappers over components. |
| `src/routes/` | Route config, exported in two shapes. |
| `src/providers/` | `SolutionsModuleProvider` — the entry point. |
| `src/module.ts` | The public API. This is what the CRM imports. |

Rules the code actually follows:

- No mock data is imported by any component. `src/data/` is read only by services.
- No component calls a service directly — always through a hook, always through
  the injected container.
- No code assigns `solution.status` outside `solutionService`, and
  `solutionService` never assigns it without `assertTransition`.
- No component checks `role === 'HOBU'`. It checks `can('solution:approve')`.
- **Who can see a solution:** the people looped into it — the assignee, whoever
  raised it, and its approvers — plus `solution:viewAll` (HOBU). Applied in the
  read hooks as a filter, so lists, tab counts and dashboard tiles all show the
  same set the detail page will open. It is a UI boundary, not a security one:
  `GET /api/snapshot` returns everything to any signed-in session, so enforcing
  this for real means filtering server-side.
- **Raising** a solution is `solution:create`, held only by the HOBU.
- Advancing the workflow is gated on **ownership**, not only permission: the
  assignee may always move their own solution, and only `solution:override`
  (HOBU) may move somebody else's.
- No component builds a URL string. It calls `usePaths()`.

## The workflow

`src/utils/workflow.ts` holds a single transition table. Anything not in it is
unreachable:

| From | To | How |
| --- | --- | --- |
| `DISCUSSION` | `DISCUSSION_APPROVAL` | advance |
| `DISCUSSION_APPROVAL` | `DEVELOPMENT` | all approvers approve |
| `DISCUSSION_APPROVAL` | `DISCUSSION` | any approver rejects |
| `DEVELOPMENT` | `TESTING` | advance |
| `TESTING` | `TESTING_APPROVAL` | advance |
| `TESTING_APPROVAL` | `EXECUTION` | all approvers approve |
| `TESTING_APPROVAL` | `DEVELOPMENT` | any approver rejects |
| `EXECUTION` | `COMPLETED` | advance |

Enforced rules:

- A new solution is **always** created in `DISCUSSION`. No parameter changes that.
- `updateSolutionStatus` rejects any transition that is not an `advance` — you
  cannot leave an approval gate except by recording a decision.
- Entering a gate with no approver on the roster throws.
- Re-entering a gate clears the previous decisions; the rejection stays in history.
- A gate opens only when **every** approver has approved. One rejection sends it
  back immediately, and a rejection without a reason is refused at both the schema
  and the service layer.
- `COMPLETED` is terminal: edits and transitions are refused, and the UI renders
  read-only.

Every one of these writes an entry to the activity timeline.

## Embedding in the CRM

`src/module.ts` is the public surface. Copy `src/` in as
`crm/src/modules/solutions/`, or publish it as a package — either way the import
looks the same.

### 1. Implement the services you want to take over

```ts
import type { SolutionService, SolutionsServices } from '@/modules/solutions'

const crmSolutionService: SolutionService = {
  getSolutions: (filters) => api.get('/solutions', { params: filters }),
  getSolution: (id) => api.get(`/solutions/${id}`),
  createSolution: (input) => api.post('/solutions', input),
  updateSolution: (id, data) => api.patch(`/solutions/${id}`, data),
  updateSolutionStatus: (id, status) => api.post(`/solutions/${id}/status`, { status }),
  approveSolution: (id, input) => api.post(`/solutions/${id}/approve`, input),
  rejectSolution: (id, input) => api.post(`/solutions/${id}/reject`, input),
  getSolutionHistory: (id) => api.get(`/solutions/${id}/history`),
  getSolutionApprovals: (id) => api.get(`/solutions/${id}/approvals`),
  getStats: () => api.get('/solutions/stats'),
}
```

Anything you don't override keeps the local implementation, so you can migrate one
service at a time — start with `users` and `auth`, finish with `solutions`.

### 2. Mount it as the Solutions tab

```tsx
import {
  SolutionsModuleProvider,
  SolutionsRoutes,
  toCurrentUser,
} from '@/modules/solutions'

function SolutionsTab() {
  const crmUser = useCrmSession()

  return (
    <SolutionsModuleProvider
      currentUser={toCurrentUser(crmUser)}
      services={{ solutions: crmSolutionService, users: crmDirectory }}
      notificationAdapter={{ notify: (p) => crmNotifications.push(p) }}
      basePath="/crm/solutions"
      withQueryClient={false}      // the CRM already renders QueryClientProvider
    >
      <SolutionsRoutes />
    </SolutionsModuleProvider>
  )
}
```

`basePath` is what every internal link is built from, so the module works at any
mount point without touching a component.

If the CRM owns routing, skip `SolutionsRoutes` and mount the pages directly —
`SolutionsPage`, `SolutionDetails`, `CompletedSolutionsPage` are all exported.
`SolutionDetails` takes a `solutionId` prop and needs no router at all, which is
what you want if the CRM opens solutions in a drawer.

### 3. Authentication and roles

The module never asks how the user was authenticated. Either pass `currentUser`
directly, or supply an `AuthService`. Roles map to permissions in
`ROLE_PERMISSIONS`; adding a role is one row in that table, because no component
branches on a role name.

### 4. Notifications

Business code emits domain events — `SOLUTION_CREATED`, `APPROVAL_REQUESTED`,
`SOLUTION_REJECTED`, and the rest — and an adapter decides what to do with them.
Standalone that is a toast. In the CRM, pass an adapter that forwards to the CRM's
notification bus.

### 5. Chat and attachments

`ChatService` has an optional `subscribe(solutionId, onMessage)`. The local
implementation fans out in-process; a Socket.IO implementation pushes live
messages through the same call and the UI updates without any component change.

`AttachmentService.upload` returns the stored `fileUrl`. Locally that is an object
URL; a real implementation uploads the blob and returns a storage URL. Nothing
else moves.

## What is deliberately left out

`App.tsx`, `main.tsx`, and `components/layout/` are the standalone shell — the
router, the sidebar, the mobile header. They do **not** travel to the CRM, which
brings its own chrome. Everything under `components/solutions/`, `pages/`, `hooks/`,
`services/`, `types/`, and `utils/` does.
