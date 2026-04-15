import { supabase } from '../db/supabase.js'

// ── Listar presets activos (admin + store — para los dropdowns del formulario) ─
export async function getWeightPresets(req, res) {
  const companyId = req.profile.company_id

  const { data, error } = await supabase
    .from('weight_presets')
    .select('id, label, weight_kg, active, sort_order')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('label',      { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
}

// ── Crear preset (admin only) ─────────────────────────────────────────────────
export async function createWeightPreset(req, res) {
  const { label, weight_kg, sort_order } = req.body

  if (!label || weight_kg == null) {
    return res.status(400).json({ error: 'label y weight_kg son requeridos' })
  }

  const { data, error } = await supabase
    .from('weight_presets')
    .insert({
      company_id: req.profile.company_id,
      label:      label.trim(),
      weight_kg:  parseFloat(weight_kg),
      sort_order: sort_order != null ? parseInt(sort_order) : 0,
    })
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  res.status(201).json(data)
}

// ── Actualizar preset (admin only) ───────────────────────────────────────────
export async function updateWeightPreset(req, res) {
  const { id } = req.params
  const { label, weight_kg, active, sort_order } = req.body

  const updates = {}
  if (label     != null) updates.label      = label.trim()
  if (weight_kg != null) updates.weight_kg  = parseFloat(weight_kg)
  if (active    != null) updates.active     = Boolean(active)
  if (sort_order!= null) updates.sort_order = parseInt(sort_order)

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: 'No hay campos para actualizar' })
  }

  const { data, error } = await supabase
    .from('weight_presets')
    .update(updates)
    .eq('id', id)
    .eq('company_id', req.profile.company_id)
    .select()
    .single()

  if (error) return res.status(400).json({ error: error.message })
  if (!data)  return res.status(404).json({ error: 'Preset no encontrado' })
  res.json(data)
}

// ── Eliminar preset (admin only) ─────────────────────────────────────────────
export async function deleteWeightPreset(req, res) {
  const { id } = req.params

  const { error } = await supabase
    .from('weight_presets')
    .delete()
    .eq('id', id)
    .eq('company_id', req.profile.company_id)

  if (error) return res.status(500).json({ error: error.message })
  res.status(204).send()
}
