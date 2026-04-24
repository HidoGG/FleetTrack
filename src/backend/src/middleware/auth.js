import { createRequestClient, supabase, supabaseAdmin } from '../db/supabase.js'
import { withLegacyStoreAlias } from '../utils/locationContract.js'

async function getProfileForUser(userId) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, company_id, role, full_name, store_id, state, email, last_login, company:companies(state)')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    const error = new Error('Perfil no encontrado')
    error.status = 403
    throw error
  }

  if (profile.state === 'suspended') {
    const error = new Error('Cuenta suspendida. Contacta al administrador.')
    error.status = 403
    throw error
  }

  if (profile.company_id && profile.company?.state === 'suspended') {
    const error = new Error('La empresa esta suspendida. Contacta al administrador.')
    error.status = 403
    throw error
  }

  return withLegacyStoreAlias(profile)
}

export async function resolveAuthContext(token) {
  if (!token) {
    const error = new Error('Token requerido')
    error.status = 401
    throw error
  }

  const { data, error } = await supabase.auth.getUser(token)
  const user = data?.user

  if (error || !user) {
    const authError = new Error('Token invalido o expirado')
    authError.status = 401
    throw authError
  }

  const profile = await getProfileForUser(user.id)
  return { user, profile }
}

/**
 * Verifica el JWT de Supabase y adjunta el usuario y su perfil al request.
 * Incluye state del perfil y de la empresa para bloquear accesos suspendidos.
 * Uso: router.get('/ruta', authMiddleware, handler)
 */
export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token requerido' })
  }

  const token = authHeader.split(' ')[1]

  try {
    const { user, profile } = await resolveAuthContext(token)
    req.user = user
    req.profile = profile
    req.supabase = createRequestClient(token)
    req.accessToken = token
    next()
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message })
    }

    console.error('[authMiddleware] Error inesperado:', err.message)
    return res.status(500).json({ error: 'Error de autenticacion' })
  }
}

/**
 * Restringe el acceso a admins y super_admins.
 */
export function adminOnly(req, res, next) {
  if (!['admin', 'super_admin'].includes(req.profile?.role)) {
    return res.status(403).json({ error: 'Solo administradores' })
  }
  next()
}

/**
 * Permite acceso a admin, super_admin y store.
 */
export function adminOrStore(req, res, next) {
  if (!['admin', 'super_admin', 'store'].includes(req.profile?.role)) {
    return res.status(403).json({ error: 'Acceso no autorizado' })
  }
  next()
}

/**
 * Restringe el acceso exclusivamente a super_admins.
 */
export function superAdminOnly(req, res, next) {
  if (req.profile?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Solo super administradores' })
  }
  next()
}
