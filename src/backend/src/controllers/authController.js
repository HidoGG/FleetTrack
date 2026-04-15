import { supabase } from '../db/supabase.js'

export async function login(req, res) {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' })
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' })

  // Obtener perfil con state del perfil y de la empresa
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, company_id, role, full_name, store_id, state, email, last_login, company:companies(state)')
    .eq('id', data.user.id)
    .single()

  if (profileError || !profile) {
    console.error('[authController] Perfil no encontrado para:', data.user.id)
    return res.status(403).json({ error: 'Perfil de usuario no configurado. Contactá al administrador del sistema.' })
  }

  if (profile.state === 'suspended') {
    return res.status(403).json({ error: 'Cuenta suspendida. Contactá al administrador.' })
  }

  if (profile.company_id && profile.company?.state === 'suspended') {
    return res.status(403).json({ error: 'La empresa está suspendida. Contactá al administrador.' })
  }

  // Sincronizar email y registrar last_login (fire-and-forget)
  const updates = { last_login: new Date().toISOString() }
  if (!profile.email) updates.email = data.user.email
  supabase.from('profiles').update(updates).eq('id', data.user.id).then(({ error: updateError }) => {
    if (updateError) console.error('[authController] Error actualizando perfil post-login:', updateError.message)
  })

  res.json({
    token:        data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: { ...data.user, profile }
  })
}

export async function refresh(req, res) {
  const { refreshToken } = req.body
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken requerido' })
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session) {
    return res.status(401).json({ error: 'Sesión expirada, iniciá sesión nuevamente' })
  }

  res.json({
    token:        data.session.access_token,
    refreshToken: data.session.refresh_token,
  })
}

export async function logout(req, res) {
  await supabase.auth.signOut()
  res.json({ message: 'Sesión cerrada' })
}

export async function getMe(req, res) {
  res.json({ user: req.user, profile: req.profile })
}
