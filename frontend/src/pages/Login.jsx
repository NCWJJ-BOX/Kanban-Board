import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  // Demo prefill: test@gmail.com / password123 — login is one click on the demo site.
  const [email, setEmail] = useState('test@gmail.com')
  const [password, setPassword] = useState('password123')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
      navigate('/boards')
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.message || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Sign in</h1>
        <p className="auth-sub">Kanban Board</p>
        {error && <div className="auth-error">{error}</div>}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="auth-alt">
          No account? <Link to="/register">Register</Link>
        </p>
      </form>
    </div>
  )
}