import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router'
import { api, ApiError, useApi } from './api'
import AddSite from './pages/AddSite'
import Login from './pages/Login'
import Site from './pages/Site'
import { LAST_SITE, SessionProvider, useSession, useSignedOutOn } from './session'

/** The signed-in screens, in one centred column, or off to /login. */
function Guarded() {
  const { state } = useSession()
  if (state === 'checking') return null
  if (state === 'out') return <Navigate to="/login" replace />
  return (
    <main className="mx-auto max-w-[1000px] px-6 pb-24">
      <Outlet />
    </main>
  )
}

/** "/": the site looked at last, else the first one, else adding one. */
function Home() {
  const sites = useApi(() => api.sites(), [])
  useSignedOutOn(sites.error)
  if (sites.error && !(sites.error instanceof ApiError && sites.error.status === 401)) {
    return (
      <p role="alert" className="py-16 text-sm text-danger">
        Could not load the sites.{' '}
        <button onClick={sites.reload} className="underline underline-offset-2">Retry</button>
      </p>
    )
  }
  if (!sites.data) return null
  if (sites.data.length === 0) return <Navigate to="/sites/new" replace />
  const last = localStorage.getItem(LAST_SITE)
  const site = sites.data.find((s) => s.id === last) ?? sites.data[0]
  return <Navigate to={`/sites/${site.id}`} replace />
}

/**
 * A site's dashboard, fresh for each site: nothing from the site switched
 * away from (its report, who was online) can show under the new domain.
 * Within one site the page stays, so a period switch keeps the last report
 * on screen while the next one loads.
 */
function SitePage() {
  const { id } = useParams()
  return <Site key={id} />
}

export default function App() {
  return (
    <SessionProvider>
      <BrowserRouter basename="/">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Guarded />}>
            <Route path="/" element={<Home />} />
            <Route path="/sites/new" element={<AddSite />} />
            <Route path="/sites/:id" element={<SitePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  )
}
