const MAP_CAPABILITIES_BY_ROLE = {
  super_admin: [
    'map.view.company',
    'map.view.vehicle_last_location',
    'map.view.active_orders',
    'map.view.cash',
    'map.realtime.company',
  ],
  admin: [
    'map.view.company',
    'map.view.vehicle_last_location',
    'map.view.active_orders',
    'map.view.cash',
    'map.realtime.company',
  ],
  store: [],
}

function normalizeCapabilities(capabilities = []) {
  return Array.isArray(capabilities) ? capabilities.filter(Boolean) : [capabilities].filter(Boolean)
}

export function resolveMapPolicy(profile = null) {
  const role = profile?.role ?? null
  const capabilities = new Set(MAP_CAPABILITIES_BY_ROLE[role] || [])

  return {
    role,
    company_id: profile?.company_id ?? null,
    location_id: profile?.location_id ?? profile?.store_id ?? null,
    capabilities,
  }
}

export function serializeMapPolicy(profileOrPolicy) {
  const policy = profileOrPolicy?.capabilities instanceof Set
    ? profileOrPolicy
    : resolveMapPolicy(profileOrPolicy)

  return {
    role: policy.role,
    company_id: policy.company_id,
    location_id: policy.location_id,
    capabilities: [...policy.capabilities].sort(),
  }
}

export function hasMapCapabilities(profileOrPolicy, requiredCapabilities = [], options = {}) {
  const policy = profileOrPolicy?.capabilities instanceof Set
    ? profileOrPolicy
    : resolveMapPolicy(profileOrPolicy)

  const capabilities = normalizeCapabilities(requiredCapabilities)
  const mode = options.mode === 'any' ? 'any' : 'all'

  if (!capabilities.length) return true

  if (mode === 'any') {
    return capabilities.some((capability) => policy.capabilities.has(capability))
  }

  return capabilities.every((capability) => policy.capabilities.has(capability))
}

export function canViewCompanyMap(profileOrPolicy, options = {}) {
  const extraCapabilities = normalizeCapabilities(options.capabilities)
  return hasMapCapabilities(
    profileOrPolicy,
    ['map.view.company', ...extraCapabilities],
    { mode: 'all' },
  )
}

export function canJoinCompanyMapRealtime(profileOrPolicy, options = {}) {
  const extraCapabilities = normalizeCapabilities(options.capabilities)
  return hasMapCapabilities(
    profileOrPolicy,
    ['map.realtime.company', ...extraCapabilities],
    { mode: 'all' },
  )
}
