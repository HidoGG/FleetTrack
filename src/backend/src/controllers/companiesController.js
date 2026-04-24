import { supabaseAdmin } from '../db/supabase.js'

const VALID_PLANS = ['basic', 'pro', 'enterprise']
const VALID_STATES = ['active', 'suspended', 'inactive']
const VALID_COMMERCIAL_STATUSES = ['trial', 'active', 'past_due', 'paused', 'cancelled']

const FEATURE_KEYS = [
  'live_tracking',
  'incidents',
  'advanced_history',
  'financial_dashboard',
  'invoice_capture',
  'multi_location',
  'full_traceability',
  'operational_rollback',
  'advanced_metrics',
]

const LIMIT_KEYS = ['profiles', 'stores', 'drivers', 'vehicles']
const ADDON_KEYS = ['priority_support', 'white_label', 'extra_integrations']

const PLAN_DEFAULTS = {
  basic: {
    feature_flags: {
      live_tracking: true,
      incidents: false,
      advanced_history: false,
      financial_dashboard: false,
      invoice_capture: true,
      multi_location: false,
      full_traceability: false,
      operational_rollback: false,
      advanced_metrics: false,
    },
    limits_config: {
      profiles: 3,
      stores: 1,
      drivers: 5,
      vehicles: 5,
    },
    addons: [],
  },
  pro: {
    feature_flags: {
      live_tracking: true,
      incidents: true,
      advanced_history: true,
      financial_dashboard: true,
      invoice_capture: true,
      multi_location: true,
      full_traceability: false,
      operational_rollback: false,
      advanced_metrics: true,
    },
    limits_config: {
      profiles: 12,
      stores: 4,
      drivers: 20,
      vehicles: 20,
    },
    addons: ['priority_support'],
  },
  enterprise: {
    feature_flags: {
      live_tracking: true,
      incidents: true,
      advanced_history: true,
      financial_dashboard: true,
      invoice_capture: true,
      multi_location: true,
      full_traceability: true,
      operational_rollback: true,
      advanced_metrics: true,
    },
    limits_config: {
      profiles: 50,
      stores: 20,
      drivers: 100,
      vehicles: 100,
    },
    addons: ['priority_support', 'white_label', 'extra_integrations'],
  },
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function getPlanDefaults(plan) {
  return clone(PLAN_DEFAULTS[plan] || PLAN_DEFAULTS.basic)
}

function sanitizeFeatureFlags(value, fallbackPlan = 'basic') {
  const defaults = getPlanDefaults(fallbackPlan).feature_flags
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}

  return FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = typeof source[key] === 'boolean' ? source[key] : defaults[key]
    return acc
  }, {})
}

function sanitizeLimitsConfig(value, fallbackPlan = 'basic') {
  const defaults = getPlanDefaults(fallbackPlan).limits_config
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}

  return LIMIT_KEYS.reduce((acc, key) => {
    const raw = source[key]
    if (raw === null) {
      acc[key] = null
      return acc
    }

    if (raw === undefined || raw === '') {
      acc[key] = defaults[key]
      return acc
    }

    const parsed = Number(raw)
    acc[key] = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : defaults[key]
    return acc
  }, {})
}

function sanitizeAddons(value, fallbackPlan = 'basic') {
  const defaults = getPlanDefaults(fallbackPlan).addons
  const source = Array.isArray(value) ? value : defaults
  return [...new Set(source.filter((item) => ADDON_KEYS.includes(item)))]
}

function sanitizeCompanyRecord(company) {
  if (!company) return company

  const effectivePlan = company.plan || 'basic'

  return {
    ...company,
    commercial_status: VALID_COMMERCIAL_STATUSES.includes(company.commercial_status)
      ? company.commercial_status
      : 'trial',
    feature_flags: sanitizeFeatureFlags(company.feature_flags, effectivePlan),
    limits_config: sanitizeLimitsConfig(company.limits_config, effectivePlan),
    addons: sanitizeAddons(company.addons, effectivePlan),
  }
}

function buildCommercialConfig(body, fallback = {}) {
  const effectivePlan = body.plan || fallback.plan || 'basic'
  if (!VALID_PLANS.includes(effectivePlan)) {
    throw new Error(`plan debe ser uno de: ${VALID_PLANS.join(', ')}`)
  }

  const commercialStatus = body.commercial_status ?? fallback.commercial_status ?? 'trial'
  if (!VALID_COMMERCIAL_STATUSES.includes(commercialStatus)) {
    throw new Error(`commercial_status debe ser uno de: ${VALID_COMMERCIAL_STATUSES.join(', ')}`)
  }

  return {
    plan: effectivePlan,
    commercial_status: commercialStatus,
    feature_flags: sanitizeFeatureFlags(body.feature_flags ?? fallback.feature_flags, effectivePlan),
    limits_config: sanitizeLimitsConfig(body.limits_config ?? fallback.limits_config, effectivePlan),
    addons: sanitizeAddons(body.addons ?? fallback.addons, effectivePlan),
  }
}


// ── Listar todas las empresas ─────────────────────────────────────────────────
export async function listCompanies(req, res) {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json((data || []).map(sanitizeCompanyRecord))
}

// ── Crear empresa ─────────────────────────────────────────────────────────────
export async function createCompany(req, res) {
  const {
    name,
    legal_name, commercial_name, phone, email,
    billing_email, address, logo_url, commercial_comment,
  } = req.body

  if (!name?.trim()) {
    return res.status(400).json({ error: 'name es requerido' })
  }

  let commercialConfig
  try {
    commercialConfig = buildCommercialConfig(req.body)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  const payload = {
    name: name.trim(),
    plan: commercialConfig.plan,
    state: 'active',
    is_active: true,
    legal_name: legal_name || null,
    commercial_name: commercial_name || null,
    phone: phone || null,
    email: email || null,
    billing_email: billing_email || null,
    address: address || null,
    logo_url: logo_url || null,
    commercial_comment: commercial_comment || null,
    commercial_status: commercialConfig.commercial_status,
    feature_flags: commercialConfig.feature_flags,
    limits_config: commercialConfig.limits_config,
    addons: commercialConfig.addons,
  }

  const { data, error } = await supabaseAdmin
    .from('companies')
    .insert(payload)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(sanitizeCompanyRecord(data))
}

// ── Actualizar datos de empresa ───────────────────────────────────────────────
// Solo actualiza los campos que vienen en el body (parcial).
// state e is_active NO se tocan aquí — usar PATCH /:id/state.
export async function updateCompany(req, res) {
  const { id } = req.params

  const { data: current, error: currentError } = await supabaseAdmin
    .from('companies')
    .select('*')
    .eq('id', id)
    .single()

  if (currentError || !current) {
    return res.status(404).json({ error: 'Empresa no encontrada' })
  }

  const UPDATABLE = [
    'name',
    'legal_name', 'commercial_name', 'phone', 'email',
    'billing_email', 'address', 'logo_url', 'commercial_comment',
  ]

  const updates = {}
  for (const field of UPDATABLE) {
    if (field in req.body) updates[field] = req.body[field] ?? null
  }

  if ('name' in updates) {
    if (!updates.name?.trim()) return res.status(400).json({ error: 'name no puede estar vacío' })
    updates.name = updates.name.trim()
  }

  try {
    Object.assign(updates, buildCommercialConfig(req.body, sanitizeCompanyRecord(current)))
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No se enviaron campos para actualizar' })
  }

  const { data, error } = await supabaseAdmin
    .from('companies')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.json(sanitizeCompanyRecord(data))
}

// ── Cambiar estado de empresa ─────────────────────────────────────────────────
// D-1: escribe state e is_active juntos.
// Guard: no se puede suspender la empresa propia del super_admin (plataforma).
export async function setCompanyState(req, res) {
  const { id } = req.params
  const { state } = req.body

  if (!VALID_STATES.includes(state)) {
    return res.status(400).json({ error: `state debe ser uno de: ${VALID_STATES.join(', ')}` })
  }

  // Prevenir que el super_admin suspenda la empresa a la que pertenece (platform)
  if (state !== 'active' && id === req.profile.company_id) {
    return res.status(403).json({ error: 'No podés suspender la empresa de plataforma' })
  }

  const is_active = state === 'active'

  const { data, error } = await supabaseAdmin
    .from('companies')
    .update({ state, is_active })
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.json(sanitizeCompanyRecord(data))
}
