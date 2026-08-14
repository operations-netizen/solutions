import { createContext } from 'react'

import type { SolutionsServices } from '@/services/contracts'
import type { CurrentUser } from '@/types/user'

export interface SolutionsModuleContextValue {
  services: SolutionsServices
  currentUser: CurrentUser
  /**
   * URL prefix the module is mounted under. Standalone that is `''`; inside the
   * CRM it might be `/crm/solutions`. Every internal link is built from this, so
   * remounting the module elsewhere needs no component edits.
   */
  basePath: string
}

/**
 * Deliberately in its own module, separate from the provider component.
 *
 * A `createContext` call colocated with a component in a `.tsx` file gets a
 * fresh identity every time React Fast Refresh re-evaluates that file, while
 * consumers keep referencing the previous one — so every `useContext` returns
 * null and the app throws mid-edit. Keeping the context in a component-free
 * module pins its identity across hot updates.
 */
export const SolutionsModuleContext = createContext<SolutionsModuleContextValue | null>(null)
