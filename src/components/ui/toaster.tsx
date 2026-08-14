import { Toaster as SonnerToaster } from 'sonner'

/** Toast surface for the standalone app. Light theme only, matching the shell. */
export function Toaster() {
  return (
    <SonnerToaster
      theme="light"
      position="bottom-right"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast: 'rounded-lg border border-border shadow-pop text-sm',
          description: 'text-muted-foreground',
        },
      }}
    />
  )
}
