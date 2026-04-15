import { supabase } from '../db/supabase.js'

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
    const { data, error } = await supabase.auth.getUser(token)
    const user = data?.user

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido o expirado' })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, company_id, role, full_name, store_id, state, email, last_login, company:companies(state)')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return res.status(403).json({ error: 'Perfil no encontrado' })
    }

    if (profile.state === 'suspended') {
      return res.status(403).json({ error: 'Cuenta suspendida. Contactá al administrador.' })
    }

    if (profile.company_id && profile.company?.state === 'suspended') {
      return res.status(403).json({ error: 'La empresa está suspendida. Contactá al administrador.' })
    }

    req.user    = user
    req.profile = profile
    next()
  } catch (err) {
    console.error('[authMiddleware] Error inesperado:', err.message)
    return res.status(500).json({ error: 'Error de autenticación' })
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
