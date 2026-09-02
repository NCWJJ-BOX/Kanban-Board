import { useEffect, useRef, useState } from 'react'
import useNotifications from '../hooks/useNotifications'

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="bell" ref={ref}>
      <button
        className="icon-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <span className="icon icon-bell bell-glyph" aria-hidden="true" />
        {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
      </button>
      {open && (
        <div className="bell-dropdown">
          <div className="bell-header">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button className="link-btn" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          <ul className="bell-list">
            {notifications.length === 0 && (
              <li className="bell-empty">No notifications</li>
            )}
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`bell-item${n.is_read ? ' read' : ''}`}
                onClick={() => markRead(n.id)}
              >
                <div className="bell-msg">{n.message}</div>
                <div className="bell-time">{new Date(n.created_at).toLocaleString()}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}