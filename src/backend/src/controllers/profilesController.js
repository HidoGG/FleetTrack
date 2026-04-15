import { supabaseAdmin } from '../db/supabase.js'

const ALLOWED_ROLES = ['admin', 'store']

// ── Listar perfiles de una empresa ────────────────────────────────────────────
export async function listProfiles(req, res) {
  const { companyId } = req.params

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, company_id, role, full_name, phone, store_id, email, state, last_login, suspended_at, suspended_reason, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

// ── Crear perfil en una empresa ───────────────────────────────────────────────
// Flujo:
//   1. Crear usuario en auth.users (email + password, email_confirm=true)
//   2. Insertar fila en profiles enlazada al user id
//   3. Si el insert de profiles falla → rollback del auth user
export async function createProfile(req, res) {
  const { companyId } = req.params
  const { email, password, role, full_name, phone, store_id } = req.body

  if (!email || !password || !role || !full_name) {
    return res.status(400).json({ error: 'email, password, role y full_name son requeridos' })
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: `role debe ser uno de: ${ALLOWED_ROLES.join(', ')}` })
  }

  if (role === 'store' && !store_id) {
    return res.status(400).json({ error: 'store_id es requerido para el rol store' })
  }

  // 1. Crear usuario en Supabase Auth
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) return res.status(400).json({ error: authError.message })

  // 2. Crear perfil enlazado al user id
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id:         authData.user.id,
      company_id: companyId,
      role,
      full_name:  full_name.trim(),
      phone:      phone    || null,
      store_id:   store_id || null,
      email,
      state:      'active',
    })
    .select()
    .single()

  if (profileError) {
    // Rollback: eliminar el auth user para no dejar huérfanos
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return res.status(400).json({ error: profileError.message })
  }

  res.status(201).json({ user: { id: authData.user.id, email: authData.user.email }, profile })
}

// ── Cambiar estado de un perfil ───────────────────────────────────────────────
// D-2: suspend escribe state + suspended_at + suspended_reason.
//      activate limpia los tres campos.
// Guard: un super_admin no puede auto-suspenderse.
export async function setProfileState(req, res) {
  const { id } = req.params
  const { action, reason } = req.body

  if (!['suspend', 'activate'].includes(action)) {
    return res.status(400).json({ error: 'action debe ser suspend o activate' })
  }

  if (action === 'suspend' && !reason?.trim()) {
    return res.status(400).json({ error: 'reason es requerido para suspender un perfil' })
  }

  // Prevenir auto-suspensión
  if (action === 'suspend' && id === req.profile.id) {
    return res.status(403).json({ error: 'No podés suspender tu propio perfil' })
  }

  const updates = action === 'suspend'
    ? {
        state:             'suspended',
        suspended_at:      new Date().toISOString(),
        suspended_reason:  reason.trim(),
      }
    : {
        state:             'active',
        suspended_at:      null,
        suspended_reason:  null,
      }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
}
