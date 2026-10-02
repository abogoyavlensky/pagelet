import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from 'react-router'
import AddSite from './pages/AddSite'
import Login from './pages/Login'
import Site from './pages/Site'
import Sites from './pages/Sites'
import { SessionProvider, useSession } from './session'

/** The app's screens sit in one centred column. */
function Column() {
  return (
    <main className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6">
      <Outlet />
    </main>
  )
}

/** The signed-in screens, or off to /login. */
function Guarded() {
  const { state } = useSession()
  if (state === 'checking') return null
  if (state === 'out') return <Navigate to="/login" replace />
  return <Column />
}

/**
 * A site's page, for both: signed in it is the owner's dashboard, signed
 * out the read-only view of a public site (Site.tsx sends a visitor to
 * /login when the site is not public). It waits for the session check.
 */
function Open() {
  const { state } = useSession()
  if (state === 'checking') return null
  return <Column />
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
            <Route path="/" element={<Sites />} />
            <Route path="/sites/new" element={<AddSite />} />
          </Route>
          <Route element={<Open />}>
            <Route path="/sites/:id" element={<SitePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  )
}
