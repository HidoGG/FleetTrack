// Variables de entorno cargadas via --env-file al iniciar (ver package.json)
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'

import authRoutes          from './routes/auth.js'
import vehicleRoutes       from './routes/vehicles.js'
import driverRoutes        from './routes/drivers.js'
import tripRoutes          from './routes/trips.js'
import bultosRoutes        from './routes/bultos.js'
import ordersRoutes        from './routes/orders.js'
import storesRoutes        from './routes/stores.js'
import weightPresetsRoutes from './routes/weightPresets.js'
import companiesRoutes     from './routes/companies.js'
import profilesRoutes      from './routes/profiles.js'
import { supabase }  from './db/supabase.js'

// ── Haversine: distancia en metros entre dos coordenadas ─────────────────────
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
const nearbyCache = new Map()   // key: `${vehicleId}:${orderId}`, value: timestamp

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? (process.env.FRONTEND_URL || 'http://localhost:5173')
      : '*',                  // desarrollo: aceptar cualquier origen
    methods: ['GET', 'POST'],
  },
})

app.use(cors())
app.use(express.json())

// Adjuntar io a cada request para que los controladores puedan emitir eventos
app.use((req, _res, next) => { req.io = io; next() })

// ---- Rutas ----
app.get('/health', (_req, res) => res.json({ status: 'ok', project: 'FleetTrack' }))
app.use('/api/auth',     authRoutes)
app.use('/api/vehicles', vehicleRoutes)
app.use('/api/drivers',  driverRoutes)
app.use('/api/trips',    tripRoutes)
app.use('/api/bultos',   bultosRoutes)
app.use('/api/orders',   ordersRoutes)
app.use('/api/stores',        storesRoutes)
app.use('/api/weight-presets', weightPresetsRoutes)
app.use('/api/companies',     companiesRoutes)
app.use('/api/profiles',      profilesRoutes)

// ---- Socket.io — GPS en tiempo real ----
io.on('connection', (socket) => {
  console.log('Socket conectado:', socket.id)

  // La app móvil emite este evento cada 5s durante un viaje
  socket.on('location:update', async (data) => {
    // data: { vehicleId, tripId, lat, lng, speedKmh, heading }
    io.emit(`vehicle:${data.vehicleId}`, data)

    // ── Proximidad: buscar pedidos ACCEPTED de este vehículo ─────────────────
    if (!data.lat || !data.lng || !data.vehicleId) return

    // Obtener driver → pedidos ACCEPTED con store
    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('assigned_vehicle_id', data.vehicleId)
      .maybeSingle()
    if (!driver) return

    const { data: orders } = await supabase
      .from('orders')
      .select('id, store_id, company_id, status')
      .eq('status', 'ACCEPTED')
      .not('store_id', 'is', null)

    if (!orders?.length) return

    // Para cada pedido ACCEPTED, obtener la tienda y calcular distancia
    for (const order of orders) {
      const { data: store } = await supabase
        .from('stores')
        .select('id, lat, lng')
        .eq('id', order.store_id)
        .maybeSingle()

      if (!store?.lat || !store?.lng) continue

      const dist = haversineMeters(data.lat, data.lng, parseFloat(store.lat), parseFloat(store.lng))
      const cacheKey = `${data.vehicleId}:${order.id}`
      const lastEmit = nearbyCache.get(cacheKey) || 0

      if (dist < 500 && Date.now() - lastEmit > 120_000) {
        nearbyCache.set(cacheKey, Date.now())
        io.emit(`store:${store.id}:driver_nearby`, {
          vehicleId:  data.vehicleId,
          orderId:    order.id,
          distMeters: Math.round(dist),
          lat:        data.lat,
          lng:        data.lng,
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
