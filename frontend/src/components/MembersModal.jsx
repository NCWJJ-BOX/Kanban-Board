import { useEffect, useState } from 'react'
import api from '../api'

export default function MembersModal({ board, onClose, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function removeMember(member) {
    if (member.role === 'owner') return
    if (!window.confirm(`Remove ${member.username} from the board?`)) return
    setBusy(true)
    setError('')
    try {
      await api.delete(`/boards/${board.id}/members/${member.id}`)
      onChanged()
    } catch {
      setError('Failed to remove member')
    } finally {
      setBusy(false)
    }
  }

  const nonOwners = board.members.filter((m) => m.role !== 'owner')

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-sm">
        <div className="modal-head">
          <h2>Members</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <span className="icon icon-close" aria-hidden="true" />
          </button>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <ul className="member-list">
          {board.members.map((m) => (
            <li key={m.id}>
              <span className="avatar">{m.username.slice(0, 2).toUpperCase()}</span>
              <span className="member-name">
                {m.username} <span className="muted">({m.role})</span>
              </span>
              {m.role !== 'owner' && (
                <button
                  className="icon-btn danger"
                  title="Remove member"
                  onClick={() => removeMember(m)}
                  disabled={busy}
                >
                  <svg className="icon-close-svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
        {nonOwners.length === 0 && <p className="muted">Only you are on this board.</p>}
      </div>
    </div>
  )
}