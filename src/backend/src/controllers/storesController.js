import { supabase } from '../db/supabase.js'

export async function getStores(req, res) {
  const { data, error } = await supabase
    .from('stores')
    .select('*')
    .eq('company_id', req.profile.company_id)
    .order('name')

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

export async function createStore(req, res) {
  const { name, address, lat, lng } = req.body
  if (!name) return res.status(400).json({ error: 'name es requerido' })

  const { data, error } = await supabase
    .from('stores')
    .insert({
      company_id: req.profile.company_id,
      name:       name.trim(),
      address:    address || null,
      lat:        lat  ? parseFloat(lat)  : null,
      lng:        lng  ? parseFloat(lng)  : null,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
}

export async function updateStore(req, res) {
  const { id } = req.params
  const { name, address, lat, lng } = req.body

  const { data, error } = await supabase
    .from('stores')
    .update({
      name:    name?.trim(),
      address: address || null,
      lat:     lat ? parseFloat(lat) : null,
      lng:     lng ? parseFloat(lng) : null,
    })
    .eq('id', id)
    .eq('company_id', req.profile.company_id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.json(data)
}

export async function deleteStore(req, res) {
  const { id } = req.params
  const { error } = await supabase
    .from('stores')
    .delete()
    .eq('id', id)
    .eq('company_id', req.profile.company_id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
}
