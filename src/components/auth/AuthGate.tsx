import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { LoginScreen, type DemoAccount } from '@/components/auth/LoginScreen'
import { localServices } from '@/services'
import type { CurrentUser } from '@/types/user'

interface AuthGateProps {
  /** Rendered with the signed-in principal once there is one. */
  children: (user: CurrentUser) => ReactNode
  /** Rendered while the stored session is being checked. */
  fallback?: ReactNode
  /** One-click sign-in buttons for the seeded accounts. */
  demoAccounts?: DemoAccount[]
  demoPassword?: string
  /**
   * Where a *fresh* sign-in lands. A restored session deliberately stays put, so
   * reloading on a solution's page keeps you on that page.
   */
  redirectTo?: string
}

/**
 * Decides whether anyone is signed in, and shows the login screen until someone
 * is. It sits *outside* `SolutionsModuleProvider` and hands the resolved user in
 * through its `currentUser` prop, so no query, hook, or component ever runs
 * without a principal.
 *
 * When the auth service has no `signIn` — the `localStorage` build, where the
 * seeded HOBU is simply who you are — this resolves a user immediately and no
 * login screen exists.
 */
export function AuthGate({
  children,
  fallback = null,
  demoAccounts,
  demoPassword,
  redirectTo = '/',
}: AuthGateProps) {
  const auth = localServices.auth
  const navigate = useNavigate()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void auth
      .getCurrentUser()
      .then((resolved) => {
        if (!cancelled) setUser(resolved)
      })
      .catch((error: unknown) => {
        // A server that cannot be reached is not "signed out": say so, rather
        // than showing a login form that cannot possibly succeed.
        if (!cancelled) setFailure(error instanceof Error ? error.message : 'Sign in unavailable.')
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [auth])

  const signIn = useCallback(
    (email: string, password: string) => {
      if (!auth.signIn) throw new Error('This build does not support signing in.')
      return auth.signIn(email, password)
    },
    [auth],
  )

  if (checking) return <>{fallback}</>

  if (failure && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-semibold text-foreground">Cannot reach the server</p>
          <p className="text-sm text-muted-foreground">{failure}</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <LoginScreen
        onSignIn={signIn}
        onSignedIn={(signedIn) => {
          setUser(signedIn)
          /*
            Signing in is an entry point, not a resumption: the URL still holds
            whatever page was open when the session ended, and landing there
            skips the overview. `replace` keeps the login screen out of history.
          */
          navigate(redirectTo, { replace: true })
        }}
        demoAccounts={demoAccounts}
        demoPassword={demoPassword}
      />
    )
  }

  return <>{children(user)}</>
}
