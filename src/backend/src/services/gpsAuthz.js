import { supabaseAdmin } from '../db/supabase.js'

export async function resolveOwnedVehiclePublishContext({ profileId, companyId, vehicleId, tripId = null }) {
  if (!profileId || !companyId || !vehicleId) {
    return { ok: false, reason: 'missing_required_context' }
  }

  const { data: driver, error: driverError } = await supabaseAdmin
    .from('drivers')
    .select('id, profile_id, assigned_vehicle_id, company_id')
    .eq('profile_id', profileId)
    .eq('company_id', companyId)
    .eq('assigned_vehicle_id', vehicleId)
    .maybeSingle()

  if (driverError) {
    return { ok: false, reason: 'driver_lookup_failed', error: driverError }
  }

  if (!driver) {
    return { ok: false, reason: 'vehicle_not_owned_by_profile' }
  }

  if (!tripId) {
    return { ok: true, driver, trip: null }
  }

  const { data: trip, error: tripError } = await supabaseAdmin
    .from('trips')
    .select('id, vehicle_id, driver_id, company_id, status')
    .eq('id', tripId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (tripError) {
    return { ok: false, reason: 'trip_lookup_failed', error: tripError }
  }

  if (!trip || trip.vehicle_id !== vehicleId || trip.driver_id !== driver.id) {
    return { ok: false, reason: 'trip_not_owned_by_profile' }
  }

  return { ok: true, driver, trip }
}
