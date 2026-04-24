// Variables de entorno cargadas via --env-file al iniciar (ver package.json)
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'

import authRoutes from './routes/auth.js'
import vehicleRoutes from './routes/vehicles.js'
import driverRoutes from './routes/drivers.js'
import tripRoutes from './routes/trips.js'
import bultosRoutes from './routes/bultos.js'
import ordersRoutes from './routes/orders.js'
import storesRoutes from './routes/stores.js'
import weightPresetsRoutes from './routes/weightPresets.js'
import companiesRoutes from './routes/companies.js'
import profilesRoutes from './routes/profiles.js'
import { createRequestClient, supabase } from './db/supabase.js'
import { resolveAuthContext } from './middleware/auth.js'
import { resolveOwnedVehiclePublishContext } from './services/gpsAuthz.js'
import { canJoinCompanyMapRealtime, resolveMapPolicy } from './services/mapPolicy.js'
import { getLocationId } from './utils/locationContract.js'
import {
  emitCompanyEvent,
  emitLocationScopedEvent,
  getCompanyRoom,
  getLocationRooms,
} from './realtime/rooms.js'

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Cache para evitar emitir "nearby" repetido en el mismo evento (reset cada 2 min)
const nearbyCache = new Map() // key: `${vehicleId}:${orderId}`, value: timestamp

function getSocketToken(socket) {
  const headerToken = socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '') || null
  return socket.handshake.auth?.token || socket.handshake.query?.token || headerToken
}

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.FRONTEND_URL || 'http://localhost:5173')
      : '*',
    methods: ['GET', 'POST'],
  },
})

io.use(async (socket, next) => {
  try {
    const token = getSocketToken(socket)
    const { user, profile } = await resolveAuthContext(token)
    const mapPolicy = resolveMapPolicy(profile)
    const canJoinCompanyRealtime = canJoinCompanyMapRealtime(mapPolicy)
    socket.data.auth = {
      user_id: user.id,
      profile_id: profile.id,
      company_id: profile.company_id ?? null,
      role: profile.role ?? null,
      location_id: getLocationId(profile.location_id, profile.store_id),
    }
    socket.data.mapPolicy = mapPolicy
    socket.data.mapRealtimeAccess = {
      canJoinCompanyRealtime,
    }
    socket.data.accessToken = token
    next()
  } catch (error) {
    next(new Error(error?.message || 'Socket unauthorized'))
  }
})

app.use(cors())
app.use(express.json())

// Adjuntar io a cada request para que los controladores puedan emitir eventos
app.use((req, _res, next) => { req.io = io; next() })

// ---- Rutas ----
app.get('/health', (_req, res) => res.json({ status: 'ok', project: 'FleetTrack' }))
app.use('/api/auth', authRoutes)
app.use('/api/vehicles', vehicleRoutes)
app.use('/api/drivers', driverRoutes)
app.use('/api/trips', tripRoutes)
app.use('/api/bultos', bultosRoutes)
app.use('/api/orders', ordersRoutes)
app.use('/api/stores', storesRoutes)
app.use('/api/weight-presets', weightPresetsRoutes)
app.use('/api/companies', companiesRoutes)
app.use('/api/profiles', profilesRoutes)

// ---- Socket.io - GPS en tiempo real ----
io.on('connection', (socket) => {
  console.log('Socket conectado:', socket.id)
  const auth = socket.data.auth || {}
  const realtimeAccess = socket.data.mapRealtimeAccess || {
    canJoinCompanyRealtime: canJoinCompanyMapRealtime(socket.data.mapPolicy || resolveMapPolicy(auth)),
  }

  const companyRoom = getCompanyRoom(auth.company_id)
  if (companyRoom && realtimeAccess.canJoinCompanyRealtime) {
    socket.join(companyRoom)
  }

  for (const room of getLocationRooms(auth.location_id)) {
    socket.join(room)
  }

  socket.on('location:update', async (data = {}) => {
    if (!auth.company_id || !data.vehicleId || data.lat == null || data.lng == null) return
    const db = socket.data.accessToken ? createRequestClient(socket.data.accessToken) : supabase

    const ownership = await resolveOwnedVehiclePublishContext({
      profileId: auth.profile_id,
      companyId: auth.company_id,
      vehicleId: data.vehicleId,
      tripId: data.tripId ?? null,
    })

    if (ownership.error) {
      console.error('[socket] location:update fallo validando ownership', {
        socketId: socket.id,
        vehicleId: data.vehicleId,
        error: ownership.error.message,
      })
      return
    }

    if (!ownership.ok) {
      console.warn('[socket] location:update rechazado por scope invalido', {
        socketId: socket.id,
        vehicleId: data.vehicleId,
        companyId: auth.company_id,
        reason: ownership.reason,
      })
      return
    }

    emitCompanyEvent(io, auth.company_id, `vehicle:${data.vehicleId}`, data)

    const { data: driver } = await db
      .from('drivers')
      .select('id, profile_id')
      .eq('company_id', auth.company_id)
      .eq('assigned_vehicle_id', data.vehicleId)
      .maybeSingle()

    if (!driver?.profile_id) return

    const { data: activeBultos } = await db
      .from('bultos')
      .select('id')
      .eq('company_id', auth.company_id)
      .eq('active_driver_profile_id', driver.profile_id)
      .neq('estado', 'COMPLETADO')

    const bultoIds = [...new Set((activeBultos || []).map((bulto) => bulto.id).filter(Boolean))]
    if (!bultoIds.length) return

    const { data: orders } = await db
      .from('orders')
      .select('id, store_id, company_id, status, bulto_id')
      .eq('company_id', auth.company_id)
      .eq('status', 'ACCEPTED')
      .in('bulto_id', bultoIds)
      .not('store_id', 'is', null)

    if (!orders?.length) return

    const locationIds = [...new Set(orders.map((order) => order.store_id).filter(Boolean))]
    if (!locationIds.length) return

    const { data: stores } = await db
      .from('stores')
      .select('id, lat, lng')
      .in('id', locationIds)

    const storeById = new Map((stores || []).map((store) => [store.id, store]))

    for (const order of orders) {
      const store = storeById.get(order.store_id)

      if (!store?.lat || !store?.lng) continue

      const dist = haversineMeters(data.lat, data.lng, parseFloat(store.lat), parseFloat(store.lng))
      const cacheKey = `${data.vehicleId}:${order.id}`
      const lastEmit = nearbyCache.get(cacheKey) || 0

      if (dist < 500 && Date.now() - lastEmit > 120_000) {
        nearbyCache.set(cacheKey, Date.now())
        emitLocationScopedEvent(io, store.id, 'driver_nearby', {
          vehicleId: data.vehicleId,
          orderId: order.id,
          store_id: store.id,
          location_id: store.id,
          distMeters: Math.round(dist),
          lat: data.lat,
          lng: data.lng,
        })
      }
    }
  })

  socket.on('disconnect', () => {
    console.log('Socket desconectado:', socket.id)
  })
})

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`FleetTrack backend corriendo en http://localhost:${PORT}`)
})

export { io }
