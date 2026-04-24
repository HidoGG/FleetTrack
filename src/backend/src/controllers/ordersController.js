import { randomBytes } from 'crypto'
import { supabase, supabaseAdmin } from '../db/supabase.js'
import { emitCompanyEvent, emitLocationScopedEvent } from '../realtime/rooms.js'
import {
  getEffectiveLocationId,
  getLocationId,
  getRequestedLocationId,
  withLegacyStoreAlias,
  withLegacyStoreAliasList,
} from '../utils/locationContract.js'

// Umbrales de efectivo para el semáforo (en pesos ARS)
const CASH_WARN   = 5_000
const CASH_DANGER = 15_000

// ── Listar pedidos (rider + admin + store) ───────────────────────────────────
export async function getOrders(req, res) {
  const db = req.supabase ?? supabase
  const { bulto_id, status } = req.query
  const companyId = req.profile.company_id
  const requestedLocationId = getRequestedLocationId(req.query)

  let query = db
    .from('orders')
    .select('*, order_items(*)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })

  if (bulto_id) query = query.eq('bulto_id', bulto_id)
  if (status)   query = query.eq('status', status)

  // Rol store: filtrar por su punto de despacho.
  // store_id permanece como alias legacy de persistencia.
  if (req.profile.role === 'store') {
    const locationId = getEffectiveLocationId({
      profile: req.profile,
      requestedLocationId,
    })
    if (locationId) query = query.eq('store_id', locationId)
  } else if (requestedLocationId) {
    query = query.eq('store_id', requestedLocationId)
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(withLegacyStoreAliasList(data))
}

// ── Crear pedido (admin + store) ──────────────────────────────────────────────
export async function createOrder(req, res) {
  const db = req.supabase ?? supabase
  const {
    bulto_id, customer_name, customer_phone,
    notes, delivery_address, delivery_lat, delivery_lng,
    is_cod, payment_amount, merchandise_value,
    product_brand, product_weight,   // legacy — seguirán funcionando
    items,                            // nuevo: array de { brand, product, quantity, weight_preset_id, weight_label }
  } = req.body

  if (!customer_name || !delivery_address) {
    return res.status(400).json({ error: 'customer_name y delivery_address son requeridos' })
  }

  // location_id es el contrato canonico; store_id queda como alias legacy de persistencia.
  const requestedLocationId = getRequestedLocationId(req.body)
  const effectiveLocationId = getEffectiveLocationId({
    profile: req.profile,
    requestedLocationId,
  })

  // Lógica de cobro condicional:
  // - is_cod=false (ya fue pagado) → forzar payment_amount=0
  // - is_cod=true o no especificado → usar el valor enviado
  const isCod         = is_cod !== false   // default true
  const effectiveAmount = isCod ? (payment_amount ? parseFloat(payment_amount) : 0) : 0

  const { data: order, error } = await db
    .from('orders')
    .insert({
      company_id:        req.profile.company_id,
      bulto_id:          bulto_id || null,
      store_id:          effectiveLocationId,
      customer_name:     customer_name.trim(),
      customer_phone:    customer_phone || null,
      notes:             notes || null,
      delivery_address:  delivery_address.trim(),
      delivery_lat:      delivery_lat  ? parseFloat(delivery_lat)  : null,
      delivery_lng:      delivery_lng  ? parseFloat(delivery_lng)  : null,
      is_cod:            isCod,
      payment_amount:    effectiveAmount,
      merchandise_value: merchandise_value ? parseFloat(merchandise_value) : 0,
      // Campos legacy (retrocompatibilidad con repartidor actual)
      product_brand:     product_brand  || null,
      product_weight:    product_weight || null,
      // Fase 1: tracking_token NOT NULL sin DEFAULT en DB — generado siempre en backend
      tracking_token:    randomBytes(16).toString('hex'),
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  // ── Insertar order_items si se enviaron ───────────────────────────────────
  if (Array.isArray(items) && items.length > 0) {
    const rows = items
      .filter(i => i.product?.trim())
      .map(i => ({
        order_id:         order.id,
        brand:            i.brand?.trim()  || null,
        product:          i.product.trim(),
        quantity:         parseInt(i.quantity) || 1,
        weight_preset_id: i.weight_preset_id || null,
        weight_label:     i.weight_label?.trim() || null,
      }))

    if (rows.length > 0) {
      const { error: itemsErr } = await db
        .from('order_items')
        .insert(rows)

      if (itemsErr) {
        console.error('[ordersController] Error insertando order_items:', itemsErr.message)
        // No fallamos el pedido entero — el pedido se creó correctamente
      }
    }
  }

  res.status(201).json(withLegacyStoreAlias(order))
}

// ── Dashboard Financiero: efectivo a rendir + valor de mercadería en ruta ─────
export async function getDashboardFinancials(req, res) {
  const db = req.supabase ?? supabase
  const companyId = req.profile.company_id
  const IN_TRANSIT_STATUSES = ['ACCEPTED', 'IN_TRANSIT']

  // Efectivo a rendir: pedidos COD activos (en tránsito)
  const { data: codOrders, error: e1 } = await db
    .from('orders')
    .select('payment_amount')
    .eq('company_id', companyId)
    .eq('is_cod', true)
    .in('status', IN_TRANSIT_STATUSES)

  if (e1) return res.status(500).json({ error: e1.message })

  const cashInTransit = (codOrders || []).reduce(
    (sum, o) => sum + parseFloat(o.payment_amount || 0), 0
  )

  // Valor de mercadería: todos los pedidos activos (no solo COD)
  const { data: activeOrders, error: e2 } = await db
    .from('orders')
    .select('merchandise_value')
    .eq('company_id', companyId)
    .in('status', [...IN_TRANSIT_STATUSES, 'READY_FOR_PICKUP'])

  if (e2) return res.status(500).json({ error: e2.message })

  const merchandiseValue = (activeOrders || []).reduce(
    (sum, o) => sum + parseFloat(o.merchandise_value || 0), 0
  )

  res.json({
    cash_in_transit:   cashInTransit,
    merchandise_value: merchandiseValue,
  })
}

// ── Efectivo por vehículo (semáforo del mapa) ─────────────────────────────────
// Devuelve: { [vehicle_id]: { amount: number, level: 'normal'|'warning'|'danger' } }
export async function getCashByVehicle(req, res) {
  const db = req.supabase ?? supabase
  const companyId = req.profile.company_id

  // 1. Pedidos COD en tránsito con su bulto_id
  const { data: orders, error: e1 } = await db
    .from('orders')
    .select('bulto_id, payment_amount')
    .eq('company_id', companyId)
    .eq('is_cod', true)
    .in('status', ['ACCEPTED', 'IN_TRANSIT'])
    .gt('payment_amount', 0)

  if (e1) return res.status(500).json({ error: e1.message })
  if (!orders?.length) return res.json({})

  // 2. Bultos correspondientes → active_driver_profile_id
  const bultoIds = [...new Set(orders.map(o => o.bulto_id).filter(Boolean))]
  if (!bultoIds.length) return res.json({})

  const { data: bultos, error: e2 } = await db
    .from('bultos')
    .select('id, active_driver_profile_id')
    .in('id', bultoIds)

  if (e2) return res.status(500).json({ error: e2.message })

  // 3. Conductores → assigned_vehicle_id
  const profileIds = [...new Set((bultos || []).map(b => b.active_driver_profile_id).filter(Boolean))]
  if (!profileIds.length) return res.json({})

  const { data: drivers, error: e3 } = await db
    .from('drivers')
    .select('profile_id, assigned_vehicle_id')
    .in('profile_id', profileIds)

  if (e3) return res.status(500).json({ error: e3.message })

  // 4. Construir lookups
  const bultoToProfile  = {}
  ;(bultos  || []).forEach(b => { bultoToProfile[b.id] = b.active_driver_profile_id })

  const profileToVehicle = {}
  ;(drivers || []).forEach(d => { profileToVehicle[d.profile_id] = d.assigned_vehicle_id })

  // 5. Sumar efectivo por vehículo
  const cashMap = {}
  orders.forEach(o => {
    const profileId = bultoToProfile[o.bulto_id]
    const vehicleId = profileToVehicle[profileId]
    if (!vehicleId) return
    cashMap[vehicleId] = (cashMap[vehicleId] || 0) + parseFloat(o.payment_amount)
  })

  // 6. Asignar nivel de semáforo
  const result = {}
  Object.entries(cashMap).forEach(([vehicleId, amount]) => {
    result[vehicleId] = {
      amount,
      level: amount >= CASH_DANGER ? 'danger' : amount >= CASH_WARN ? 'warning' : 'normal',
    }
  })

  res.json(result)
}

// ── Actualizar estado de un pedido ───────────────────────────────────────────
export async function updateOrderStatus(req, res) {
  const db = req.supabase ?? supabase
  const { id } = req.params
  const { status } = req.body
  const VALID = ['PENDING', 'READY_FOR_PICKUP', 'ACCEPTED', 'IN_TRANSIT', 'DELIVERED', 'FAILED']

  if (!VALID.includes(status)) {
    return res.status(400).json({ error: `status debe ser uno de: ${VALID.join(', ')}` })
  }

  // Timestamps automáticos según transición
  const extra = {}
  if (status === 'ACCEPTED')    extra.accepted_at   = new Date().toISOString()
  if (status === 'IN_TRANSIT')  extra.picked_up_at  = new Date().toISOString()
  if (status === 'DELIVERED')   extra.delivered_at  = new Date().toISOString()

  const { data, error } = await db
    .from('orders')
    .update({ status, ...extra })
    .eq('id', id)
    .eq('company_id', req.profile.company_id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })

  const locationId = getLocationId(data.location_id, data.store_id)
  const payload = {
    orderId:     data.id,
    status:      data.status,
    bulto_id:    data.bulto_id,
    store_id:    data.store_id,
    location_id: locationId,
    company_id:  data.company_id,
  }

  emitCompanyEvent(req.io, data.company_id, 'order:status_update', payload)

  if (locationId) {
    if (status === 'READY_FOR_PICKUP') emitLocationScopedEvent(req.io, locationId, 'order_ready', payload)
    if (status === 'ACCEPTED')         emitLocationScopedEvent(req.io, locationId, 'order_accepted', payload)
    if (status === 'IN_TRANSIT')       emitLocationScopedEvent(req.io, locationId, 'order_picked_up', payload)
    if (status === 'DELIVERED')        emitLocationScopedEvent(req.io, locationId, 'order_delivered', payload)
  }

  res.json(withLegacyStoreAlias(data))
}

// ── Marcar pedido como Listo para Retiro (store) ──────────────────────────────
export async function markReadyForPickup(req, res) {
  const db = req.supabase ?? supabase
  const { id } = req.params

  const { data, error } = await db
    .from('orders')
    .update({ status: 'READY_FOR_PICKUP' })
    .eq('id', id)
    .eq('company_id', req.profile.company_id)
    .in('status', ['PENDING'])
    .select()
    .single()

  if (error || !data) {
    return res.status(400).json({ error: error?.message || 'El pedido no está en estado PENDING' })
  }

  const locationId = getLocationId(data.location_id, data.store_id)
  const payload = {
    orderId:     data.id,
    status:      'READY_FOR_PICKUP',
    store_id:    data.store_id,
    location_id: locationId,
    company_id:  data.company_id,
  }
  emitCompanyEvent(req.io, data.company_id, 'order:status_update', payload)
  emitLocationScopedEvent(req.io, locationId, 'order_ready', payload)

  res.json(withLegacyStoreAlias(data))
}

// ── Subir foto de entrega (PoD) y marcar DELIVERED ────────────────────────────
export async function uploadPoD(req, res) {
  const db = req.supabase ?? supabase
  const { id } = req.params
  const { image_base64 } = req.body

  if (!image_base64) {
    return res.status(400).json({ error: 'image_base64 es requerido' })
  }

  const { data: order, error: findErr } = await db
    .from('orders')
    .select('id, status')
    .eq('id', id)
    .eq('company_id', req.profile.company_id)
    .single()

  if (findErr || !order) {
    return res.status(404).json({ error: 'Pedido no encontrado' })
  }

  const buffer   = Buffer.from(image_base64, 'base64')
  const filename = `pod_${id}_${Date.now()}.jpg`

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('pod-photos')
    .upload(filename, buffer, { contentType: 'image/jpeg', upsert: false })

  if (uploadErr) {
    console.error('[ordersController] Storage upload error:', uploadErr.message)
    return res.status(500).json({ error: 'Error al subir la imagen: ' + uploadErr.message })
  }

  const { data: urlData } = supabaseAdmin.storage
    .from('pod-photos')
    .getPublicUrl(filename)

  const { data: updated, error: updateErr } = await db
    .from('orders')
    .update({
      status:        'DELIVERED',
      pod_photo_url: urlData.publicUrl,
      delivered_at:  new Date().toISOString(),
    })
    .eq('id', id)
    .eq('company_id', req.profile.company_id)
    .select()
    .single()

  if (updateErr) return res.status(500).json({ error: updateErr.message })

  const locationId = getLocationId(updated.location_id, updated.store_id)
  const deliveredPayload = {
    orderId:     id,
    status:      'DELIVERED',
    bulto_id:    updated.bulto_id,
    store_id:    updated.store_id,
    location_id: locationId,
    company_id:  updated.company_id,
  }
  emitCompanyEvent(req.io, updated.company_id, 'order:status_update', deliveredPayload)
  emitLocationScopedEvent(req.io, locationId, 'order_delivered', deliveredPayload)

  res.json(withLegacyStoreAlias(updated))
}

// ── Subir foto de factura/remito (Store) ──────────────────────────────────────
export async function uploadInvoice(req, res) {
  const db = req.supabase ?? supabase
  const { id } = req.params
  const { image_base64 } = req.body

  if (!image_base64) {
    return res.status(400).json({ error: 'image_base64 es requerido' })
  }

  const { data: order, error: findErr } = await db
    .from('orders')
    .select('id')
    .eq('id', id)
    .eq('company_id', req.profile.company_id)
    .single()

  if (findErr || !order) {
    return res.status(404).json({ error: 'Pedido no encontrado' })
  }

  const buffer   = Buffer.from(image_base64, 'base64')
  const filename = `invoices/inv_${id}_${Date.now()}.jpg`

  const { error: uploadErr } = await supabaseAdmin.storage
    .from('pod-photos')
    .upload(filename, buffer, { contentType: 'image/jpeg', upsert: false })

  if (uploadErr) {
    return res.status(500).json({ error: 'Error al subir la imagen: ' + uploadErr.message })
  }

  const { data: urlData } = supabaseAdmin.storage
    .from('pod-photos')
    .getPublicUrl(filename)

  const { data: updated, error: updateErr } = await db
    .from('orders')
    .update({ invoice_photo_url: urlData.publicUrl })
    .eq('id', id)
    .eq('company_id', req.profile.company_id)
    .select()
    .single()

  if (updateErr) return res.status(500).json({ error: updateErr.message })
  res.json(withLegacyStoreAlias(updated))
}

// ── Eliminar pedido (admin) ───────────────────────────────────────────────────
export async function deleteOrder(req, res) {
  const db = req.supabase ?? supabase
  const { id } = req.params
  const { error } = await db
    .from('orders')
    .delete()
    .eq('id', id)
    .eq('company_id', req.profile.company_id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
}
