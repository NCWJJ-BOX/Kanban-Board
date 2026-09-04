import { useEffect, useRef, useState } from 'react'
import useNotifications from '../hooks/useNotifications'
import api from '../api'

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const [acting, setActing] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function handleInvitation(inviteId, action) {
    setActing(inviteId)
    try {
      await api.post(`/invitations/${inviteId}/${action}`)
      // Remove from list or mark as read
      markRead(inviteId)
    } catch (err) {
      console.error(`Failed to ${action} invitation`, err)
    } finally {
      setActing(null)
    }
  }

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
                onClick={() => !n.invitation_id && markRead(n.id)}
              >
                <div className="bell-msg">{n.message}</div>
                {n.board_name && (
                  <div className="bell-board">{n.board_name}</div>
                )}
                <div className="bell-time">{new Date(n.created_at).toLocaleString()}</div>
                {n.invitation_id && !n.is_read && (
                  <div className="bell-actions">
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={acting === n.invitation_id}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleInvitation(n.invitation_id, 'accept')
                      }}
                    >
                      {acting === n.invitation_id ? '...' : 'Accept'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={acting === n.invitation_id}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleInvitation(n.invitation_id, 'reject')
                      }}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
