import { supabase } from '../db/supabase.js'

// ── Validar código de lote + conteo (driver/rider) ───────────────────────────
export async function validateLote(req, res) {
  const { codigo_lote, conteo_ingresado } = req.body
  const profileId = req.profile.id
  const companyId = req.profile.company_id

  if (!codigo_lote || conteo_ingresado == null) {
    return res.status(400).json({ error: 'codigo_lote y conteo_ingresado son requeridos' })
  }

  // 1. Leer estado actual del perfil
  const { data: profile } = await supabase
    .from('profiles')
    .select('intentos_fallidos, esta_bloqueado')
    .eq('id', profileId)
    .single()

  // Si ya está bloqueado, rechazar sin consumir más intentos
  if (profile?.esta_bloqueado) {
    return res.status(403).json({
      result: 'BLOCKED',
      error: 'Tu acceso está bloqueado. Pedí la clave de desbloqueo a tu supervisor.',
    })
  }

  // 2. Buscar el lote por código y empresa
  const { data: bulto } = await supabase
    .from('bultos')
    .select('id, codigo_lote, cantidad_esperada')
    .eq('codigo_lote', codigo_lote.trim().toUpperCase())
    .eq('company_id', companyId)
    .maybeSingle()

  // ── CÓDIGO INCORRECTO ──────────────────────────────────────────────────────
  if (!bulto) {
    const nuevoIntentos = (profile?.intentos_fallidos || 0) + 1
    const seBloquea = nuevoIntentos >= 3

    await supabase
      .from('profiles')
      .update({
        intentos_fallidos: nuevoIntentos,
        esta_bloqueado: seBloquea,
        ...(seBloquea ? { ultimo_codigo_lote: codigo_lote.trim().toUpperCase() } : {}),
      })
      .eq('id', profileId)

    // Log del intento fallido
    await supabase.from('accesos_lote').insert({
      profile_id: profileId,
      codigo_lote: codigo_lote.trim().toUpperCase(),
      conteo_ingresado: parseInt(conteo_ingresado) || 0,
      conteo_esperado: 0,
      tiene_diferencia: false,
      bloqueado_por_codigo: true,
    })

    if (seBloquea) {
      return res.json({
        result: 'BLOCKED',
        message: 'Demasiados intentos fallidos. Tu cuenta fue bloqueada. Contactá a tu supervisor.',
      })
    }

    const restantes = 3 - nuevoIntentos
    return res.json({
      result: 'WRONG_CODE',
      message: `Código incorrecto. Te quedan ${restantes} intento${restantes !== 1 ? 's' : ''}.`,
      intentos_restantes: restantes,
    })
  }

  // ── CÓDIGO CORRECTO: resetear contador de intentos ─────────────────────────
  await supabase
    .from('profiles')
    .update({ intentos_fallidos: 0, ultimo_codigo_lote: bulto.codigo_lote })
    .eq('id', profileId)

  // 3. Verificar conteo
  const conteoNum = parseInt(conteo_ingresado)
  const diferencia = conteoNum !== bulto.cantidad_esperada

  // Log de acceso exitoso (con o sin diferencia)
  await supabase.from('accesos_lote').insert({
    profile_id: profileId,
    codigo_lote: bulto.codigo_lote,
    conteo_ingresado: conteoNum,
    conteo_esperado: bulto.cantidad_esperada,
    tiene_diferencia: diferencia,
    bloqueado_por_codigo: false,
  })

  // Marcar el bulto como EN_RUTA y registrar el driver activo
  await supabase
    .from('bultos')
    .update({ estado: 'EN_RUTA', active_driver_profile_id: profileId })
    .eq('id', bulto.id)

  // Obtener assigned_vehicle_id del driver para tracking GPS
  const { data: driver } = await supabase
    .from('drivers')
    .select('id, assigned_vehicle_id')
    .eq('profile_id', profileId)
    .maybeSingle()

  const vehicleId = driver?.assigned_vehicle_id || null

  // ── Notificar al panel admin en tiempo real que este vehículo tiene lote activo
  if (vehicleId) {
    req.io?.emit('bulto:activated', {
      vehicle_id: vehicleId,
      bulto_id:   bulto.id,
      company_id: companyId,
    })
  }

  if (diferencia) {
    return res.json({
      result: 'COUNT_MISMATCH',
      message: `Conteo difiere. Esperado: ${bulto.cantidad_esperada}, Ingresado: ${conteoNum}. ¿Confirmar y continuar?`,
      cantidad_esperada: bulto.cantidad_esperada,
      conteo_ingresado: conteoNum,
      bulto_id: bulto.id,
      vehicle_id: vehicleId,
    })
  }

  return res.json({
    result: 'OK',
    message: 'Acceso concedido.',
    bulto_id: bulto.id,
    vehicle_id: vehicleId,
  })
}

// ── Desbloquear rider con clave de supervisor ─────────────────────────────────
export async function unlockRider(req, res) {
  const { codigo_lote, clave_desbloqueo } = req.body
  const profileId = req.profile.id
  const companyId = req.profile.company_id

  if (!codigo_lote || !clave_desbloqueo) {
    return res.status(400).json({ error: 'codigo_lote y clave_desbloqueo son requeridos' })
  }

  // Verificar que la clave corresponde al bulto de esta empresa
  const { data: bulto } = await supabase
    .from('bultos')
    .select('id, clave_desbloqueo')
    .eq('codigo_lote', codigo_lote.trim().toUpperCase())
    .eq('company_id', companyId)
    .maybeSingle()

  if (!bulto || bulto.clave_desbloqueo !== clave_desbloqueo.trim()) {
    return res.status(403).json({ error: 'Clave de desbloqueo incorrecta.' })
  }

  // Desbloquear el perfil del rider
  await supabase
    .from('profiles')
    .update({ intentos_fallidos: 0, esta_bloqueado: false })
    .eq('id', profileId)

  res.json({ result: 'UNLOCKED', message: 'Acceso restaurado correctamente.' })
}

// ── Listar lotes (admin) ──────────────────────────────────────────────────────
export async function getBultos(req, res) {
  const { data, error } = await supabase
    .from('bultos')
    .select('*')
    .eq('company_id', req.profile.company_id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

// ── Crear lote (admin) ────────────────────────────────────────────────────────
export async function createBulto(req, res) {
  const { codigo_lote, cantidad_esperada, clave_desbloqueo, descripcion } = req.body

  if (!codigo_lote || !cantidad_esperada || !clave_desbloqueo) {
    return res.status(400).json({ error: 'codigo_lote, cantidad_esperada y clave_desbloqueo son requeridos' })
  }

  const { data, error } = await supabase
    .from('bultos')
    .insert({
      company_id:       req.profile.company_id,
      codigo_lote:      codigo_lote.trim().toUpperCase(),
      cantidad_esperada: parseInt(cantidad_esperada),
      clave_desbloqueo: clave_desbloqueo.trim(),
      descripcion:      descripcion || null,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
}

// ── Eliminar lote (admin) ─────────────────────────────────────────────────────
export async function deleteBulto(req, res) {
  const { id } = req.params
  const { error } = await supabase
    .from('bultos')
    .delete()
    .eq('id', id)
    .eq('company_id', req.profile.company_id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
}

// ── Riders bloqueados con su clave de desbloqueo (admin) ──────────────────────
export async function getBlockedRiders(req, res) {
  const { data: blocked, error } = await supabase
    .from('profiles')
    .select('id, full_name, ultimo_codigo_lote, intentos_fallidos')
    .eq('company_id', req.profile.company_id)
    .eq('esta_bloqueado', true)

  if (error) return res.status(500).json({ error: error.message })
  if (!blocked.length) return res.json([])

  // Enriquecer con la clave del último lote intentado
  const enriched = await Promise.all(
    blocked.map(async (p) => {
      let clave_desbloqueo = null
      if (p.ultimo_codigo_lote) {
        const { data: bulto } = await supabase
          .from('bultos')
          .select('clave_desbloqueo')
          .eq('codigo_lote', p.ultimo_codigo_lote)
          .eq('company_id', req.profile.company_id)
          .maybeSingle()
        clave_desbloqueo = bulto?.clave_desbloqueo || null
      }
      return { ...p, clave_desbloqueo }
    })
  )

  res.json(enriched)
}

// ── Historial de accesos para auditoría (admin) ───────────────────────────────
export async function getAccesosLog(req, res) {
  // Obtener IDs de profiles de esta empresa
  const { data: companyProfiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('company_id', req.profile.company_id)

  const profileIds = (companyProfiles || []).map((p) => p.id)
  if (!profileIds.length) return res.json([])

  const { data, error } = await supabase
    .from('accesos_lote')
    .select('*, profiles(full_name)')
    .in('profile_id', profileIds)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

// ── Pedidos activos de un vehículo (admin — para el mapa) ─────────────────────
export async function getActiveOrdersForVehicle(req, res) {
  const { vehicle_id } = req.query
  const companyId = req.profile.company_id

  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id es requerido' })

  // 1. Buscar conductor asignado a este vehículo
  const { data: driver } = await supabase
    .from('drivers')
    .select('id, profile_id')
    .eq('assigned_vehicle_id', vehicle_id)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!driver) {
    console.warn(`[getActiveOrdersForVehicle] Sin conductor para vehicle_id=${vehicle_id} company=${companyId}`)
    return res.json({ bulto: null, orders: [], _debug: 'no_driver' })
  }

  if (!driver.profile_id) {
    console.warn(`[getActiveOrdersForVehicle] Conductor id=${driver.id} no tiene profile_id`)
    return res.json({ bulto: null, orders: [], _debug: 'driver_missing_profile_id' })
  }

  // 2. Buscar bulto activo — primero EN_RUTA, luego cualquier estado activo (fallback)
  let { data: bulto } = await supabase
    .from('bultos')
    .select('id, codigo_lote, cantidad_esperada, estado')
    .eq('active_driver_profile_id', driver.profile_id)
    .eq('estado', 'EN_RUTA')
    .eq('company_id', companyId)
    .maybeSingle()

  if (!bulto) {
    // Fallback: el bulto existe pero puede estar en otro estado distinto a COMPLETADO
    const { data: fallbackBulto } = await supabase
      .from('bultos')
      .select('id, codigo_lote, cantidad_esperada, estado')
      .eq('active_driver_profile_id', driver.profile_id)
      .eq('company_id', companyId)
      .neq('estado', 'COMPLETADO')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    bulto = fallbackBulto

    if (!bulto) {
      console.warn(
        `[getActiveOrdersForVehicle] Sin bulto activo para profile_id=${driver.profile_id} ` +
        `(vehicle=${vehicle_id}). Verificá que el repartidor validó el lote en la app.`
      )
      return res.json({ bulto: null, orders: [], _debug: 'no_active_bulto' })
    }
  }

  // 3. Obtener pedidos del lote
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .eq('bulto_id', bulto.id)
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ bulto, orders: orders || [] })
}
