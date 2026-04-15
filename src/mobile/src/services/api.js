import { useAuthStore } from '../store/authStore'

const BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001'

let isRefreshing = false
let refreshPromise = null

async function attemptRefresh() {
  const { refreshToken, setToken, logout } = useAuthStore.getState()
  if (!refreshToken) {
    logout()
    return null
  }

  const res = await fetch(`${BASE}/api/auth/refresh`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refreshToken }),
  })

  if (!res.ok) {
    logout()
    return null
  }

  const data = await res.json()
  setToken(data.token, data.refreshToken)
  return data.token
}

async function request(path, options = {}, retry = true) {
  const token = useAuthStore.getState().token
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  // Auto-refresh en token expirado
  if (res.status === 401 && retry) {
    if (!isRefreshing) {
      isRefreshing = true
      refreshPromise = attemptRefresh().finally(() => {
        isRefreshing = false
        refreshPromise = null
      })
    }

    const newToken = await refreshPromise
    if (!newToken) {
      throw new Error('Sesión expirada. Iniciá sesión nuevamente.')
    }

    // Reintentar con el nuevo token
    return request(path, options, false)
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Error en la solicitud')
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  login:       (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout:      () => request('/auth/logout', { method: 'POST' }),
  getVehicles: () => request('/vehicles'),
  getDrivers:   () => request('/drivers'),
  getMyDriver:  () => request('/drivers/me'),
  getTrips:    (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/trips${qs ? `?${qs}` : ''}`)
  },
  startTrip:      (data) => request('/trips/start', { method: 'POST', body: JSON.stringify(data) }),
  endTrip:        (id, data) => request(`/trips/${id}/end`, { method: 'PUT', body: JSON.stringify(data) }),
  updateLocation: (data) => request('/trips/location', { method: 'POST', body: JSON.stringify(data) }),

  // Bultos
  validateLote:  (data) => request('/bultos/validate', { method: 'POST', body: JSON.stringify(data) }),
  unlockRider:   (data) => request('/bultos/unlock',   { method: 'POST', body: JSON.stringify(data) }),

  // Orders
  getOrdersByBulto:  (bultoId) => request(`/orders?bulto_id=${bultoId}`),
  updateOrderStatus: (id, status) => request(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  uploadPoD:         (id, image_base64) => request(`/orders/${id}/pod`, { method: 'POST', body: JSON.stringify({ image_base64 }) }),

  // Stores
  getStores: () => request('/stores'),
}
