import { useEffect, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'

export default function Column({ column, onOpenTask, onAddTask, onRenameColumn, onDeleteColumn, canEdit }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${column.id}` })
  const [name, setName] = useState(column.name)

  useEffect(() => setName(column.name), [column.name])

  return (
    <div
      ref={setNodeRef}
      className={`column${isOver ? ' over' : ''}`}
    >
      <div className="column-head">
        <input
          className="column-name"
          value={name}
          readOnly={!canEdit}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onRenameColumn(column.id, name, true)}
        />
        {canEdit && (
          <button
            className="icon-btn danger"
            title="Delete column"
            onClick={() => onDeleteColumn(column)}
          >
            <svg className="icon-close-svg" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        )}
      </div>
      <SortableContext
        items={column.tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="column-tasks">
          {column.tasks.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={onOpenTask} />
          ))}
          {column.tasks.length === 0 && (
            <div className="column-empty">Drop tasks here</div>
          )}
        </div>
      </SortableContext>
      {canEdit && (
        <button className="btn btn-ghost add-task" onClick={() => onAddTask(column.id)}>
          + Add task
        </button>
      )}
    </div>
  )
}