import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import api from '../api'
import Column from '../components/Column'
import TaskCard from '../components/TaskCard'
import TaskModal from '../components/TaskModal'
import InviteModal from '../components/InviteModal'
import MembersModal from '../components/MembersModal'

// Fractional position: average of neighbours (or before+1 / after-1 at the edges).
function insertionPosition(tasks, index) {
  if (tasks.length === 0) return 1
  const toNum = (v) => Number(v)
  const before = index > 0 ? toNum(tasks[index - 1].position) : 0
  const after = index < tasks.length ? toNum(tasks[index].position) : Infinity
  if (after === Infinity) return before + 1
  return (before + after) / 2
}

export default function Kanban() {
  const { boardId } = useParams()
  const [board, setBoard] = useState(null)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null) // {task?, columnId?}
  const [activeTask, setActiveTask] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  const [addingColumn, setAddingColumn] = useState(false)
  const [newColumnName, setNewColumnName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [boardName, setBoardName] = useState('')
  const [boardDesc, setBoardDesc] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const loadBoard = useCallback(() => {
    return api
      .get(`/boards/${boardId}`)
      .then((res) => {
        setBoard(res.data)
        setError('')
      })
      .catch(() => setError('Failed to load board'))
  }, [boardId])

  useEffect(() => {
    loadBoard()
  }, [loadBoard])

  const columns = board?.columns ?? []
  const members = board?.members ?? []
  const boardTags = board?.tags ?? []
  const role = board?.role
  const canEdit = role === 'owner' || role === 'editor'

  function onDragStart(event) {
    const id = String(event.active.id)
    const task = columns.flatMap((c) => c.tasks).find((t) => String(t.id) === id)
    if (task) setActiveTask(task)
  }

  function onDragCancel() {
    setActiveTask(null)
  }

  function onDragEnd(event) {
    setActiveTask(null)
    const { active, over } = event
    if (!over) return
    const taskId = String(active.id)
    const overId = String(over.id)

    const source = columns.find((c) => c.tasks.some((t) => String(t.id) === taskId))
    if (!source) return
    const moving = source.tasks.find((t) => String(t.id) === taskId)

    let targetColId
    if (overId.startsWith('col-')) targetColId = overId.slice(4)
    else {
      const col = columns.find((c) => c.tasks.some((t) => String(t.id) === overId))
      if (!col) return
      targetColId = col.id
    }

    // Rebuild the column list with the task removed, then insert at drop index.
    const next = columns.map((c) => ({
      ...c,
      tasks: c.tasks.filter((t) => String(t.id) !== taskId),
    }))
    const target = next.find((c) => c.id === targetColId)
    let index
    if (overId.startsWith('col-')) {
      index = target.tasks.length
    } else {
      index = Math.max(
        0,
        target.tasks.findIndex((t) => String(t.id) === overId),
      )
    }
    const position = insertionPosition(target.tasks, index)
    if (moving) {
      target.tasks.splice(index, 0, { ...moving, column: targetColId, position })
    }

    setBoard((prev) => ({ ...prev, columns: next }))

    api
      .patch(`/tasks/${taskId}/move`, { column_id: targetColId, position })
      .catch(() => loadBoard())
  }

  async function addColumn(e) {
    e.preventDefault()
    if (!newColumnName.trim()) return
    try {
      await api.post(`/boards/${boardId}/columns`, { name: newColumnName.trim() })
      setNewColumnName('')
      setAddingColumn(false)
      loadBoard()
    } catch (err) {
      setError(err?.response?.data?.name?.[0] || 'Failed to create column')
    }
  }

  async function renameColumn(columnId, name, commit = false) {
    if (commit) {
      const col = columns.find((c) => c.id === columnId)
      if (!col || col.name === name.trim()) return
      try {
        await api.patch(`/columns/${columnId}`, { name: name.trim() })
        loadBoard()
      } catch {
        loadBoard()
      }
    }
  }

  async function deleteColumn(column) {
    if (!window.confirm(`Delete column "${column.name}" and all its tasks?`)) return
    try {
      await api.delete(`/columns/${column.id}`)
      loadBoard()
    } catch {
      setError('Failed to delete column')
    }
  }

  function openNewTask(colId) {
    setModal({ columnId: colId })
  }

  function openEditTask(task) {
    setModal({ task })
  }

  function cancelRename() {
    setRenaming(false)
    setBoardName(board.name)
    setBoardDesc(board.description || '')
  }

  function startRename() {
    setBoardName(board.name)
    setBoardDesc(board.description || '')
    setRenaming(true)
  }

  async function commitRename(e) {
    e?.preventDefault()
    if (!renaming) return
    const name = boardName.trim()
    const description = boardDesc.trim()
    setRenaming(false)
    if (!name || (name === board.name && description === (board.description || ''))) return
    try {
      await api.patch(`/boards/${boardId}`, { name, description })
      loadBoard()
    } catch {
      setError('Failed to rename board')
      loadBoard()
    }
  }

  function handleFormBlur(e) {
    // Don't commit when focus merely moves between the name/description inputs.
    if (!e.currentTarget.contains(e.relatedTarget)) commitRename(e)
  }

  if (error && !board) {
    return <div className="auth-error">{error}</div>
  }
  if (!board) {
    return <p className="muted">Loading board…</p>
  }

  return (
    <div className="kanban-page">
      <div className="kanban-head">
        <div>
          <Link to="/boards" className="back-link">
            &larr; Boards
          </Link>
          <div className="board-name-row">
            {renaming ? (
              <form className="board-rename-form" onSubmit={commitRename} onBlur={handleFormBlur}>
                <input
                  className="board-name-input"
                  value={boardName}
                  onChange={(e) => setBoardName(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cancelRename()
                  }}
                  autoFocus
                  maxLength={100}
                />
                <textarea
                  className="board-desc-input"
                  placeholder="Description (optional)"
                  rows={2}
                  value={boardDesc}
                  onChange={(e) => setBoardDesc(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') cancelRename()
                  }}
                />
              </form>
            ) : (
              <>
                <h1>{board.name}</h1>
                {role === 'owner' && (
                  <button className="icon-btn" title="Rename board" onClick={startRename}>
                    <svg className="icon-edit-svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
                      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
          {board.description && <p className="muted">{board.description}</p>}
        </div>
        <div className="kanban-tools">
          <span className="member-avatars" title="Members">
            {members.map((m) => (
              <span key={m.id} className="avatar" title={`${m.username} (${m.role})`}>
                {m.username.slice(0, 2).toUpperCase()}
              </span>
            ))}
          </span>
          {canEdit && (
            <>
              <button className="btn btn-ghost" onClick={() => setMembersOpen(true)}>
                Members
              </button>
              <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
                Invite
              </button>
            </>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="board-canvas">
        {columns.map((col) => (
          <Column
            key={col.id}
            column={col}
            onOpenTask={openEditTask}
            onAddTask={openNewTask}
            onRenameColumn={renameColumn}
            onDeleteColumn={deleteColumn}
            canEdit={canEdit}
          />
        ))}
        {canEdit && (
          <div className="column add-column">
            {addingColumn ? (
              <form onSubmit={addColumn}>
                <input
                  value={newColumnName}
                  onChange={(e) => {
                    setNewColumnName(e.target.value)
                    if (error) setError('')
                  }}
                  placeholder="Column name"
                  autoFocus
                />
                <div className="row-btns">
                  <button className="btn btn-primary" type="submit">
                    Add
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setAddingColumn(false)}
                  >
                    Cancel
                  </button>
                </div>
                {error && <p className="auth-error">{error}</p>}
              </form>
            ) : (
              <button
                className="btn btn-ghost add-column-btn"
                onClick={() => setAddingColumn(true)}
              >
                + Add column
              </button>
            )}
          </div>
        )}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? <TaskCard task={activeTask} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {modal && (
        <TaskModal
          task={modal.task}
          columnId={modal.columnId}
          boardId={boardId}
          boardTags={boardTags}
          members={members}
          role={role}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            loadBoard()
          }}
          onDeleted={() => {
            setModal(null)
            loadBoard()
          }}
          onTagCreated={(tag) =>
            setBoard((prev) => ({ ...prev, tags: [...prev.tags, tag] }))
          }
        />
      )}
      {inviteOpen && (
        <InviteModal
          boardId={boardId}
          onClose={() => setInviteOpen(false)}
        />
      )}
      {membersOpen && (
        <MembersModal
          board={board}
          onClose={() => setMembersOpen(false)}
          onChanged={loadBoard}
        />
      )}
    </div>
  )
}