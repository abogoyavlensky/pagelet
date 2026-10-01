import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { api, ApiError } from '../api'
import Wordmark from '../components/Wordmark'
import { useSession } from '../session'

export default function Login() {
  const { state, setState } = useSession()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [shakes, setShakes] = useState(0)
  const [busy, setBusy] = useState(false)

  if (state === 'in') return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.login(password)
      setState('in')
      navigate('/')
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Wrong password' : 'Could not sign in')
      setShakes((n) => n + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={submit}
        className="rise w-full max-w-sm border border-hairline bg-surface px-8 pt-10 pb-8 shadow-[0_1px_0_#e4e0d6,0_24px_48px_-32px_#1b1a1733]"
      >
        <Wordmark className="text-4xl" />
        <p className="mt-2 text-sm text-muted">Analytics without the cookies.</p>
        <label htmlFor="password" className="mt-10 block text-xs font-medium tracking-[0.12em] text-muted uppercase">
          Password
        </label>
        <input
          key={shakes}
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(undefined) }}
          aria-invalid={!!error}
          aria-describedby={error ? 'login-error' : undefined}
          className={`mt-2 block w-full border-b bg-transparent py-2 text-lg outline-none focus-visible:outline-none transition-colors focus:border-accent ${
            error ? 'border-danger' : 'border-hairline'
          } ${shakes > 0 ? 'shake' : ''}`}
        />
        <p id="login-error" role="alert" className="mt-2 h-5 text-sm text-danger">
          {error}
        </p>
        <button
          type="submit"
          disabled={busy || password === ''}
          className="mt-6 w-full bg-ink py-2.5 text-sm font-medium text-paper transition-colors hover:bg-accent disabled:opacity-40"
        >
          Sign in
        </button>
      </form>
    </main>
  )
}
