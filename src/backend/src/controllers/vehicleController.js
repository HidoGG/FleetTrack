import { supabase } from '../db/supabase.js'

export async function listVehicles(req, res) {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('company_id', req.profile.company_id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

export async function getVehicle(req, res) {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', req.params.id)
    .eq('company_id', req.profile.company_id)
    .single()

  if (error) return res.status(404).json({ error: 'Vehículo no encontrado' })
  res.json(data)
}

export async function createVehicle(req, res) {
  const { plate, brand, model, year, color } = req.body
  if (!plate || !brand || !model) {
    return res.status(400).json({ error: 'plate, brand y model son requeridos' })
  }

  const { data, error } = await supabase
    .from('vehicles')
    .insert({ plate, brand, model, year, color, company_id: req.profile.company_id })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
}

export async function updateVehicle(req, res) {
  const { plate, brand, model, year, color, status, odometer_km } = req.body

  const { data, error } = await supabase
    .from('vehicles')
    .update({ plate, brand, model, year, color, status, odometer_km })
    .eq('id', req.params.id)
    .eq('company_id', req.profile.company_id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

export async function deleteVehicle(req, res) {
  const { error } = await supabase
    .from('vehicles')
    .delete()
    .eq('id', req.params.id)
    .eq('company_id', req.profile.company_id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
}

export async function getVehicleLastLocation(req, res) {
  const { data, error } = await supabase
    .from('locations')
    .select('lat, lng, speed_kmh, heading, timestamp')
    .eq('vehicle_id', req.params.id)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()

  if (error) return res.status(404).json({ error: 'Sin ubicación registrada' })
  res.json(data)
}
