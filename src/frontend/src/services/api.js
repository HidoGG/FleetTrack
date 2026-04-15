import { useAuthStore } from '../store/authStore'

const BASE = '/api'

// Rutas que no requieren token
const PUBLIC_PATHS = ['/auth/login', '/auth/logout']

async function request(path, options = {}) {
  const token = useAuthStore.getState().token

  // Bloquear peticiones protegidas si no hay sesión activa
  if (!token && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    throw new Error('No autenticado')
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || 'Error en la solicitud')
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  // Auth
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () => request('/auth/me'),

  // Vehicles
  getVehicles: () => request('/vehicles'),
  getVehicle: (id) => request(`/vehicles/${id}`),
  createVehicle: (data) => request('/vehicles', { method: 'POST', body: JSON.stringify(data) }),
  updateVehicle: (id, data) => request(`/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteVehicle: (id) => request(`/vehicles/${id}`, { method: 'DELETE' }),
  getVehicleLocation: (id) => request(`/vehicles/${id}/location`),

  // Drivers
  getDrivers: () => request('/drivers'),
  getDriver: (id) => request(`/drivers/${id}`),
  createDriver: (data) => request('/drivers', { method: 'POST', body: JSON.stringify(data) }),
  updateDriver: (id, data) => request(`/drivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDriver: (id) => request(`/drivers/${id}`, { method: 'DELETE' }),

  // Bultos / Control de lotes
  getBultos:        () => request('/bultos'),
  createBulto:      (data) => request('/bultos', { method: 'POST', body: JSON.stringify(data) }),
  deleteBulto:      (id) => request(`/bultos/${id}`, { method: 'DELETE' }),
  getBlockedRiders:         () => request('/bultos/blocked'),
  getAccesosLog:            () => request('/bultos/accesos'),
  getActiveOrdersForVehicle:(vehicleId) => request(`/bultos/active-orders?vehicle_id=${vehicleId}`),

  // Orders
  getOrders:        (params = {}) => { const qs = new URLSearchParams(params).toString(); return request(`/orders${qs ? `?${qs}` : ''}`) },
  createOrder:      (data) => request('/orders', { method: 'POST', body: JSON.stringify(data) }),
  deleteOrder:      (id) => request(`/orders/${id}`, { method: 'DELETE' }),
  uploadInvoice:    (id, image_base64) => request(`/orders/${id}/invoice`, { method: 'POST', body: JSON.stringify({ image_base64 }) }),
  markOrderReady:   (id) => request(`/orders/${id}/ready`, { method: 'PATCH' }),
  updateOrderStatus:(id, status) => request(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),

  // Dashboard financiero
  getDashboardFinancials: () => request('/orders/financials'),
  getCashByVehicle:       () => request('/orders/cash-by-vehicle'),

  // Weight Presets (Master Data de Pesos)
  getWeightPresets:    () => request('/weight-presets'),
  createWeightPreset:  (data) => request('/weight-presets', { method: 'POST', body: JSON.stringify(data) }),
  updateWeightPreset:  (id, data) => request(`/weight-presets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWeightPreset:  (id) => request(`/weight-presets/${id}`, { method: 'DELETE' }),

  // Stores
  getStores:        () => request('/stores'),
  createStore:      (data) => request('/stores', { method: 'POST', body: JSON.stringify(data) }),
  deleteStore:      (id) => request(`/stores/${id}`, { method: 'DELETE' }),

  // Trips
  getTrips: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/trips${qs ? `?${qs}` : ''}`)
  },
  getTrip: (id) => request(`/trips/${id}`),
  startTrip: (data) => request('/trips/start', { method: 'POST', body: JSON.stringify(data) }),
  endTrip: (id, data) => request(`/trips/${id}/end`, { method: 'PUT', body: JSON.stringify(data) }),

  // Super Admin / Companies
  getCompanies: () => request('/companies'),
  createCompany: (data) => request('/companies', { method: 'POST', body: JSON.stringify(data) }),
  updateCompany: (id, data) => request(`/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setCompanyState: (id, state) => request(`/companies/${id}/state`, { method: 'PATCH', body: JSON.stringify({ state }) }),
  getCompanyProfiles: (companyId) => request(`/companies/${companyId}/profiles`),
  createProfile: (companyId, data) => request(`/companies/${companyId}/profiles`, { method: 'POST', body: JSON.stringify(data) }),
  setProfileState: (id, action, reason) => request(`/profiles/${id}/state`, { method: 'PATCH', body: JSON.stringify({ action, reason }) }),
}
