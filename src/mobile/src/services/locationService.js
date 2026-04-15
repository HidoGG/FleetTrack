import * as Location from 'expo-location'
import { io } from 'socket.io-client'
import { api } from './api'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001'
const TAG = '[LocationService]'

let socket        = null
let watchSub      = null
let sendInterval  = null
let lastKnownPos  = null
let currentTripId    = null
let currentVehicleId = null
let onPositionUpdate = null

// ─── Permisos ────────────────────────────────────────────────────────────────

async function ensurePermission() {
  const { status } = await Location.requestForegroundPermissionsAsync()
  console.log(`${TAG} Permiso de ubicación: ${status}`)
  if (status !== 'granted') {
    throw new Error(`Permiso denegado (status=${status}). Habilitalo en Ajustes → Apps → Expo Go → Permisos.`)
  }
}

// ─── Posición inicial con fallback ───────────────────────────────────────────

/**
 * Intenta obtener posición con Accuracy.Balanced (rápido).
 * Si tarda más de 5s, usa la última posición conocida del dispositivo.
 */
export async function getCurrentPosition() {
  try {
    await ensurePermission()

    // Carrera: GPS real vs. timeout de 5 segundos
    const gpsPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    })
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('GPS_TIMEOUT')), 5_000)
    )

    let loc
    try {
      loc = await Promise.race([gpsPromise, timeoutPromise])
      console.log(`${TAG} getCurrentPosition OK: ${loc.coords.latitude}, ${loc.coords.longitude}`)
    } catch (raceErr) {
      if (raceErr.message === 'GPS_TIMEOUT') {
        console.warn(`${TAG} GPS tardó >5s, usando última posición conocida…`)
        loc = await Location.getLastKnownPositionAsync()
        if (loc) {
          console.log(`${TAG} getLastKnownPosition: ${loc.coords.latitude}, ${loc.coords.longitude}`)
        } else {
          console.error(`${TAG} Sin posición conocida disponible`)
          return null
        }
      } else {
        throw raceErr
      }
    }

    return {
      lat:       loc.coords.latitude,
      lng:       loc.coords.longitude,
      speed_kmh: loc.coords.speed != null ? Math.round(loc.coords.speed * 3.6) : 0,
      heading:   loc.coords.heading ?? 0,
    }
  } catch (err) {
    console.error(`${TAG} getCurrentPosition ERROR:`, err.message)
    return null
  }
}

// ─── Tracking continuo ───────────────────────────────────────────────────────

/**
 * Inicia tracking GPS con watchPositionAsync (Balanced para compatibilidad).
 * @param {string}   tripId
 * @param {string}   vehicleId
 * @param {function} positionCallback - (pos) => void, llamado en cada actualización
 */
export async function startTracking(tripId, vehicleId, positionCallback = null) {
  await ensurePermission()

  currentTripId    = tripId
  currentVehicleId = vehicleId
  onPositionUpdate = positionCallback

  // Conectar Socket.io
  socket = io(API_URL, { transports: ['websocket', 'polling'] })
  socket.on('connect',    () => console.log(`${TAG} Socket conectado: ${socket.id}`))
  socket.on('disconnect', () => console.log(`${TAG} Socket desconectado`))
  socket.on('connect_error', (err) => console.error(`${TAG} Socket error:`, err.message))

  console.log(`${TAG} Iniciando watchPositionAsync (Accuracy.Balanced)…`)

  // ── Función interna de envío (HTTP + socket) ──────────────────────────────
  async function sendPosition(pos) {
    if (!pos) return
    try {
      const payload = { vehicle_id: currentVehicleId, trip_id: currentTripId, ...pos }
      console.log(`${TAG} Enviando a servidor… lat=${pos.lat.toFixed(5)}, lng=${pos.lng.toFixed(5)}`)
      await api.updateLocation(payload)
      console.log(`${TAG} HTTP OK`)
      socket?.emit('location:update', {
        vehicleId: currentVehicleId,
        tripId:    currentTripId,
        lat:       pos.lat,
        lng:       pos.lng,
        speedKmh:  pos.speed_kmh,
        heading:   pos.heading,
      })
      console.log(`${TAG} Socket emit OK — vehicleId=${currentVehicleId}`)
    } catch (sendErr) {
      console.error(`${TAG} Error al enviar:`, sendErr.message)
    }
  }

  try {
    watchSub = await Location.watchPositionAsync(
      {
        accuracy:         Location.Accuracy.Balanced,
        timeInterval:     5_000,
        distanceInterval: 5,
      },
      (location) => {
        const isFirst = lastKnownPos === null
        lastKnownPos = {
          lat:       location.coords.latitude,
          lng:       location.coords.longitude,
          speed_kmh: location.coords.speed != null
            ? Math.round(location.coords.speed * 3.6)
            : 0,
          heading: location.coords.heading ?? 0,
        }
        console.log(`${TAG} ${isFirst ? '🟢 PRIMERA' : '📍'} posición: ${lastKnownPos.lat.toFixed(5)}, ${lastKnownPos.lng.toFixed(5)} | ${lastKnownPos.speed_kmh} km/h`)
        onPositionUpdate?.(lastKnownPos)

        // Envío inmediato en la primera posición recibida
        if (isFirst) sendPosition(lastKnownPos)
      }
    )
    console.log(`${TAG} watchPositionAsync suscripto OK`)
  } catch (watchErr) {
    console.error(`${TAG} watchPositionAsync ERROR:`, watchErr.message)
    throw watchErr
  }

  // Enviar al backend cada 10 segundos (throttle para no saturar la DB)
  sendInterval = setInterval(async () => {
    if (!lastKnownPos) {
      console.warn(`${TAG} Tick: sin posición GPS todavía`)
      return
    }
    sendPosition(lastKnownPos)
  }, 10_000)

  return true
}

// ─── Tracking de lote (sin trip, con vehicleId para admin) ──────────────────

let bultoSocket        = null
let bultoWatchSub      = null
let bultoInterval      = null
let bultoLastPos       = null
let bultoVehicleId     = null
let bultoOnPosition    = null

/**
 * Inicia GPS para el flujo de lote (sin tripId).
 * Emite location:update vía socket para que el admin vea el vehículo en tiempo real.
 * @param {string}   vehicleId
 * @param {function} positionCallback - (pos) => void
 */
export async function startBultoTracking(vehicleId, positionCallback = null) {
  await ensurePermission()

  bultoVehicleId  = vehicleId
  bultoOnPosition = positionCallback

  bultoSocket = io(API_URL, { transports: ['websocket', 'polling'] })
  bultoSocket.on('connect',       () => console.log(`${TAG} Bulto socket conectado: ${bultoSocket.id}`))
  bultoSocket.on('disconnect',    () => console.log(`${TAG} Bulto socket desconectado`))
  bultoSocket.on('connect_error', (e) => console.error(`${TAG} Bulto socket error:`, e.message))

  function emitPosition(pos) {
    if (!pos || !bultoVehicleId) return
    bultoSocket?.emit('location:update', {
      vehicleId: bultoVehicleId,
      tripId:    null,
      lat:       pos.lat,
      lng:       pos.lng,
      speedKmh:  pos.speed_kmh,
      heading:   pos.heading,
    })
    console.log(`${TAG} Bulto GPS → lat=${pos.lat.toFixed(5)}, lng=${pos.lng.toFixed(5)}`)
  }

  // ── FORCE-START: emitir última posición conocida inmediatamente ──────────
  // Esto hace que el Panel Admin vea el vehículo activo desde el primer segundo,
  // sin esperar a que watchPositionAsync entregue su primera lectura.
  const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null)
  if (lastKnown) {
    bultoLastPos = {
      lat:       lastKnown.coords.latitude,
      lng:       lastKnown.coords.longitude,
      speed_kmh: 0,
      heading:   lastKnown.coords.heading ?? 0,
    }
    bultoOnPosition?.(bultoLastPos)
    // Emitir en cuanto el socket conecte (puede aún no estar conectado)
    bultoSocket.once('connect', () => emitPosition(bultoLastPos))
    // Si ya estaba conectado, emitir ahora mismo
    if (bultoSocket.connected) emitPosition(bultoLastPos)
    console.log(`${TAG} Force-start desde última posición conocida`)
  }

  try {
    bultoWatchSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 5_000, distanceInterval: 5 },
      (location) => {
        const isFirst = bultoLastPos === null
        bultoLastPos = {
          lat:       location.coords.latitude,
          lng:       location.coords.longitude,
          speed_kmh: location.coords.speed != null ? Math.round(location.coords.speed * 3.6) : 0,
          heading:   location.coords.heading ?? 0,
        }
        bultoOnPosition?.(bultoLastPos)
        if (isFirst) emitPosition(bultoLastPos)
      }
    )
  } catch (err) {
    console.error(`${TAG} startBultoTracking watchPosition ERROR:`, err.message)
    throw err
  }

  bultoInterval = setInterval(() => {
    if (bultoLastPos) emitPosition(bultoLastPos)
  }, 10_000)

  return true
}

export function stopBultoTracking() {
  bultoWatchSub?.remove()
  bultoWatchSub = null
  if (bultoInterval) { clearInterval(bultoInterval); bultoInterval = null }
  if (bultoSocket)   { bultoSocket.disconnect(); bultoSocket = null }
  bultoLastPos    = null
  bultoVehicleId  = null
  bultoOnPosition = null
  console.log(`${TAG} Bulto tracking detenido`)
}

// ─── Stop ────────────────────────────────────────────────────────────────────

export function stopTracking() {
  console.log(`${TAG} Deteniendo tracking…`)
  watchSub?.remove()
  watchSub = null
  if (sendInterval) { clearInterval(sendInterval); sendInterval = null }
  if (socket)       { socket.disconnect(); socket = null }
  lastKnownPos     = null
  currentTripId    = null
  currentVehicleId = null
  onPositionUpdate = null
  console.log(`${TAG} Tracking detenido`)
}
