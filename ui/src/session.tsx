// Whether the dashboard is signed in: probed once with /api/me when the app
// loads, set by the login page, cleared by signing out or by any 401.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, ApiError } from './api'

export type SessionState = 'checking' | 'in' | 'out'

const SessionContext = createContext<{
  state: SessionState
  setState: (s: SessionState) => void
}>({ state: 'checking', setState: () => {} })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>('checking')
  useEffect(() => {
    api.me().then(
      () => setState('in'),
      () => setState('out'),
    )
  }, [])
  return <SessionContext.Provider value={{ state, setState }}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}

/** Sign out locally when a request came back 401. */
export function useSignedOutOn(error: unknown) {
  const { setState } = useSession()
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) setState('out')
  }, [error, setState])
}
