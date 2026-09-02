import { useEffect, useState } from 'react'
import api from '../api'

const EMPTY = { title: '', description: '' }

export default function TaskModal({ task, columnId, boardId, boardTags, members, role, onClose, onSaved, onDeleted, onTagCreated }) {
  const isNew = !task
  const canEdit = role === 'owner' || role === 'editor'
  const [form, setForm] = useState(() => (isNew ? EMPTY : {
    title: task.title,
    description: task.description || '',
  }))
  const [selectedTags, setSelectedTags] = useState(() => (isNew ? [] : task.tags.map((t) => t.id)))
  const [assignees, setAssignees] = useState(() => (isNew ? [] : task.assignees.map((a) => a.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [tagForm, setTagForm] = useState({ name: '', color: '#3b82f6' })

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleTag(tagId) {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    )
  }

  function toggleAssignee(userId) {
    setAssignees((prev) =>
      prev.includes(userId) ? prev.filter((u) => u !== userId) : [...prev, userId],
    )
  }

  async function save() {
    if (!form.title.trim()) {
      setError('Title is required')
      return
    }
    setBusy(true)
    setError('')
    let saved
    try {
      if (isNew) {
        const { data } = await api.post(`/columns/${columnId}/tasks`, {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
        })
        saved = data
      } else {
        const { data } = await api.patch(`/tasks/${task.id}`, {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
        })
        saved = data
      }
      // tags + assignees
      if (isNew) {
        for (const tagId of selectedTags) await api.post(`/tasks/${saved.id}/tags`, { tag_id: tagId })
        for (const userId of assignees) await api.post(`/tasks/${saved.id}/assignees`, { user_id: userId })
      } else {
        const have = new Set(task.tags.map((t) => t.id))
        const want = new Set(selectedTags)
        for (const id of have) if (!want.has(id)) await api.delete(`/tasks/${task.id}/tags/${id}`)
        for (const id of want) if (!have.has(id)) await api.post(`/tasks/${task.id}/tags`, { tag_id: id })

        const haveUsers = new Set(task.assignees.map((a) => a.id))
        const wantUsers = new Set(assignees)
        for (const id of haveUsers) if (!wantUsers.has(id)) await api.delete(`/tasks/${task.id}/assignees/${id}`)
        for (const id of wantUsers) if (!haveUsers.has(id)) await api.post(`/tasks/${task.id}/assignees`, { user_id: id })
      }
      onSaved()
    } catch {
      setError('Failed to save task')
      setBusy(false)
    }
  }

  async function createTag(e) {
    e.preventDefault()
    if (!tagForm.name.trim()) return
    setAddingTag(true)
    setError('')
    try {
      const { data } = await api.post(`/boards/${boardId}/tags`, tagForm)
      setTagForm({ name: '', color: '#3b82f6' })
      setSelectedTags((prev) => [...prev, data.id])
      onTagCreated(data)
    } catch {
      setError('Failed to create tag')
    } finally {
      setAddingTag(false)
    }
  }

  async function removeTask() {
    if (!window.confirm('Delete this task?')) return
    setBusy(true)
    try {
      await api.delete(`/tasks/${task.id}`)
      onDeleted()
    } catch {
      setError('Failed to delete task')
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>{isNew ? 'New task' : 'Edit task'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <span className="icon icon-close" aria-hidden="true" />
          </button>
        </div>
        {error && <div className="auth-error">{error}</div>}
        <label>
          Title
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            autoFocus
            disabled={!canEdit}
          />
        </label>
        <label>
          Description
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            disabled={!canEdit}
          />
        </label>

        <div className="modal-section">
          <span className="section-label">Tags</span>
          <div className="tag-picker">
            {boardTags.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tag opt${selectedTags.includes(t.id) ? ' sel' : ''}`}
                style={{ backgroundColor: t.color }}
                onClick={() => canEdit && toggleTag(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          {canEdit && (
            <form className="tag-create" onSubmit={createTag}>
              <input
                placeholder="New tag name"
                value={tagForm.name}
                onChange={(e) => setTagForm({ ...tagForm, name: e.target.value })}
              />
              <input
                type="color"
                value={tagForm.color}
                onChange={(e) => setTagForm({ ...tagForm, color: e.target.value })}
                className="tag-color"
                title="Tag color"
              />
              <button className="btn btn-ghost" disabled={addingTag}>
                Add
              </button>
            </form>
          )}
        </div>

        {members.length > 0 && (
          <div className="modal-section">
            <span className="section-label">Assignees</span>
            <div className="assignee-picker">
              {members.map((m) => (
                <label key={m.id} className={`assignee-opt${assignees.includes(m.id) ? ' sel' : ''}`}>
                  <input
                    type="checkbox"
                    checked={assignees.includes(m.id)}
                    onChange={() => canEdit && toggleAssignee(m.id)}
                    disabled={!canEdit}
                  />
                  {m.username}
                </label>
              ))}
            </div>
          </div>
        )}

        {canEdit && (
          <div className="modal-actions">
            {!isNew && (
              <button className="btn btn-danger" onClick={removeTask} disabled={busy}>
                Delete
              </button>
            )}
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : isNew ? 'Create task' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}