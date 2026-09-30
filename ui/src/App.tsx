import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router'
import { useState } from 'react'
import { api, ApiError } from './api'
import Wordmark from './components/Wordmark'
import Login from './pages/Login'
import Site from './pages/Site'
import Sites from './pages/Sites'
import { SessionProvider, useSession } from './session'

function TopBar() {
  const { setState } = useSession()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)
  // Signed out only once the server says so: a failed request leaves the
  // session cookie valid, so pretending otherwise would sign back in on
  // reload. A 401 means the session was already gone.
  const signOut = async () => {
    try {
      await api.logout()
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        setFailed(true)
        return
      }
    }
    setState('out')
    navigate('/login')
  }
  return (
    <header className="mx-auto flex max-w-[1080px] items-baseline justify-between px-6 pt-8 pb-6">
      <Link to="/sites" aria-label="pagelet, all sites">
        <Wordmark />
      </Link>
      <span className="flex items-baseline gap-3 text-sm">
        {failed && <span role="alert" className="text-red-800">Could not sign out. Try again.</span>}
        <button onClick={signOut} className="text-muted transition-colors hover:text-ink">
          Sign out
        </button>
      </span>
    </header>
  )
}

/** The signed-in screens: a top bar over the page, or off to /login. */
function Guarded() {
  const { state } = useSession()
  if (state === 'checking') return null
  if (state === 'out') return <Navigate to="/login" replace />
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-[1080px] px-6 pb-24">
        <Outlet />
      </main>
    </>
  )
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter basename="/">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Guarded />}>
            <Route path="/sites" element={<Sites />} />
            <Route path="/sites/:id" element={<Site />} />
          </Route>
          <Route path="*" element={<Navigate to="/sites" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  )
}
