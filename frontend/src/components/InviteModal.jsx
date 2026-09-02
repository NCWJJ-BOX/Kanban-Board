import { useEffect, useState } from 'react'
import api from '../api'

const ROLES = ['viewer', 'editor']

export default function InviteModal({ boardId, onClose }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function invite(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.post(`/boards/${boardId}/invite`, { email: email.trim(), role })
      setNotice('Invitation sent.')
      setEmail('')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to send invitation')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div className="modal-head">
          <h2>Invite member</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <span className="icon icon-close" aria-hidden="true" />
          </button>
        </div>
        {notice && <div className="notice">{notice}</div>}
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={invite}>
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
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <span className="spacer" />
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}