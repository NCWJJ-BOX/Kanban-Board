import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api'

export default function useNotifications(intervalMs = 5000) {
  const [notifications, setNotifications] = useState([])
  const timer = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications')
      setNotifications(data)
    } catch {
      // ignore transient failures; the next poll will retry
    }
  }, [])

  useEffect(() => {
    fetchAll()
    timer.current = setInterval(fetchAll, intervalMs)
    return () => clearInterval(timer.current)
  }, [fetchAll, intervalMs])

  const markRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    try {
      await api.patch(`/notifications/${id}/read`)
    } catch {
      // optimistic update; revert on the next poll
    }
  }, [])

  const markAllRead = useCallback(async () => {
    const unread = notifications.filter((n) => !n.is_read)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    await Promise.allSettled(unread.map((n) => api.patch(`/notifications/${n.id}/read`)))
  }, [notifications])

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.is_read).length,
    markRead,
    markAllRead,
  }
}