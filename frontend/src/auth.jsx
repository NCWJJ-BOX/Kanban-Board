import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { clearSession, readTokens, readUser, saveTokens, saveUser } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser)
  const [tokens, setTokens] = useState(readTokens)
  // Session is read synchronously from storage at mount, so auth state is always known.
  const ready = true

  const persist = useCallback((access, refresh, u) => {
    saveTokens({ access_token: access, refresh_token: refresh })
    saveUser(u)
    setTokens({ access_token: access, refresh_token: refresh })
    setUser(u)
  }, [])

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post('/auth/login', { email, password })
      persist(data.access_token, data.refresh_token, null)
      const { data: me } = await api.get('/auth/me')
      saveUser(me)
      setUser(me)
      return me
    },
    [persist],
  )

  const register = useCallback(
    async (username, email, password) => {
      const { data } = await api.post('/auth/register', { username, email, password })
      persist(data.access_token, data.refresh_token, data.user)
      return data.user
    },
    [persist],
  )

  const logout = useCallback(() => {
    clearSession()
    setTokens(null)
    setUser(null)
  }, [])

  useEffect(() => {
    const onLogout = () => {
      setTokens(null)
      setUser(null)
    }
    window.addEventListener('kanban:logout', onLogout)
    return () => window.removeEventListener('kanban:logout', onLogout)
  }, [])

  const value = useMemo(
    () => ({ user, tokens, ready, login, register, logout }),
    [user, tokens, ready, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}