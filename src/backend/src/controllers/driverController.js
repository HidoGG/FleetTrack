import { supabase } from '../db/supabase.js'

// Devuelve el registro de conductor del usuario autenticado
export async function getMyDriver(req, res) {
  const db = req.supabase ?? supabase
  const { data, error } = await db
    .from('drivers')
    .select('*, vehicles(id, plate, brand, model, color, status)')
    .eq('profile_id', req.user.id)
    .single()

  if (error) return res.status(404).json({ error: 'No tenés un registro de conductor' })
  res.json(data)
}

export async function listDrivers(req, res) {
  const db = req.supabase ?? supabase
  const { data, error } = await db
    .from('drivers')
    .select('*, profiles(full_name, phone, avatar_url), vehicles(plate, brand, model)')
    .eq('company_id', req.profile.company_id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

export async function getDriver(req, res) {
  const db = req.supabase ?? supabase
  const { data, error } = await db
    .from('drivers')
    .select('*, profiles(full_name, phone, avatar_url), vehicles(plate, brand, model)')
    .eq('id', req.params.id)
    .eq('company_id', req.profile.company_id)
    .single()

  if (error) return res.status(404).json({ error: 'Conductor no encontrado' })
  res.json(data)
}

export async function createDriver(req, res) {
  const db = req.supabase ?? supabase
  const { profile_id, license_number, license_expiry, assigned_vehicle_id } = req.body
  if (!profile_id || !license_number || !license_expiry) {
    return res.status(400).json({ error: 'profile_id, license_number y license_expiry son requeridos' })
  }

  const { data, error } = await db
    .from('drivers')
    .insert({
      profile_id,
      license_number,
      license_expiry,
      assigned_vehicle_id: assigned_vehicle_id || null,
      company_id: req.profile.company_id
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json(data)
}

export async function updateDriver(req, res) {
  const db = req.supabase ?? supabase
  const { license_number, license_expiry, assigned_vehicle_id } = req.body

  const { data, error } = await db
    .from('drivers')
    .update({ license_number, license_expiry, assigned_vehicle_id })
    .eq('id', req.params.id)
    .eq('company_id', req.profile.company_id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

export async function deleteDriver(req, res) {
  const db = req.supabase ?? supabase
  const { error } = await db
    .from('drivers')
    .delete()
    .eq('id', req.params.id)
    .eq('company_id', req.profile.company_id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
}
