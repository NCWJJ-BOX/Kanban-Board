import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

function TaskCardBody({ task }) {
  return (
    <>
      <div className="task-title">{task.title}</div>
      {task.description && <div className="task-desc">{task.description}</div>}
      <div className="task-foot">
        <div className="task-tags">
          {task.tags?.map((t) => (
            <span key={t.id} className="tag" style={{ backgroundColor: t.color }}>
              {t.name}
            </span>
          ))}
        </div>
        <div className="task-assignees">
          {task.assignees?.map((a) => (
            <span key={a.id} className="avatar" title={a.username}>
              {a.username.slice(0, 2).toUpperCase()}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}

export default function TaskCard({ task, onOpen, overlay }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: overlay,
  })

  // Overlay copy floats over the board while dragging; not a registered sortable.
  if (overlay) {
    return (
      <div className="task-card drag-overlay">
        <TaskCardBody task={task} />
      </div>
    )
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="task-card"
      onClick={(e) => {
        // Only open the modal for non-drag clicks.
        if (e.detail > 0) onOpen(task)
      }}
    >
      <TaskCardBody task={task} />
    </div>
  )
}