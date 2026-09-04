import { useEffect, useRef, useState } from 'react'
import api from '../api'

const ROLES = ['viewer', 'editor']

export default function InviteModal({ boardId, onClose }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showDrop, setShowDrop] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const dropRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Close dropdown on outside click
  useEffect(() => {
    function onClick(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function onEmailChange(val) {
    setEmail(val)
    setHighlightIdx(-1)
    clearTimeout(timerRef.current)
    if (val.trim().length >= 2) {
      timerRef.current = setTimeout(() => searchUsers(val.trim()), 250)
    } else {
      setSuggestions([])
      setShowDrop(false)
    }
  }

  async function searchUsers(q) {
    try {
      const { data } = await api.get('/users/search', { params: { q } })
      setSuggestions(data)
      setShowDrop(data.length > 0)
    } catch {
      setSuggestions([])
      setShowDrop(false)
    }
  }

  function pickSuggestion(u) {
    setEmail(u.email)
    setShowDrop(false)
    setSuggestions([])
  }

  function onEmailKeyDown(e) {
    if (!showDrop || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (e.key === 'Enter' && highlightIdx >= 0) {
      e.preventDefault()
      pickSuggestion(suggestions[highlightIdx])
    }
  }

  async function invite(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await api.post(`/boards/${boardId}/invite`, { email: email.trim(), role })
      setNotice('Invitation sent.')
      setEmail('')
      setSuggestions([])
      setShowDrop(false)
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
          <label className="invite-field">
            Email
            <div className="invite-email-wrap" ref={dropRef}>
              <input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                onFocus={() => { if (suggestions.length > 0) setShowDrop(true) }}
                onKeyDown={onEmailKeyDown}
                required
                autoFocus
                autoComplete="off"
              />
              {showDrop && suggestions.length > 0 && (
                <ul className="invite-dropdown">
                  {suggestions.map((u, i) => (
                    <li
                      key={u.id}
                      className={`invite-suggest${i === highlightIdx ? ' active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); pickSuggestion(u) }}
                    >
                      <span className="suggest-email">{u.email}</span>
                      {u.username && <span className="suggest-user">{u.username}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
