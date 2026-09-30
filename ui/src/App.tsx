import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router'
import { api } from './api'
import Wordmark from './components/Wordmark'
import Login from './pages/Login'
import Site from './pages/Site'
import Sites from './pages/Sites'
import { SessionProvider, useSession } from './session'

function TopBar() {
  const { setState } = useSession()
  const navigate = useNavigate()
  const signOut = async () => {
    await api.logout().catch(() => {})
    setState('out')
    navigate('/login')
  }
  return (
    <header className="mx-auto flex max-w-[1080px] items-baseline justify-between px-6 pt-8 pb-6">
      <Link to="/sites" aria-label="pagelet, all sites">
        <Wordmark />
      </Link>
      <button
        onClick={signOut}
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        Sign out
      </button>
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
