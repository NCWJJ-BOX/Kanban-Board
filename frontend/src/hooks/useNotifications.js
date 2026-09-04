import { useCallback, useEffect, useRef, useState } from 'react'
import api, { readTokens } from '../api'

const MAX_NOTIFICATIONS = 50
const RECONNECT_DELAY = 3000

function wsUrl() {
  const token = readTokens()?.access_token
  if (!token) return null
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${scheme}://${window.location.host}/ws/notifications/?token=${encodeURIComponent(token)}`
}

export default function useNotifications() {
  const [notifications, setNotifications] = useState([])
  const socketRef = useRef(null)
  const reconnectTimer = useRef(null)
  const loggedOutRef = useRef(false)

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications')
      setNotifications(data)
    } catch {
      // ignore transient failures; the WebSocket is the live source
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  useEffect(() => {
    const onLogout = () => {
      loggedOutRef.current = true
      clearTimeout(reconnectTimer.current)
      socketRef.current?.close()
    }
    window.addEventListener('kanban:logout', onLogout)
    return () => window.removeEventListener('kanban:logout', onLogout)
  }, [])

  useEffect(() => {
    let disposed = false

    const connect = () => {
      const url = wsUrl()
      if (!url) return
      if (disposed || loggedOutRef.current) return

      const ws = new WebSocket(url)
      socketRef.current = ws

      ws.onmessage = (event) => {
        try {
          const n = JSON.parse(event.data)
          setNotifications((prev) => [
            n,
            ...prev.filter((p) => p.id !== n.id),
          ].slice(0, MAX_NOTIFICATIONS))
        } catch {
          // malformed frame; ignore
        }
      }

      ws.onclose = () => {
        if (disposed || loggedOutRef.current) return
        // Re-read the token on reconnect so an expired access token is
        // replaced by the refreshed one automatically.
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      disposed = true
      clearTimeout(reconnectTimer.current)
      socketRef.current?.close()
    }
  }, [])

  const markRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    )
    try {
      await api.patch(`/notifications/${id}/read`)
    } catch {
      // optimistic update failed; revert
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: false } : n)),
      )
    }
  }, [])

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.is_read)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    const results = await Promise.allSettled(
      unread.map((n) => api.patch(`/notifications/${n.id}/read`)),
    )
    const failed = unread.filter((_, i) => results[i].status === 'rejected')
    setNotifications((prev) =>
      prev.map((n) => (failed.some((f) => f.id === n.id) ? { ...n, is_read: false } : n)),
    )
  }, [notifications])

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.is_read).length,
    markRead,
    markAllRead,
  }
}