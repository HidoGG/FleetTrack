import { useAuthStore } from '../store/authStore'

const BASE = '/api'
const PUBLIC_PATHS = ['/auth/login', '/auth/logout']

export function getLocationId(record) {
  if (!record || typeof record !== 'object') return null
  return record.location_id ?? record.store_id ?? null
}

function normalizeOrderPayload(data = {}) {
  const payload = { ...data }
  const locationId = payload.location_id ?? payload.store_id ?? null

  if (locationId !== undefined) payload.location_id = locationId
  delete payload.store_id

  return payload
}

function normalizeProfilePayload(data = {}) {
  const payload = { ...data }
  const locationId = payload.location_id ?? payload.store_id ?? null

  if (locationId !== undefined) payload.location_id = locationId
  delete payload.store_id

  return payload
}

function normalizeLocationRecord(record) {
  if (!record || typeof record !== 'object') return record

  return {
    ...record,
    location_id: record.location_id ?? record.id ?? null,
  }
}

function normalizeOrderRecord(record) {
  if (!record || typeof record !== 'object') return record

  const locationId = getLocationId(record)

  return {
    ...record,
    location_id: locationId,
    store_id: record.store_id ?? locationId,
  }
}

function normalizeProfileRecord(record) {
  if (!record || typeof record !== 'object') return record

  const locationId = getLocationId(record)

  return {
    ...record,
    location_id: locationId,
    store_id: record.store_id ?? locationId,
  }
}

function normalizeList(data, normalizer) {
  return Array.isArray(data) ? data.map(normalizer) : data
}

function normalizeAuthResponse(data) {
  if (!data?.user) return data

  return {
    ...data,
    map_access: data.map_access ?? data.user?.map_access ?? null,
    user: {
      ...data.user,
      profile: normalizeProfileRecord(data.user.profile),
    },
  }
}

async function request(path, options = {}) {
  const token = useAuthStore.getState().token

  if (!token && !PUBLIC_PATHS.some((publicPath) => path.startsWith(publicPath))) {
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
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }).then(normalizeAuthResponse),
  logout: () => request('/auth/logout', { method: 'POST' }),
  getMe: () =>
    request('/auth/me').then((data) => ({
      ...data,
      profile: normalizeProfileRecord(data?.profile),
      map_access: data?.map_access ?? null,
    })),

  getVehicles: () => request('/vehicles'),
  getVehicle: (id) => request(`/vehicles/${id}`),
  createVehicle: (data) => request('/vehicles', { method: 'POST', body: JSON.stringify(data) }),
  updateVehicle: (id, data) => request(`/vehicles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteVehicle: (id) => request(`/vehicles/${id}`, { method: 'DELETE' }),
  getVehicleLocation: (id) => request(`/vehicles/${id}/location`),

  getDrivers: () => request('/drivers'),
  getDriver: (id) => request(`/drivers/${id}`),
  createDriver: (data) => request('/drivers', { method: 'POST', body: JSON.stringify(data) }),
  updateDriver: (id, data) => request(`/drivers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteDriver: (id) => request(`/drivers/${id}`, { method: 'DELETE' }),

  getBultos: () => request('/bultos'),
  createBulto: (data) => request('/bultos', { method: 'POST', body: JSON.stringify(data) }),
  deleteBulto: (id) => request(`/bultos/${id}`, { method: 'DELETE' }),
  getBlockedRiders: () => request('/bultos/blocked'),
  getAccesosLog: () => request('/bultos/accesos'),
  getActiveOrdersForVehicle: (vehicleId) => request(`/bultos/active-orders?vehicle_id=${vehicleId}`),

  getOrders: (params = {}) => {
    const normalizedParams = { ...params }
    if (normalizedParams.location_id == null && normalizedParams.store_id != null) {
      normalizedParams.location_id = normalizedParams.store_id
      delete normalizedParams.store_id
    }
    const qs = new URLSearchParams(normalizedParams).toString()
    return request(`/orders${qs ? `?${qs}` : ''}`).then((data) => normalizeList(data, normalizeOrderRecord))
  },
  createOrder: (data) =>
    request('/orders', { method: 'POST', body: JSON.stringify(normalizeOrderPayload(data)) }).then(normalizeOrderRecord),
  deleteOrder: (id) => request(`/orders/${id}`, { method: 'DELETE' }),
  uploadInvoice: (id, image_base64) =>
    request(`/orders/${id}/invoice`, { method: 'POST', body: JSON.stringify({ image_base64 }) }).then(normalizeOrderRecord),
  markOrderReady: (id) =>
    request(`/orders/${id}/ready`, { method: 'PATCH' }).then(normalizeOrderRecord),
  updateOrderStatus: (id, status) =>
    request(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }).then(normalizeOrderRecord),

  getDashboardFinancials: () => request('/orders/financials'),
  getCashByVehicle: () => request('/orders/cash-by-vehicle'),

  getWeightPresets: () => request('/weight-presets'),
  createWeightPreset: (data) => request('/weight-presets', { method: 'POST', body: JSON.stringify(data) }),
  updateWeightPreset: (id, data) => request(`/weight-presets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWeightPreset: (id) => request(`/weight-presets/${id}`, { method: 'DELETE' }),

  getLocations: () => request('/stores').then((data) => normalizeList(data, normalizeLocationRecord)),
  createLocation: (data) => request('/stores', { method: 'POST', body: JSON.stringify(data) }).then(normalizeLocationRecord),
  updateLocation: (id, data) => request(`/stores/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(normalizeLocationRecord),
  deleteLocation: (id) => request(`/stores/${id}`, { method: 'DELETE' }),

  getStores: () => api.getLocations(),
  updateStore: (id, data) => api.updateLocation(id, data),
  createStore: (data) => api.createLocation(data),
  deleteStore: (id) => api.deleteLocation(id),

  getTrips: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/trips${qs ? `?${qs}` : ''}`)
  },
  getTrip: (id) => request(`/trips/${id}`),
  startTrip: (data) => request('/trips/start', { method: 'POST', body: JSON.stringify(data) }),
  endTrip: (id, data) => request(`/trips/${id}/end`, { method: 'PUT', body: JSON.stringify(data) }),

  getCompanies: () => request('/companies'),
  createCompany: (data) => request('/companies', { method: 'POST', body: JSON.stringify(data) }),
  updateCompany: (id, data) => request(`/companies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setCompanyState: (id, state) => request(`/companies/${id}/state`, { method: 'PATCH', body: JSON.stringify({ state }) }),
  getCompanyProfiles: (companyId) => request(`/companies/${companyId}/profiles`).then((data) => normalizeList(data, normalizeProfileRecord)),
  createProfile: (companyId, data) =>
    request(`/companies/${companyId}/profiles`, {
      method: 'POST',
      body: JSON.stringify(normalizeProfilePayload(data)),
    }).then((response) => ({
      ...response,
      profile: normalizeProfileRecord(response?.profile),
    })),
  setProfileState: (id, action, reason) =>
    request(`/profiles/${id}/state`, { method: 'PATCH', body: JSON.stringify({ action, reason }) }).then(normalizeProfileRecord),
}
