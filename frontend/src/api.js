import axios from 'axios'

const api = axios.create({ baseURL: '/api/v1' })

const TOKENS_KEY = 'kanban_tokens'
const USER_KEY = 'kanban_user'

export function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY)) || null
  } catch {
    return null
  }
}

export function saveTokens(tokens) {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
}

export function readUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY)) || null
  } catch {
    return null
  }
}

export function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKENS_KEY)
  localStorage.removeItem(USER_KEY)
}

let refreshPromise = null

async function refreshAccessToken() {
  const tokens = readTokens()
  if (!tokens?.refresh_token) throw new Error('no refresh token')
  if (!refreshPromise) {
    refreshPromise = axios
      .post('/api/v1/auth/refresh', { refresh: tokens.refresh_token })
      .then((res) => {
        saveTokens({ ...tokens, ...res.data })
        return res.data.access_token
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.request.use((config) => {
  const tokens = readTokens()
  if (tokens?.access_token) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    // Retry once after a token refresh; never for the refresh call itself.
    if (error.response?.status === 401 && !original._retried && !original.url.endsWith('/auth/refresh')) {
      original._retried = true
      try {
        const access = await refreshAccessToken()
        original.headers.Authorization = `Bearer ${access}`
        return api(original)
      } catch {
        clearSession()
        window.dispatchEvent(new CustomEvent('kanban:logout'))
      }
    }
    return Promise.reject(error)
  },
)

export default api