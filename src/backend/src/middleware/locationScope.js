import { supabase } from '../db/supabase.js'
import {
  getEffectiveLocationId,
  getRequestedLocationId,
} from '../utils/locationContract.js'

export async function ensureOrderLocationScope(req, res, next) {
  const db = req.supabase ?? supabase
  const requestedLocationId = getRequestedLocationId(req.body)
  const effectiveLocationId = getEffectiveLocationId({
    profile: req.profile,
    requestedLocationId,
  })

  if (!effectiveLocationId) return next()

  const { data: locationRecord, error } = await db
    .from('stores')
    .select('id, company_id')
    .eq('id', effectiveLocationId)
    .maybeSingle()

  if (error) return res.status(500).json({ error: error.message })

  if (!locationRecord || locationRecord.company_id !== req.profile?.company_id) {
    return res.status(403).json({ error: 'location_id no pertenece a tu empresa' })
  }

  next()
}
