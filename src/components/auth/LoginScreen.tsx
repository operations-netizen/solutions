import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Workflow,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { CurrentUser } from '@/types/user'

export interface DemoAccount {
  label: string
  name: string
  email: string
}

interface LoginScreenProps {
  onSignIn: (email: string, password: string) => Promise<CurrentUser>
  onSignedIn: (user: CurrentUser) => void
  /** One-click accounts. Omit them and the panel disappears with them. */
  demoAccounts?: DemoAccount[]
  /** The password those accounts share. */
  demoPassword?: string
}

/**
 * Film grain, inline so it costs no request. At 4% it is invisible as texture but
 * stops the wide gradients from banding — most of what separates a flat panel
 * from one that looks finished.
 */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")"

export function LoginScreen({
  onSignIn,
  onSignedIn,
  demoAccounts = [],
  demoPassword,
}: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submitRef = useRef<HTMLButtonElement>(null)
  /**
   * Focusing the submit button has to wait for the render that fills the fields:
   * until then it is still `disabled`, and a disabled button cannot take focus.
   */
  const [focusSubmit, setFocusSubmit] = useState(false)

  useEffect(() => {
    if (!focusSubmit) return
    submitRef.current?.focus()
    setFocusSubmit(false)
  }, [focusSubmit])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      onSignedIn(await onSignIn(email.trim(), password))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  /*
    Fills the credentials and stops there — signing in stays a deliberate act.
    Focus moves to the submit button so the next keystroke or tap completes it.
  */
  function fillFrom(account: DemoAccount) {
    if (!demoPassword) return
    setError(null)
    setEmail(account.email)
    setPassword(demoPassword)
    setFocusSubmit(true)
  }

  /** Shared field treatment: taller, softer, with a tinted focus glow. */
  const field =
    'h-11 rounded-xl border-slate-200/80 bg-white/70 pl-11 shadow-sm transition-shadow focus-visible:shadow-[0_0_0_4px_hsl(243_75%_51%/0.12)]'

  return (
    /*
      Exactly one viewport tall on desktop, so the page itself never scrolls. If a
      very short window still cannot fit the card, the form column scrolls rather
      than the whole layout, which keeps the showcase panel fixed.
    */
    <div className="relative min-h-screen overflow-hidden bg-[#0a0e1f] lg:grid lg:h-screen lg:grid-cols-[1.15fr_1fr]">
      <ShowcasePanel />

      {/* Form side. Its own light surface, so the eye lands here first. */}
      <main className="relative flex items-center justify-center px-4 py-10 sm:px-8 lg:h-screen lg:overflow-y-auto lg:bg-gradient-to-br lg:from-[#f4f6ff] lg:via-[#e9ecfb] lg:to-[#dcdff7] lg:py-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden lg:block"
          style={{
            background:
              'radial-gradient(34rem 26rem at 18% -10%, hsl(243 75% 51% / 0.28), transparent 68%),' +
              'radial-gradient(30rem 26rem at 112% 45%, hsl(268 83% 58% / 0.24), transparent 64%),' +
              'radial-gradient(32rem 24rem at 45% 115%, hsl(224 76% 48% / 0.20), transparent 66%),' +
              'radial-gradient(20rem 16rem at 85% 105%, hsl(199 89% 48% / 0.14), transparent 70%)',
          }}
        />

        <div className="relative w-full max-w-[26rem]">
          {/* The brand repeats here only where the showcase is hidden. */}
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-primary text-primary-foreground shadow-lg shadow-primary/30">
              <Workflow className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-white">HOBU Solutions</span>
              <span className="block text-[11px] text-white/60">Solution management</span>
            </span>
          </div>

          {/*
            Glass rather than a plain card: a translucent surface over the wash
            behind it, a bright inner edge, and a long tinted shadow.
          */}
          <div className="animate-fade-in rounded-3xl border border-white/70 bg-white/85 p-6 shadow-[0_28px_80px_-28px_rgba(24,20,80,0.45)] backdrop-blur-xl sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
                Welcome back
              </h1>
              {/* The badge rides beside the heading rather than above it, which
                  costs no extra vertical space. */}
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                <ShieldCheck className="h-3 w-3" />
                Secure
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Sign in to pick up the solutions waiting on you.
            </p>

            {/*
              Autofill is switched off deliberately. The demo chips below are the
              intended way in, and a saved credential for another site kept
              landing in these fields and masking which account was loaded.
              `autoComplete="off"` alone is advisory — Chrome ignores it on
              anything it reads as a login — so the password field claims to be a
              *new* password, which it does honour, and the password-manager
              opt-out attributes cover 1Password, LastPass and Dashlane.
            */}
            <form
              onSubmit={handleSubmit}
              className="mt-5 space-y-3.5"
              noValidate
              autoComplete="off"
            >
              <div className="space-y-1.5">
                <Label htmlFor="login-email" className="text-xs font-semibold text-foreground/80">
                  Work email
                </Label>
                <div className="relative">
                  <Mail
                    aria-hidden
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-lpignore="true"
                    data-1p-ignore
                    data-form-type="other"
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@dws.com"
                    className={field}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="login-password"
                  className="text-xs font-semibold text-foreground/80"
                >
                  Password
                </Label>
                <div className="relative">
                  <Lock
                    aria-hidden
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="login-password"
                    type={revealed ? 'text' : 'password'}
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-1p-ignore
                    data-form-type="other"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={cn(field, 'pr-12')}
                  />
                  {/*
                    A reveal toggle rather than a permanently visible field: it
                    helps with a typo without leaving the password on screen.
                  */}
                  <button
                    type="button"
                    onClick={() => setRevealed((current) => !current)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={revealed ? 'Hide password' : 'Show password'}
                  >
                    {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/*
                One message for a wrong address and a wrong password, because the
                server deliberately does not distinguish them.
              */}
              {error && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200"
                >
                  {error}
                </p>
              )}

              {/*
                The one action on the screen, and it looks like it: gradient fill,
                a lit top edge, and a tinted shadow that deepens on hover.
              */}
              <button
                ref={submitRef}
                type="submit"
                disabled={busy || !email || !password}
                className={cn(
                  'group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl',
                  'bg-gradient-to-b from-indigo-500 to-primary text-sm font-semibold text-primary-foreground',
                  'shadow-[0_10px_30px_-10px_hsl(243_75%_51%/0.65)] transition-all',
                  'hover:shadow-[0_14px_36px_-10px_hsl(243_75%_51%/0.75)] hover:brightness-110',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
                )}
              >
                <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-white/40" />
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Sign in
                {!busy && (
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                )}
              </button>
            </form>

            {demoAccounts.length > 0 && demoPassword && (
              <DemoAccounts
                accounts={demoAccounts}
                selected={email}
                disabled={busy}
                onPick={fillFrom}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

/**
 * The showcase half: a deep mesh gradient with the product shown rather than
 * described. The mock is a still of the real thing — the same status pill,
 * progress bar, and approval roll-up the app renders.
 */
function ShowcasePanel() {
  return (
    <aside className="relative hidden overflow-hidden px-12 py-14 lg:flex lg:flex-col xl:px-16">
      {/* Mesh: three wide colour fields layered, rather than one flat fill. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(48rem 34rem at 8% -10%, #4f46e5 0%, transparent 58%),' +
            'radial-gradient(40rem 34rem at 100% 8%, #7c3aed 0%, transparent 55%),' +
            'radial-gradient(46rem 40rem at 62% 112%, #1d4ed8 0%, transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
      />

      <div className="relative flex items-center gap-3 text-white">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/20 backdrop-blur">
          <Workflow className="h-5 w-5" />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold">HOBU Solutions</span>
          <span className="block text-xs text-white/60">Solution management</span>
        </span>
      </div>

      <div className="relative flex flex-1 flex-col justify-center pt-10">
        <h2 className="max-w-xl text-[2.6rem] font-semibold leading-[1.14] tracking-[-0.03em] text-white">
          Complex problems.
          <br />
          Clear solutions.
          <br />
          {/* The payoff line carries the gradient, as the closing beat. */}
          <span className="bg-gradient-to-r from-white to-indigo-200 bg-clip-text text-transparent">
            Better outcomes
          </span>
        </h2>

        <p className="mt-6 max-w-sm text-[0.95rem] leading-relaxed text-white/65">
          Two approval gates, every decision recorded, and a state machine that refuses anything
          skipping a step.
        </p>

        <SolutionPreview />
      </div>

    </aside>
  )
}

/** A still of a solution mid-workflow, in glass. */
function SolutionPreview() {
  return (
    <div className="relative mt-9 max-w-md">
      {/* A second card peeking out behind, for depth. */}
      <div
        aria-hidden
        className="absolute -top-3 left-4 right-4 h-16 rounded-2xl border border-white/10 bg-white/[0.06]"
      />

      <div className="relative rounded-2xl border border-white/15 bg-white/[0.09] p-5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] font-semibold text-white/50">SOL-014</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-medium text-amber-200 ring-1 ring-inset ring-amber-300/25">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            Testing Approval
          </span>
        </div>

        <p className="mt-2.5 text-sm font-medium text-white">Quote Approval Workflow Redesign</p>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full w-[83%] rounded-full bg-gradient-to-r from-indigo-300 to-white" />
          </div>
          <span className="text-[11px] font-medium tabular-nums text-white/60">83%</span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3.5">
          <span className="flex items-center gap-2 text-[11px] text-white/60">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-[10px] font-semibold text-white ring-1 ring-inset ring-white/20">
              RV
            </span>
            Rahul Verma
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-200">
            <Check className="h-3.5 w-3.5" />
            2 of 3 approvals
          </span>
        </div>
      </div>
    </div>
  )
}

interface DemoAccountsProps {
  accounts: DemoAccount[]
  /** The email currently in the form, used to mark the loaded account. */
  selected: string
  disabled: boolean
  onPick: (account: DemoAccount) => void
}

/**
 * A grid rather than a pill cloud: seven pills wrap into ragged rows with a
 * stranded last one. The first account spans both columns, which keeps the rows
 * even and gives the HOBU the prominence the product gives them.
 */
function DemoAccounts({ accounts, selected, disabled, onPick }: DemoAccountsProps) {
  return (
    <div className="mt-5 border-t border-border/70 pt-4">
      {/*
        Three columns with the first spanning all of them: 1 + 3 + 3 fills every
        row evenly. A chip is a person, so it is named like one — the role it
        carries is in the tooltip, where "Approver" is a detail rather than an
        identity. Under the name is the address the chip loads, because that is
        the credential you are about to sign in with.
      */}
      <div className="grid grid-cols-3 gap-1.5">
        {accounts.map((account, index) => {
          const loaded = selected === account.email
          const wide = index === 0

          return (
            <button
              key={account.email}
              type="button"
              disabled={disabled}
              onClick={() => onPick(account)}
              title={account.label + ' · ' + account.email}
              className={cn(
                'min-w-0 rounded-lg border px-2.5 py-1.5 text-left transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed disabled:opacity-50',
                // The wide row has the space to sit the email beside the label.
                wide && 'col-span-3 flex items-baseline justify-between gap-2',
                loaded
                  ? 'border-primary/40 bg-primary/10 shadow-sm shadow-primary/10'
                  : 'border-slate-200/80 bg-white/60 hover:border-slate-300 hover:bg-white hover:shadow-sm',
              )}
            >
              <span
                className={cn(
                  'block truncate text-[11px] font-semibold',
                  loaded ? 'text-primary' : 'text-foreground',
                )}
              >
                {account.name}
              </span>
              <span
                className={cn(
                  'block truncate font-mono text-[10px] leading-tight',
                  wide && 'shrink-0',
                  loaded ? 'text-primary/70' : 'text-muted-foreground',
                )}
              >
                {account.email.split('@')[0]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
