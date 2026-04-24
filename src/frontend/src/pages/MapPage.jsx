import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import {
  Navigation, Wifi, WifiOff, Circle, Maximize2, X,
  Package, ChevronRight, MapPin, Clock, CheckCircle2, AlertTriangle,
} from 'lucide-react'
import MapView from '../components/MapView'
import { api } from '../services/api'
import { useAuthStore } from '../store/authStore'

// ── Colores del semáforo de efectivo ─────────────────────────────────────────
const CASH_COLORS = {
  normal:  { bg: 'transparent',  border: 'transparent',  text: 'transparent',   label: '' },
  warning: { bg: '#fef3c7',      border: '#fcd34d',      text: '#b45309',       label: 'Precaución' },
  danger:  { bg: '#fee2e2',      border: '#fca5a5',      text: '#dc2626',       label: 'Exceso' },
}

// ── Mock data para demo (Neuquén / Plottier) ──────────────────────────────────

const DEMO_VEHICLE_ID = 'demo-vehicle-001'

const DEMO_VEHICLE = {
  id:     DEMO_VEHICLE_ID,
  plate:  'AB 234 CD',
  brand:  'Renault',
  model:  'Kangoo',
  status: 'active',
  lat:    -38.9462,
  lng:    -68.0490,
  speed:  0,
  _isDemo: true,
}

const DEMO_DRIVER = {
  id:                  'demo-driver-001',
  full_name:           'Carlos Mendoza',
  assigned_vehicle_id: DEMO_VEHICLE_ID,
}

const DEMO_BULTO = {
  id:          'demo-bulto-001',
  codigo_lote: 'NQN-001',
}

// 3 entregados (verdes) + 2 pendientes (naranjas numerados)
const DEMO_ORDERS = [
  {
    id:               'demo-o-1',
    customer_name:    'María García',
    delivery_address: 'Roca 450, Neuquén Capital',
    delivery_lat:     -38.9528,
    delivery_lng:     -68.0689,
    status:           'DELIVERED',
    payment_amount:   1850,
    delivered_at:     '09:15',
    route_order:      1,
  },
  {
    id:               'demo-o-2',
    customer_name:    'Roberto López',
    delivery_address: 'Av. Argentina 1230, Neuquén',
    delivery_lat:     -38.9497,
    delivery_lng:     -68.0562,
    status:           'DELIVERED',
    payment_amount:   2340,
    delivered_at:     '10:03',
    route_order:      2,
  },
  {
    id:               'demo-o-3',
    customer_name:    'Laura Pérez',
    delivery_address: 'Alderete 780, Neuquén',
    delivery_lat:     -38.9543,
    delivery_lng:     -68.0508,
    status:           'DELIVERED',
    payment_amount:   1620,
    delivered_at:     '10:47',
    route_order:      3,
  },
  {
    id:               'demo-o-4',
    customer_name:    'Juan Torres',
    delivery_address: 'Belgrano 320, Plottier',
    delivery_lat:     -38.9470,
    delivery_lng:     -68.0490,
    status:           'PENDING',
    payment_amount:   2100,
    delivered_at:     null,
    route_order:      4,
  },
  {
    id:               'demo-o-5',
    customer_name:    'Ana Rodríguez',
    delivery_address: 'San Martín 567, Plottier',
    delivery_lat:     -38.9432,
    delivery_lng:     -68.0543,
    status:           'PENDING',
    payment_amount:   1780,
    delivered_at:     null,
    route_order:      5,
  },
]

// Punto de inicio (depósito en Neuquén)
const DEMO_START = { lat: -38.9581, lng: -68.0719 }

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  active:      { dot: '#10b981', bg: 'var(--success-l)', text: '#059669' },
  inactive:    { dot: '#94a3b8', bg: '#f1f5f9',           text: '#64748b' },
  maintenance: { dot: '#f59e0b', bg: 'var(--warn-l)',     text: '#d97706' },
}

// ── Componente ─────────────────────────────────────────────────────────────────

export default function MapPage() {
  const token = useAuthStore((state) => state.token)
  const mapCapabilities = useAuthStore((state) => state.mapAccess?.capabilities ?? [])
  const canAccessCompanyMap = mapCapabilities.includes('map.view.company')
  const canViewMapCash = mapCapabilities.includes('map.view.cash')
  const canUseRealtime = mapCapabilities.includes('map.realtime.company')
  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn:  api.getVehicles,
    enabled: canAccessCompanyMap,
    refetchInterval: 30_000,
  })

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers'],
    queryFn:  api.getDrivers,
    enabled: canAccessCompanyMap,
    refetchInterval: 60_000,
  })

  // Semáforo de efectivo: { [vehicle_id]: { amount, level } }
  const { data: cashByVehicle = {} } = useQuery({
    queryKey: ['orders', 'cash-by-vehicle'],
    queryFn:  api.getCashByVehicle,
    enabled: canAccessCompanyMap && canViewMapCash,
    refetchInterval: 30_000,
  })

  const [livePositions,  setLivePositions]  = useState({})
  const [connected,      setConnected]      = useState(false)
  const [selectedId,     setSelectedId]     = useState(null)
  const [activeOrders,   setActiveOrders]   = useState([])
  const [activeBulto,    setActiveBulto]    = useState(null)
  const [loadingOrders,  setLoadingOrders]  = useState(false)

  const mapRef           = useRef(null)
  const socketRef        = useRef(null)
  const selectedIdRef    = useRef(null)  // ref para callbacks de socket
  // Números estáticos por pedido: { [orderId]: number }
  const orderNumsRef     = useRef({})
  // Ref siempre actualizado con vehiclesWithPos actual (evita closures rancias en effects)
  const vehiclesWithPosRef = useRef([])

  // Lookup: assigned_vehicle_id → driver (incluye conductor demo)
  // Nota: la API devuelve profiles como sub-objeto, normalizamos full_name aquí
  const driverByVehicle = {
    ...Object.fromEntries(
      drivers.map(d => [d.assigned_vehicle_id, {
        ...d,
        full_name: d.profiles?.full_name || d.full_name || null,
      }])
    ),
    [DEMO_VEHICLE_ID]: DEMO_DRIVER,
  }

  // Mantener ref sincronizada para callbacks de socket
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  // ── Vehículos enriquecidos con posición (+ vehículo demo siempre visible) ─
  // IMPORTANTE: debe declararse ANTES de cualquier useEffect que lo referencie.
  const vehiclesWithPos = [
    ...vehicles.map(v => ({
      ...v,
      lat:   livePositions[v.id]?.lat,
      lng:   livePositions[v.id]?.lng,
      speed: livePositions[v.id]?.speedKmh ?? livePositions[v.id]?.speed_kmh,
    })),
    DEMO_VEHICLE, // siempre presente para la demo
  ]
  const activeCount = vehiclesWithPos.filter(v => v.lat).length
  // Mantener ref fresca para que los effects lean posiciones actuales
  vehiclesWithPosRef.current = vehiclesWithPos

  // ── Asignar números estáticos a pedidos pendientes ────────────────────────
  // Solo agrega números a pedidos que aún no tienen uno; nunca reasigna.
  function assignOrderNums(orders) {
    if (!orders?.length) return
    const existing = Object.values(orderNumsRef.current).filter(n => n != null)
    let next = existing.length > 0 ? Math.max(...existing) : 0
    orders.forEach(o => {
      if (!o?.id) return
      const isPending = o.status !== 'DELIVERED' && o.status !== 'FAILED'
      if (isPending && orderNumsRef.current[o.id] == null) {
        orderNumsRef.current[o.id] = ++next
      }
    })
  }

  // ── Auto-fit de vista general ─────────────────────────────────────────────
  // Dep: activeCount (número de vehículos con GPS). Se dispara cuando aparece un
  // nuevo vehículo activo O cuando se regresa a la vista de flota (selectedId→null).
  // vehiclesWithPosRef.current siempre tiene las posiciones más frescas.
  useEffect(() => {
    if (selectedId) return
    const active = vehiclesWithPosRef.current.filter(v => v.lat && v.lng)
    if (active.length > 0) mapRef.current?.fitAll(active)
  }, [activeCount, selectedId])

  // ── Cargar pedidos reales (extrae la lógica para poder reutilizarla) ───────
  const loadRealOrders = useCallback(async (vehicleId) => {
    if (!canAccessCompanyMap || !vehicleId || vehicleId === DEMO_VEHICLE_ID) return
    const pos = livePositions[vehicleId]
    setLoadingOrders(true)
    try {
      const result = await api.getActiveOrdersForVehicle(vehicleId)
      setActiveBulto(result.bulto)
      setActiveOrders(result.orders)

      if (result.orders.length > 0) {
        assignOrderNums(result.orders)
        mapRef.current?.showOrderPins(result.orders, { ...orderNumsRef.current })
        // La cámara la maneja el effect "Cámara inteligente" al cambiar activeOrders

        const delivered = result.orders.filter(
          o => (o.status === 'DELIVERED' || o.status === 'FAILED')
            && o.delivery_lat && o.delivery_lng
        )
        if (delivered.length > 0 && pos?.lat && pos?.lng) {
          mapRef.current?.showHistoryPath([
            ...delivered.map(o => ({ lat: o.delivery_lat, lng: o.delivery_lng })),
            { lat: pos.lat, lng: pos.lng },
          ])
        }
      }
    } catch (e) {
      console.error('Error cargando pedidos:', e)
    } finally {
      setLoadingOrders(false)
    }
  }, [canAccessCompanyMap, livePositions])

  // ── Socket: crear una sola vez ────────────────────────────────────────────
  useEffect(() => {
    if (!token || !canUseRealtime) {
      setConnected(false)
      return undefined
    }

    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket
    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    // Actualización de pin en tiempo real (entrega confirmada)
    socket.on('order:status_update', ({ orderId, status }) => {
      mapRef.current?.updateOrderPin(orderId, status)
      setActiveOrders(prev =>
        prev.map(o => o.id === orderId ? { ...o, status } : o)
      )
    })

    // ── NUEVO: el repartidor validó un lote — recargar si está seleccionado ──
    socket.on('bulto:activated', ({ vehicle_id }) => {
      const current = selectedIdRef.current
      if (current && current !== DEMO_VEHICLE_ID && current === vehicle_id) {
        console.log('[MapPage] bulto:activated para vehículo seleccionado, recargando...')
        loadRealOrders(vehicle_id)
      }
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [canUseRealtime, loadRealOrders, token])

  // ── Auto-refresh cada 20s mientras haya un vehículo real seleccionado ─────
  useEffect(() => {
    if (!selectedId || selectedId === DEMO_VEHICLE_ID) return
    const interval = setInterval(() => {
      loadRealOrders(selectedId)
    }, 20_000)
    return () => clearInterval(interval)
  }, [selectedId, loadRealOrders])

  // ── Suscribirse a canales de vehículos ────────────────────────────────────
  useEffect(() => {
    const socket = socketRef.current
    if (!canUseRealtime || !socket || !vehicles.length) return

    vehicles.forEach(({ id }) => {
      socket.off(`vehicle:${id}`)
      socket.on(`vehicle:${id}`, (data) => {
        setLivePositions(prev => ({ ...prev, [id]: data }))
      })
    })
    return () => vehicles.forEach(({ id }) => socket.off(`vehicle:${id}`))
  }, [canUseRealtime, vehicles])

  // ── Cámara inteligente: seguir conductor con todos sus pines en cuadro ──────
  // Fires cuando: cambia posición GPS (livePositions), cambia conductor (selectedId)
  // o cambian los pedidos (activeOrders). Siempre encuadra vehículo + todos los pines.
  useEffect(() => {
    if (!selectedId || selectedId === DEMO_VEHICLE_ID) return
    const pos = livePositions[selectedId]

    const coords = []
    if (pos?.lat && pos?.lng) coords.push({ lat: pos.lat, lng: pos.lng })
    activeOrders.forEach(o => {
      if (o.delivery_lat && o.delivery_lng)
        coords.push({ lat: o.delivery_lat, lng: o.delivery_lng })
    })

    if (coords.length > 0) mapRef.current?.fitAll(coords)
  }, [livePositions, selectedId, activeOrders])

  // ── Seleccionar / deseleccionar conductor ─────────────────────────────────
  const handleSelectVehicle = useCallback(async (vehicleId) => {
    if (selectedId === vehicleId) {
      handleFleetView()
      return
    }

    // Resetear números estáticos al cambiar de conductor
    orderNumsRef.current = {}

    setSelectedId(vehicleId)
    mapRef.current?.setFollowed(vehicleId)

    // ── Caso Demo ───────────────────────────────────────────────────────────
    if (vehicleId === DEMO_VEHICLE_ID) {
      mapRef.current?.flyTo(DEMO_VEHICLE.lat, DEMO_VEHICLE.lng, 14)
      setActiveBulto(DEMO_BULTO)
      setActiveOrders(DEMO_ORDERS)

      assignOrderNums(DEMO_ORDERS)
      mapRef.current?.showOrderPins(DEMO_ORDERS, { ...orderNumsRef.current })

      // Fit mapa para incluir todos los pines + posición actual
      const allCoords = [
        { lat: DEMO_START.lat, lng: DEMO_START.lng },
        ...DEMO_ORDERS.map(o => ({ lat: o.delivery_lat, lng: o.delivery_lng })),
        { lat: DEMO_VEHICLE.lat, lng: DEMO_VEHICLE.lng },
      ]
      mapRef.current?.fitAll(allCoords)

      // Polyline azul: depósito → entregados (cronológico) → posición actual
      const deliveredPath = DEMO_ORDERS
        .filter(o => o.status === 'DELIVERED')
        .sort((a, b) => (a.route_order || 0) - (b.route_order || 0))
        .map(o => ({ lat: o.delivery_lat, lng: o.delivery_lng }))

      mapRef.current?.showHistoryPath([
        DEMO_START,
        ...deliveredPath,
        { lat: DEMO_VEHICLE.lat, lng: DEMO_VEHICLE.lng },
      ])
      return
    }

    // ── Caso Real ───────────────────────────────────────────────────────────
    // La cámara reacciona automáticamente via el effect "Cámara inteligente"
    // cuando selectedId y activeOrders cambian.
    setActiveOrders([])
    setActiveBulto(null)
    await loadRealOrders(vehicleId)
  }, [selectedId, livePositions, loadRealOrders])

  // ── Vista general de flota ─────────────────────────────────────────────────
  function handleFleetView() {
    setSelectedId(null)
    setActiveOrders([])
    setActiveBulto(null)
    orderNumsRef.current = {}
    mapRef.current?.setFollowed(null)
    mapRef.current?.clearOrderPins() // también limpia la polyline
    mapRef.current?.fitAll(vehiclesWithPos)
  }

  // Estadísticas del lote activo
  const pendingCount   = activeOrders.filter(o => o.status !== 'DELIVERED' && o.status !== 'FAILED').length
  const deliveredCount = activeOrders.filter(o => o.status === 'DELIVERED').length

  const selectedVehicle = vehiclesWithPos.find(v => v.id === selectedId)
  const connectionLabel = canUseRealtime
    ? (connected ? 'Conectado' : 'Desconectado')
    : 'Sin realtime'
  const connectionColor = canUseRealtime && connected ? '#059669' : 'var(--muted)'
  const connectionBackground = canUseRealtime && connected ? 'var(--success-l)' : '#f1f5f9'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', gap: 0 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            {selectedId
              ? `Ruta — ${selectedVehicle?.plate || '...'}`
              : 'Mapa en tiempo real'}
            {selectedVehicle?._isDemo && (
              <span style={{
                fontSize: 11, fontWeight: 700, background: '#fef3c7', color: '#d97706',
                borderRadius: 20, padding: '2px 8px', letterSpacing: '.5px',
              }}>DEMO</span>
            )}
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
            {selectedId
              ? activeBulto
                ? `Lote ${activeBulto.codigo_lote} · ${deliveredCount}/${activeOrders.length} entregados`
                : 'Sin lote activo'
              : `${activeCount} de ${vehiclesWithPos.length} vehículo${vehiclesWithPos.length !== 1 ? 's' : ''} con señal GPS`
            }
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="btn-secondary"
            onClick={handleFleetView}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
              ...(selectedId ? {} : { borderColor: 'var(--accent)', color: 'var(--accent)' }),
            }}
          >
            <Maximize2 size={14} />
            Vista General de Flota
          </button>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: connectionBackground,
            color: connectionColor,
            borderRadius: 20, padding: '6px 12px', fontSize: 12, fontWeight: 600,
          }}>
            {canUseRealtime && connected ? <Wifi size={13} /> : <WifiOff size={13} />}
            {connectionLabel}
          </div>
        </div>
      </div>

      {/* ── Layout principal ── */}
      <div style={{ flex: 1, display: 'flex', gap: 16, overflow: 'hidden' }}>

        {/* ── Panel lateral ── */}
        <div className="card" style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Cabecera del panel */}
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <Navigation size={14} color="var(--accent)" />
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {selectedId ? 'Detalle de ruta' : 'Tracking List'}
            </span>
            {selectedId && (
              <button
                onClick={handleFleetView}
                style={{
                  marginLeft: 'auto', background: '#f1f5f9', border: 'none',
                  cursor: 'pointer', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6,
                }}
              >
                <X size={11} /> Volver
              </button>
            )}
            {!selectedId && (
              <span style={{
                marginLeft: 'auto', background: 'var(--accent-l)', color: 'var(--accent)',
                borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 700,
              }}>
                {vehiclesWithPos.length}
              </span>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>

            {/* ── MODO FLOTA: lista de vehículos ── */}
            {!selectedId && (
              vehiclesWithPos.length === 0 ? (
                <p style={{ padding: '20px 6px', color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>
                  Sin vehículos registrados
                </p>
              ) : (
                vehiclesWithPos.map(v => {
                  const live      = v._isDemo ? v : livePositions[v.id]
                  const clrs      = STATUS_COLOR[v.status] || STATUS_COLOR.inactive
                  const driver    = driverByVehicle[v.id]
                  const cashInfo  = canViewMapCash && !v._isDemo ? cashByVehicle[v.id] : null
                  const cashClrs  = CASH_COLORS[cashInfo?.level] || CASH_COLORS.normal
                  const hasCashAlert = cashInfo && cashInfo.level !== 'normal'

                  return (
                    <div
                      key={v.id}
                      onClick={() => handleSelectVehicle(v.id)}
                      title="Clic para ver la ruta completa"
                      style={{
                        padding: '10px 11px', borderRadius: 9, marginBottom: 4,
                        cursor: 'pointer',
                        border: hasCashAlert
                          ? `1px solid ${cashClrs.border}`
                          : '1px solid transparent',
                        background: hasCashAlert ? cashClrs.bg : 'transparent',
                        transition: 'all .12s',
                      }}
                      onMouseEnter={e => {
                        if (!hasCashAlert) {
                          e.currentTarget.style.background = 'var(--accent-l)'
                          e.currentTarget.style.border = '1px solid var(--accent)'
                        }
                      }}
                      onMouseLeave={e => {
                        if (!hasCashAlert) {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.border = '1px solid transparent'
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text)' }}>
                            {v.plate}
                          </span>
                          {v._isDemo && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, background: '#fef3c7',
                              color: '#d97706', borderRadius: 20, padding: '1px 5px',
                            }}>DEMO</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {hasCashAlert && (
                            <AlertTriangle size={12} color={cashClrs.text} />
                          )}
                          <Circle size={7} fill={clrs.dot} color={clrs.dot} />
                          <span style={{ fontSize: 11, color: clrs.text, fontWeight: 600 }}>{v.status}</span>
                          <ChevronRight size={13} color="var(--muted2)" />
                        </div>
                      </div>

                      {driver && (
                        <div style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 500, marginBottom: 2 }}>
                          {driver.full_name}
                        </div>
                      )}

                      {live?.lat ? (
                        <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 500 }}>
                          📍 {live.lat?.toFixed(4)}, {live.lng?.toFixed(4)}
                          {(live.speedKmh ?? live.speed_kmh ?? live.speed) != null &&
                            ` · ${live.speedKmh ?? live.speed_kmh ?? live.speed} km/h`}
                        </div>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--muted2)' }}>Sin señal GPS</div>
                      )}

                      {/* Semáforo de efectivo */}
                      {hasCashAlert && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          marginTop: 5, fontSize: 10.5, fontWeight: 700, color: cashClrs.text,
                        }}>
                          <AlertTriangle size={10} />
                          {cashClrs.label}: ${cashInfo.amount.toLocaleString('es-AR')} en efectivo a rendir
                        </div>
                      )}
                    </div>
                  )
                })
              )
            )}

            {/* ── MODO DETALLE: pedidos del conductor ── */}
            {selectedId && (
              loadingOrders ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--muted)', fontSize: 13 }}>
                  Cargando pedidos…
                </div>
              ) : activeOrders.length === 0 ? (
                /* Empty state elegante */
                <div style={{ textAlign: 'center', padding: '36px 12px' }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 26,
                    background: 'var(--accent-l)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}>
                    <Package size={22} color="var(--accent)" />
                  </div>
                  <p style={{ color: 'var(--text2)', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    {activeBulto === null
                      ? 'Esperando asignación de bultos...'
                      : 'Sin pedidos en el lote actual.'}
                  </p>
                  <p style={{ color: 'var(--muted)', fontSize: 11.5 }}>
                    {activeBulto === null
                      ? 'El conductor está listo para recibir su próximo lote.'
                      : 'El lote está vacío.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Resumen del lote */}
                  {activeBulto && (
                    <div style={{
                      background: 'var(--accent-l)', borderRadius: 10,
                      padding: '10px 13px', marginBottom: 10,
                      border: '1px solid var(--accent)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--accent)' }}>
                          Lote {activeBulto.codigo_lote}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                          {deliveredCount}/{activeOrders.length}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>
                        {deliveredCount} entregados · {pendingCount} pendientes
                      </div>
                      {/* Barra de progreso */}
                      <div style={{
                        height: 5, background: 'rgba(79,70,229,.18)',
                        borderRadius: 3, marginTop: 8, overflow: 'hidden',
                      }}>
                        <div style={{
                          height: 5, background: 'var(--accent)', borderRadius: 3,
                          width: `${activeOrders.length > 0 ? (deliveredCount / activeOrders.length * 100) : 0}%`,
                          transition: 'width .4s',
                        }} />
                      </div>
                    </div>
                  )}

                  {/* Lista de tarjetas minimalistas */}
                  {activeOrders.map((order) => {
                    const isDelivered = order.status === 'DELIVERED' || order.status === 'FAILED'
                    // Número estático asignado al momento del primer load — nunca cambia
                    const staticNum = orderNumsRef.current[order.id]

                    return (
                      <div
                        key={order.id}
                        style={{
                          padding: '10px 12px', borderRadius: 10, marginBottom: 6,
                          background: isDelivered ? '#f0fdf4' : 'var(--surface)',
                          border: `1px solid ${isDelivered ? '#bbf7d0' : 'var(--border)'}`,
                          boxShadow: isDelivered ? 'none' : 'var(--shadow)',
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                          transition: 'all .15s',
                        }}
                      >
                        {/* Indicador numérico / check */}
                        <div style={{
                          width: 26, height: 26, borderRadius: 13, flexShrink: 0, marginTop: 1,
                          background: isDelivered ? '#10b981' : '#f59e0b',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 11, fontWeight: 800, color: '#fff',
                          boxShadow: isDelivered
                            ? '0 2px 6px rgba(16,185,129,.35)'
                            : '0 2px 6px rgba(245,158,11,.35)',
                        }}>
                          {isDelivered
                            ? <CheckCircle2 size={13} strokeWidth={2.5} />
                            : staticNum}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontWeight: 600, fontSize: 12.5,
                            color: isDelivered ? '#374151' : 'var(--text)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {order.customer_name}
                          </div>
                          <div style={{
                            fontSize: 11, color: 'var(--muted)', marginTop: 1,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}>
                            <MapPin size={9} style={{ flexShrink: 0 }} />
                            {order.delivery_address}
                          </div>
                          {isDelivered && order.delivered_at && (
                            <div style={{
                              fontSize: 10.5, color: '#059669', marginTop: 3,
                              display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600,
                            }}>
                              <Clock size={9} />
                              {order.delivered_at} hs
                            </div>
                          )}
                        </div>

                        <span style={{
                          fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 2,
                          background: isDelivered ? '#d1fae5' : '#fef3c7',
                          color: isDelivered ? '#059669' : '#d97706',
                          borderRadius: 20, padding: '2px 7px',
                        }}>
                          {isDelivered ? 'Entregado' : order.status === 'IN_TRANSIT' ? 'En camino' : 'Pendiente'}
                        </span>
                      </div>
                    )
                  })}
                </>
              )
            )}
          </div>
        </div>

        {/* ── Mapa ── */}
        <div className="card" style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          <MapView
            ref={mapRef}
            vehicles={vehiclesWithPos}
            height="100%"
            cashData={canViewMapCash ? cashByVehicle : {}}
          />

          {/* Leyenda de pines (solo en modo detalle) */}
          {selectedId && activeOrders.length > 0 && (
            <div style={{
              position: 'absolute', top: 12, left: 12, zIndex: 1000,
              background: 'rgba(255,255,255,0.96)',
              borderRadius: 10, padding: '9px 13px',
              boxShadow: '0 2px 12px rgba(0,0,0,.12)',
              display: 'flex', flexDirection: 'column', gap: 6,
              fontSize: 11.5, fontWeight: 600, backdropFilter: 'blur(4px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: '#f59e0b', border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(245,158,11,.4)' }} />
                Pendiente ({pendingCount})
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 12, height: 12, borderRadius: 6, background: '#10b981', border: '1.5px solid #fff', boxShadow: '0 1px 3px rgba(16,185,129,.4)' }} />
                Entregado ({deliveredCount})
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <div style={{ width: 28, height: 3, background: '#3B82F6', borderRadius: 2, opacity: .7 }} />
                Rastro del día
              </div>
            </div>
          )}

          {/* Botón flotante "Vista General" */}
          {selectedId && (
            <button
              onClick={handleFleetView}
              style={{
                position: 'absolute', bottom: 16, right: 16, zIndex: 1000,
                background: '#fff', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', padding: '8px 14px',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, color: 'var(--text2)',
                boxShadow: 'var(--shadow-md)', cursor: 'pointer',
              }}
            >
              <Maximize2 size={13} />
              Vista General de Flota
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
