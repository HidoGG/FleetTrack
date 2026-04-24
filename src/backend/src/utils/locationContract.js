export function getLocationId(value, fallback = null) {
  return value ?? fallback ?? null
}

export function withLocationId(record, sourceField = 'store_id') {
  if (!record) return record

  return {
    ...record,
    location_id: getLocationId(record.location_id, record[sourceField]),
  }
}

export function withLocationIdList(records, sourceField = 'store_id') {
  return (records || []).map((record) => withLocationId(record, sourceField))
}

export function getRequestedLocationId(payload = {}) {
  return payload.location_id ?? payload.store_id ?? null
}

export function getEffectiveLocationId({ profile = null, requestedLocationId = null }) {
  if (profile?.role === 'store') {
    return profile.location_id ?? profile.store_id ?? requestedLocationId ?? null
  }

  return requestedLocationId
}

export function withLegacyStoreAlias(record, sourceField = 'store_id') {
  if (!record) return record

  const locationId = getLocationId(record.location_id, record[sourceField])

  return {
    ...record,
    location_id: locationId,
    store_id: record.store_id ?? locationId,
  }
}

export function withLegacyStoreAliasList(records, sourceField = 'store_id') {
  return (records || []).map((record) => withLegacyStoreAlias(record, sourceField))
}
