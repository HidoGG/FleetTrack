import { supabaseAdmin } from '../db/supabase.js'

const VALID_PLANS  = ['basic', 'pro', 'enterprise']
const VALID_STATES = ['active', 'suspended', 'inactive']

// ── Listar todas las empresas ─────────────────────────────────────────────────
export async function listCompanies(req, res) {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

// ── Crear empresa ─────────────────────────────────────────────────────────────
export async function createCompany(req, res) {
  const {
    name, plan,
    legal_name, commercial_name, phone, email,
    billing_email, address, logo_url, commercial_comment,
  } = req.body

  if (!name?.trim()) {
    return res.status(400).json({ error: 'name es requerido' })
  }

  const effectivePlan = plan || 'basic'
  if (!VALID_PLANS.includes(effectivePlan)) {
    return res.status(400).json({ error: `plan debe ser uno de: ${VALID_PLANS.join(', ')}` })
  }

  const { data, error } = await supabaseAdmin
    .from('companies')
    .insert({
      name:                name.trim(),
      plan:                effectivePlan,
      // D-1: escribir state e is_active juntos siempre
      state:               'active',
      is_active:           true,
      legal_name:          legal_name          || null,
      commercial_name:     commercial_name     || null,
      phone:               phone               || null,
      email:               email               || null,
      billing_email:       billing_email       || null,
      address:             address             || null,
      logo_url:            logo_url            || null,
      commercial_comment:  commercial_comment  || null,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
}

// ── Actualizar datos de empresa ───────────────────────────────────────────────
// Solo actualiza los campos que vienen en el body (parcial).
// state e is_active NO se tocan aquí — usar PATCH /:id/state.
export async function updateCompany(req, res) {
  const { id } = req.params

  const UPDATABLE = [
    'name', 'plan',
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

  if ('plan' in updates && !VALID_PLANS.includes(updates.plan)) {
    return res.status(400).json({ error: `plan debe ser uno de: ${VALID_PLANS.join(', ')}` })
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
  res.json(data)
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
  res.json(data)
}
