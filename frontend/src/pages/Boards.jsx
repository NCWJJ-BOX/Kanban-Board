import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'

export default function Boards() {
  const navigate = useNavigate()
  const [boards, setBoards] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ name: '', description: '' })
  const [renamingId, setRenamingId] = useState(null)
  const [renameName, setRenameName] = useState('')
  const [renameDesc, setRenameDesc] = useState('')

  useEffect(() => {
    api
      .get('/boards')
      .then((res) => setBoards(res.data))
      .catch(() => setError('Failed to load boards'))
      .finally(() => setLoading(false))
  }, [])

  // Re-fetch boards when an invitation is accepted (lightweight AJAX)
  useEffect(() => {
    function onBoardsChanged() {
      api
        .get('/boards')
        .then((res) => setBoards(res.data))
        .catch(() => {})
    }
    window.addEventListener('kanban:boards-changed', onBoardsChanged)
    return () => window.removeEventListener('kanban:boards-changed', onBoardsChanged)
  }, [])

  async function createBoard(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const { data } = await api.post('/boards', form)
      navigate(`/boards/${data.id}`)
    } catch {
      setError('Failed to create board')
      setSubmitting(false)
    }
  }

  async function deleteBoard(e, board) {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`Delete board "${board.name}"? This cannot be undone.`)) return
    try {
      await api.delete(`/boards/${board.id}`)
      setBoards((prev) => prev.filter((b) => b.id !== board.id))
    } catch {
      setError('Failed to delete board')
    }
  }

  function startRename(e, b) {
    e.preventDefault()
    e.stopPropagation()
    setRenamingId(b.id)
    setRenameName(b.name)
    setRenameDesc(b.description || '')
  }

  async function commitRename(b) {
    const id = b.id
    setRenamingId(null)
    const name = renameName.trim()
    const description = renameDesc.trim()
    if (!name || (name === b.name && description === (b.description || ''))) return
    try {
      await api.patch(`/boards/${id}`, { name, description })
      setBoards((prev) => prev.map((x) => (x.id === id ? { ...x, name, description } : x)))
    } catch {
      setError('Failed to rename board')
    }
  }

  function cardFocusLeaving(e) {
    // Don't commit when focus moves between the name/description inputs on the same card.
    const card = e.currentTarget.closest('.board-card')
    return !card.contains(e.relatedTarget)
  }

  return (
    <div className="boards-page">
      <div className="boards-head">
        <h1>Your boards</h1>
        <button className="btn btn-primary" onClick={() => setCreating((c) => !c)}>
          {creating ? 'Cancel' : 'New board'}
        </button>
      </div>
      {error && <div className="auth-error">{error}</div>}
      {creating && (
        <form className="board-create" onSubmit={createBoard}>
          <input
            placeholder="Board name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
          />
          <input
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button className="btn btn-primary" disabled={submitting}>
            Create
          </button>
        </form>
      )}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : boards.length === 0 ? (
        <div className="boards-empty">
          <p>No boards yet.</p>
          <p className="muted">Create your first board to get started.</p>
        </div>
      ) : (
        <div className="board-grid">
          {boards.map((b) => (
            <Link key={b.id} to={`/boards/${b.id}`} className="board-card">
              <div className="board-card-head">
                {renamingId === b.id ? (
                  <input
                    className="board-rename-input"
                    value={renameName}
                    onChange={(e) => setRenameName(e.target.value)}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onFocus={(e) => e.target.select()}
                    onBlur={(e) => {
                      if (cardFocusLeaving(e)) commitRename(b)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setRenamingId(null)
                      if (e.key === 'Enter') commitRename(b)
                    }}
                    autoFocus
                    maxLength={100}
                  />
                ) : (
                  <h3>{b.name}</h3>
                )}
                <div className="card-actions">
                  {b.role === 'owner' && renamingId !== b.id && (
                    <button
                      className="icon-btn"
                      title="Rename board"
                      onClick={(e) => startRename(e, b)}
                    >
                      <svg className="icon-edit-svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                      </svg>
                    </button>
                  )}
                  {b.role === 'owner' && (
                    <button
                      className="icon-btn danger"
                      title="Delete board"
                      onClick={(e) => deleteBoard(e, b)}
                    >
                      <svg className="icon-close-svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                        <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              {renamingId === b.id ? (
                <input
                  className="board-desc-input"
                  placeholder="Description (optional)"
                  value={renameDesc}
                  onChange={(e) => setRenameDesc(e.target.value)}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onFocus={(e) => e.target.select()}
                  onBlur={(e) => {
                    if (cardFocusLeaving(e)) commitRename(b)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setRenamingId(null)
                    if (e.key === 'Enter') commitRename(b)
                  }}
                  maxLength={200}
                />
              ) : (
                b.description && <p className="board-desc">{b.description}</p>
              )}
              <div className="board-meta">
                <span>{b.column_count} columns</span>
                <span>{b.task_count} tasks</span>
                <span>{b.role}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}