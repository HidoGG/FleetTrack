import { supabase } from '../db/supabase.js'
import { emitCompanyEvent } from '../realtime/rooms.js'
import { resolveOwnedVehiclePublishContext } from '../services/gpsAuthz.js'

export async function listTrips(req, res) {
  const db = req.supabase ?? supabase
  const { status, vehicle_id, limit = 50 } = req.query

  let query = db
    .from('trips')
    .select('*, vehicles(plate, brand, model), drivers(license_number, profiles(full_name))')
    .eq('company_id', req.profile.company_id)
    .order('start_time', { ascending: false })
    .limit(Number(limit))

  if (status)     query = query.eq('status', status)
  if (vehicle_id) query = query.eq('vehicle_id', vehicle_id)

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

export async function getTrip(req, res) {
  const db = req.supabase ?? supabase
  const { data, error } = await db
    .from('trips')
    .select('*, vehicles(plate, brand, model), drivers(license_number, profiles(full_name))')
    .eq('id', req.params.id)
    .eq('company_id', req.profile.company_id)
    .single()

  if (error) return res.status(404).json({ error: 'Viaje no encontrado' })
  res.json(data)
}

export async function startTrip(req, res) {
  const db = req.supabase ?? supabase
  const { vehicle_id, driver_id, start_lat, start_lng } = req.body
  if (!vehicle_id || !driver_id) {
    return res.status(400).json({ error: 'vehicle_id y driver_id son requeridos' })
  }

  // Verificar que no haya otro viaje en curso para este vehículo
  const { data: active } = await db
    .from('trips')
    .select('id')
    .eq('vehicle_id', vehicle_id)
    .eq('status', 'in_progress')
    .single()

  if (active) {
    return res.status(409).json({ error: 'El vehículo ya tiene un viaje en curso' })
  }

  const { data, error } = await db
    .from('trips')
    .insert({
      vehicle_id,
      driver_id,
      start_lat,
      start_lng,
      company_id: req.profile.company_id,
      status: 'in_progress'
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
}

export async function endTrip(req, res) {
  const db = req.supabase ?? supabase
  const { end_lat, end_lng, km_total, notes } = req.body

  const { data, error } = await db
    .from('trips')
    .update({
      end_lat,
      end_lng,
      km_total,
      notes,
      end_time: new Date().toISOString(),
      status: 'completed'
    })
    .eq('id', req.params.id)
    .eq('company_id', req.profile.company_id)
    .eq('status', 'in_progress')
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

export async function updateLocation(req, res) {
  const db = req.supabase ?? supabase
  const { vehicle_id, trip_id, lat, lng, speed_kmh, heading } = req.body
  if (!vehicle_id || lat == null || lng == null) {
    return res.status(400).json({ error: 'vehicle_id, lat y lng son requeridos' })
  }

  const ownership = await resolveOwnedVehiclePublishContext({
    profileId: req.profile.id,
    companyId: req.profile.company_id,
    vehicleId: vehicle_id,
    tripId: trip_id ?? null,
  })

  if (ownership.error) return res.status(500).json({ error: ownership.error.message })
  if (!ownership.ok) {
    return res.status(403).json({ error: 'No autorizado para publicar GPS de este vehículo' })
  }

  const { data, error } = await db
    .from('locations')
    .insert({ vehicle_id, trip_id, lat, lng, speed_kmh, heading })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  // Emitir por Socket.io para el mapa en tiempo real
  // (el io se adjunta al req en index.js)
  emitCompanyEvent(req.io, req.profile.company_id, `vehicle:${vehicle_id}`, { vehicle_id, lat, lng, speed_kmh, heading })

  res.status(201).json(data)
}
