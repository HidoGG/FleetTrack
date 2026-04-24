import fs from 'node:fs'
import { io } from '../../src/frontend/node_modules/socket.io-client/build/esm/index.js'

const socketUrl = process.env.SOCKET_URL || 'http://127.0.0.1:3001'
const token = process.env.TOKEN
const outputFile = process.env.OUTPUT_FILE
const readyFile = process.env.READY_FILE
const waitMs = Number(process.env.WAIT_MS || 4000)

if (!token) throw new Error('TOKEN is required')
if (!outputFile) throw new Error('OUTPUT_FILE is required')
if (!readyFile) throw new Error('READY_FILE is required')
if (!Number.isFinite(waitMs) || waitMs < 500) throw new Error('WAIT_MS must be a valid number >= 500')

let events
try {
  events = JSON.parse(process.env.EVENTS || '[]')
} catch (error) {
  throw new Error(`EVENTS must be valid JSON: ${error.message}`)
}

if (!Array.isArray(events) || events.some((eventName) => typeof eventName !== 'string')) {
  throw new Error('EVENTS must be a JSON array of strings')
}

const capturedEvents = []

function writeOutput(payload) {
  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2))
}

const socket = io(socketUrl, {
  auth: { token },
  transports: ['websocket', 'polling'],
  timeout: 5000,
})

for (const eventName of new Set(events)) {
  socket.on(eventName, (payload) => {
    capturedEvents.push({
      event: eventName,
      payload,
      captured_at: new Date().toISOString(),
    })
  })
}

socket.on('connect', () => {
  fs.writeFileSync(readyFile, JSON.stringify({ status: 'ready', socketId: socket.id }))

  setTimeout(() => {
    writeOutput({
      status: 'done',
      socket_id: socket.id,
      events: capturedEvents,
    })
    socket.disconnect()
    process.exit(0)
  }, waitMs)
})

socket.on('connect_error', (error) => {
  writeOutput({
    status: 'connect_error',
    error: error.message || String(error),
    events: capturedEvents,
  })
  process.exit(1)
})
