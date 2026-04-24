import { io } from '../../src/frontend/node_modules/socket.io-client/build/esm/index.js'

const socketUrl = process.env.SOCKET_URL || 'http://127.0.0.1:3001'
const vehicleId = process.env.VEHICLE_ID
const token = process.env.TOKEN
const lat = Number(process.env.LAT)
const lng = Number(process.env.LNG)
const speedKmh = Number(process.env.SPEED_KMH || 20)
const heading = Number(process.env.HEADING || 90)

if (!vehicleId) throw new Error('VEHICLE_ID is required')
if (!token) throw new Error('TOKEN is required')
if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('LAT and LNG must be valid numbers')

const socket = io(socketUrl, {
  auth: { token },
  transports: ['websocket', 'polling'],
  timeout: 5000,
})

socket.on('connect', () => {
  socket.emit('location:update', {
    vehicleId,
    lat,
    lng,
    speedKmh,
    heading,
  })

  setTimeout(() => {
    socket.disconnect()
    process.exit(0)
  }, 800)
})

socket.on('connect_error', (error) => {
  console.error(error.message || error)
  process.exit(1)
})
