export function getCompanyRoom(companyId) {
  return companyId ? `company:${companyId}` : null
}

export function getLocationRooms(locationId) {
  if (!locationId) return []
  return [`location:${locationId}`, `store:${locationId}`]
}

export function emitCompanyEvent(io, companyId, eventName, payload) {
  const room = getCompanyRoom(companyId)
  if (!io || !room) return
  io.to(room).emit(eventName, payload)
}

export function emitLocationScopedEvent(io, locationId, eventSuffix, payload) {
  if (!io || !locationId) return

  for (const room of new Set(getLocationRooms(locationId))) {
    io.to(room).emit(`${room}:${eventSuffix}`, payload)
  }
}
