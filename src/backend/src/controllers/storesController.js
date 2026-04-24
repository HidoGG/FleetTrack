import { supabase } from '../db/supabase.js'
import { withLocationId } from '../utils/locationContract.js'

const VALID_LOCATION_TYPES = ['store', 'branch', 'warehouse', 'logistics', 'office', 'pickup', 'other']

function sanitizeLocation(store) {
  if (!store) return store

  return withLocationId({
    ...store,
    location_type: VALID_LOCATION_TYPES.includes(store.location_type) ? store.location_type : 'store',
    is_active: typeof store.is_active === 'boolean' ? store.is_active : true,
    rider_visible: typeof store.rider_visible === 'boolean' ? store.rider_visible : true,
    is_temporary: typeof store.is_temporary === 'boolean' ? store.is_temporary : false,
  })
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

export async function getStores(req, res) {
  const db = req.supabase ?? supabase
  const { data, error } = await db
    .from('stores')
    .select('*')
    .eq('company_id', req.profile.company_id)
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  res.json((data || []).map(sanitizeLocation))
}

export async function createStore(req, res) {
  const db = req.supabase ?? supabase
  const {
    name,
    address,
    lat,
    lng,
    location_type = 'store',
    is_active = true,
    rider_visible = true,
    is_temporary = false,
  } = req.body

  if (!name) return res.status(400).json({ error: 'name es requerido' })
  if (!VALID_LOCATION_TYPES.includes(location_type)) {
    return res.status(400).json({ error: `location_type debe ser uno de: ${VALID_LOCATION_TYPES.join(', ')}` })
  }

  const parsedLat = parseCoordinate(lat)
  const parsedLng = parseCoordinate(lng)
  if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
    return res.status(400).json({ error: 'lat/lng deben ser numeros validos' })
  }

  const { data, error } = await db
    .from('stores')
    .insert({
      company_id: req.profile.company_id,
      name:       name.trim(),
      location_type,
      address:    address || null,
      lat:        parsedLat,
      lng:        parsedLng,
      is_active,
      rider_visible,
      is_temporary,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(sanitizeLocation(data))
}

export async function updateStore(req, res) {
  const db = req.supabase ?? supabase
  const { id } = req.params
  const {
    name,
    address,
    lat,
    lng,
    location_type,
    is_active,
    rider_visible,
    is_temporary,
  } = req.body

  if (location_type !== undefined && !VALID_LOCATION_TYPES.includes(location_type)) {
    return res.status(400).json({ error: `location_type debe ser uno de: ${VALID_LOCATION_TYPES.join(', ')}` })
  }

  const parsedLat = parseCoordinate(lat)
  const parsedLng = parseCoordinate(lng)
  if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
    return res.status(400).json({ error: 'lat/lng deben ser numeros validos' })
  }

  const updates = {
    name: name?.trim(),
    address: address || null,
    lat: parsedLat,
    lng: parsedLng,
  }

  if (location_type !== undefined) updates.location_type = location_type
  if (typeof is_active === 'boolean') updates.is_active = is_active
  if (typeof rider_visible === 'boolean') updates.rider_visible = rider_visible
  if (typeof is_temporary === 'boolean') updates.is_temporary = is_temporary

  const { data, error } = await db
    .from('stores')
    .update(updates)
    .eq('id', id)
    .eq('company_id', req.profile.company_id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.json(sanitizeLocation(data))
}

export async function deleteStore(req, res) {
  const db = req.supabase ?? supabase
  const { id } = req.params
  const { error } = await db
    .from('stores')
    .delete()
    .eq('id', id)
    .eq('company_id', req.profile.company_id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
}
