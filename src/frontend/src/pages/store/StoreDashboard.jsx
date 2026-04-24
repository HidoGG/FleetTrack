import { useEffect, useRef, useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import {
  Package, Clock, ShoppingBag, Truck, AlertCircle, CheckCircle,
  Bell, BellRing, MapPin, X, Volume2, Tag, Weight,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { api, getLocationId } from '../../services/api'

// ── Metadatos de estado ───────────────────────────────────────────────────────
const STATUS_META = {
  PENDING:          { label: 'Pendiente',         color: '#d97706', bg: '#fef3c7', Icon: Clock },
  READY_FOR_PICKUP: { label: 'Listo para retiro', color: '#7c3aed', bg: '#ede9fe', Icon: ShoppingBag },
  ACCEPTED:         { label: 'Aceptado',           color: '#0284c7', bg: '#e0f2fe', Icon: Truck },
  IN_TRANSIT:       { label: 'En camino',          color: '#4f46e5', bg: 'var(--accent-l)', Icon: Truck },
  DELIVERED:        { label: 'Entregado',          color: '#059669', bg: 'var(--success-l)', Icon: CheckCircle },
  FAILED:           { label: 'Fallido',            color: '#dc2626', bg: '#fee2e2', Icon: AlertCircle },
}

const ALERT_TYPES = {
  order_ready:     { label: 'Pedido listo para retiro', color: '#7c3aed', bg: '#ede9fe', icon: '📦' },
  order_accepted:  { label: 'Pedido aceptado',          color: '#0284c7', bg: '#e0f2fe', icon: '✅' },
  driver_nearby:   { label: 'Repartidor cerca',         color: '#d97706', bg: '#fef3c7', icon: '📍' },
  order_delivered: { label: 'Entregado al cliente',     color: '#059669', bg: '#d1fae5', icon: '🎉' },
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// Código de referencia del pedido (últimos 4 chars del ID)
function orderCode(id) {
  if (!id) return '—'
  const s = String(id)
  return s.length > 4 ? s.slice(-4).toUpperCase() : s.toUpperCase()
}

// ── Sonido ────────────────────────────────────────────────────────────────────
function playBeep(freq = 880, duration = 0.18, volume = 0.4) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch (_) {}
}

function playAlert(type) {
  if (type === 'driver_nearby')        { playBeep(660, 0.15); setTimeout(() => playBeep(880, 0.2), 200) }
  else if (type === 'order_delivered') { playBeep(523, 0.12); setTimeout(() => playBeep(659, 0.12), 150); setTimeout(() => playBeep(784, 0.25), 300) }
  else                                 { playBeep(880, 0.18) }
}

function getRealtimeEventKey(eventName, payload = {}) {
  const orderId = payload.orderId ?? payload.order_id ?? null

  if (eventName === 'driver_nearby') {
    const vehicleId = payload.vehicleId ?? payload.vehicle_id ?? 'na'
    const distMeters = payload.distMeters ?? payload.dist_meters ?? 'na'
    return `${eventName}:${vehicleId}:${orderId ?? 'na'}:${distMeters}`
  }

  return orderId ? `${eventName}:${orderId}` : null
}

// ── CSS de animaciones inyectado una vez ──────────────────────────────────────
const BLINK_STYLE = `
@keyframes ft-blink {
  0%,100% { opacity:1; }
  50%      { opacity:0; }
}
@keyframes ft-slide-in {
  from { opacity:0; transform:translateY(-6px); }
  to   { opacity:1; transform:translateY(0); }
}
.ft-blink { animation: ft-blink 0.7s step-end infinite; }
.ft-card-enter { animation: ft-slide-in 0.22s ease; }
`

function injectStyles() {
  if (document.getElementById('ft-store-styles')) return
  const el = document.createElement('style')
  el.id = 'ft-store-styles'
  el.textContent = BLINK_STYLE
  document.head.appendChild(el)
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function StoreDashboard() {
  injectStyles()
  const qc = useQueryClient()
  const profile = useAuthStore((s) => s.profile)
  const token = useAuthStore((s) => s.token)

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['store-orders'],
    queryFn:  () => api.getOrders(),
    refetchInterval: 30_000,
  })

  const [tab,          setTab]          = useState('orders')
  const [alerts,       setAlerts]       = useState([])
  const [unread,       setUnread]       = useState(0)
  const [driverInfo,   setDriverInfo]   = useState(null)   // { lat, lng, distMeters }
  const [loadingReady, setLoadingReady] = useState(null)
  const socketRef = useRef(null)
  const realtimeEventCacheRef = useRef(new Map())

  const myLocationId = getLocationId(profile) ?? getLocationId(orders[0]) ?? null

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return undefined

    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket
    realtimeEventCacheRef.current.clear()

    function shouldHandleRealtimeEvent(eventName, payload) {
      const eventKey = getRealtimeEventKey(eventName, payload)
      if (!eventKey) return true

      const cache = realtimeEventCacheRef.current
      const now = Date.now()
      const lastSeen = cache.get(eventKey) || 0

      // Evita duplicados cuando el mismo evento entra por location y store.
      if (now - lastSeen < 2000) return false

      cache.set(eventKey, now)
      for (const [key, ts] of cache) {
        if (now - ts > 60_000) cache.delete(key)
      }
      return true
    }

    function pushAlert(type, extra = {}) {
      playAlert(type)
      const meta = ALERT_TYPES[type]
      setAlerts(prev => [{
        id: Date.now(), type, meta, ts: new Date().toISOString(), ...extra,
      }, ...prev].slice(0, 50))
      if (tab !== 'alerts') setUnread(n => n + 1)
    }

    if (myLocationId) {
      const handleOrderReady = (p) => {
        if (!shouldHandleRealtimeEvent('order_ready', p)) return
        pushAlert('order_ready', { orderId: p.orderId })
        qc.invalidateQueries({ queryKey: ['store-orders'] })
      }
      const handleOrderAccepted = (p) => {
        if (!shouldHandleRealtimeEvent('order_accepted', p)) return
        pushAlert('order_accepted', { orderId: p.orderId })
        qc.invalidateQueries({ queryKey: ['store-orders'] })
      }
      const handleDriverNearby = (p) => {
        if (!shouldHandleRealtimeEvent('driver_nearby', p)) return
        pushAlert('driver_nearby', { distMeters: p.distMeters })
        // Solo mostrar el mini-mapa si está a ≤2km
        if (p.distMeters <= 2000) {
          setDriverInfo({ lat: p.lat, lng: p.lng, distMeters: p.distMeters })
        }
      }
      const handleOrderPickedUp = (p = {}) => {
        if (!shouldHandleRealtimeEvent('order_picked_up', p)) return
        setDriverInfo(null)
        qc.invalidateQueries({ queryKey: ['store-orders'] })
      }
      const handleOrderDelivered = (p) => {
        if (!shouldHandleRealtimeEvent('order_delivered', p)) return
        pushAlert('order_delivered', { orderId: p.orderId })
        setDriverInfo(null)
        qc.invalidateQueries({ queryKey: ['store-orders'] })
      }

      const realtimeScopes = ['location', 'store']
      const unsubscribers = []

      for (const scope of realtimeScopes) {
        const prefix = `${scope}:${myLocationId}`
        socket.on(`${prefix}:order_ready`, handleOrderReady)
        socket.on(`${prefix}:order_accepted`, handleOrderAccepted)
        socket.on(`${prefix}:driver_nearby`, handleDriverNearby)
        socket.on(`${prefix}:order_picked_up`, handleOrderPickedUp)
        socket.on(`${prefix}:order_delivered`, handleOrderDelivered)
        unsubscribers.push(() => {
          socket.off(`${prefix}:order_ready`, handleOrderReady)
          socket.off(`${prefix}:order_accepted`, handleOrderAccepted)
          socket.off(`${prefix}:driver_nearby`, handleDriverNearby)
          socket.off(`${prefix}:order_picked_up`, handleOrderPickedUp)
          socket.off(`${prefix}:order_delivered`, handleOrderDelivered)
        })
      }

      return () => {
        unsubscribers.forEach((unsubscribe) => unsubscribe())
        socket.disconnect()
        socketRef.current = null
      }
    }

    return () => { socket.disconnect(); socketRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocationId, qc, token])

  useEffect(() => {
    if (tab === 'alerts') setUnread(0)
  }, [tab])

  // ── Marcar pedido listo ───────────────────────────────────────────────────
  const handleMarkReady = useCallback(async (orderId) => {
    setLoadingReady(orderId)
    try {
      await api.markOrderReady(orderId)
      qc.invalidateQueries({ queryKey: ['store-orders'] })
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setLoadingReady(null)
    }
  }, [qc])

  // ── KPIs (solo 2) ─────────────────────────────────────────────────────────
  const pending = orders.filter(o => o.status === 'PENDING').length
  const ready   = orders.filter(o => o.status === 'READY_FOR_PICKUP').length

  // ── Separar pedidos por sección ───────────────────────────────────────────
  const pendingOrders = orders.filter(o => o.status === 'PENDING')
  const readyOrders   = orders.filter(o => o.status === 'READY_FOR_PICKUP')
  const otherOrders   = orders.filter(o => o.status !== 'PENDING' && o.status !== 'READY_FOR_PICKUP')

  const isVeryClose = driverInfo && driverInfo.distMeters <= 500

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Mis pedidos</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
            Estado operativo de los despachos de tu sucursal.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
          <TabBtn active={tab === 'orders'} onClick={() => setTab('orders')}>
            <Package size={13} /> Pedidos
          </TabBtn>
          <TabBtn active={tab === 'alerts'} onClick={() => setTab('alerts')}>
            {unread > 0 ? <BellRing size={13} /> : <Bell size={13} />}
            Alertas
            {unread > 0 && (
              <span style={{
                background: '#dc2626', color: '#fff',
                borderRadius: 10, padding: '0px 6px',
                fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: 'center',
              }}>{unread}</span>
            )}
          </TabBtn>
        </div>
      </div>

      {/* ── KPIs: solo 2 contadores grandes ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <KpiCard
          label="Pendientes de Carga"
          value={pending}
          color="#d97706"
          bg="#fef3c7"
          Icon={Clock}
        />
        <KpiCard
          label="Listos para Retiro"
          value={ready}
          color="#7c3aed"
          bg="#ede9fe"
          Icon={ShoppingBag}
        />
      </div>

      {/* ── TAB: Pedidos ── */}
      {tab === 'orders' && (
        <>
          {/* Radar de Proximidad */}
          <ProximityRadar driverInfo={driverInfo} isVeryClose={isVeryClose} onDismiss={() => setDriverInfo(null)} />

          {isLoading ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Cargando pedidos…
            </div>
          ) : orders.length === 0 ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              Todavía no hay pedidos. ¡Creá el primero!
            </div>
          ) : (
            <>
              {/* Sección: Pendientes de Carga */}
              {pendingOrders.length > 0 && (
                <OrderSection
                  title="Pendientes de Carga"
                  count={pendingOrders.length}
                  color="#d97706"
                  bg="#fef3c7"
                  Icon={Clock}
                >
                  {pendingOrders.map(o => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      loadingReady={loadingReady}
                      onMarkReady={handleMarkReady}
                    />
                  ))}
                </OrderSection>
              )}

              {/* Sección: Listos para Retiro */}
              {readyOrders.length > 0 && (
                <OrderSection
                  title="Listos para Retiro"
                  count={readyOrders.length}
                  color="#7c3aed"
                  bg="#ede9fe"
                  Icon={ShoppingBag}
                >
                  {readyOrders.map(o => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      loadingReady={loadingReady}
                      onMarkReady={handleMarkReady}
                    />
                  ))}
                </OrderSection>
              )}

              {/* Sección: Otros estados (en tránsito, entregados, etc.) */}
              {otherOrders.length > 0 && (
                <OrderSection
                  title="Historial"
                  count={otherOrders.length}
                  color="var(--muted)"
                  bg="var(--bg)"
                  Icon={Package}
                  collapsed
                >
                  {otherOrders.map(o => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      loadingReady={loadingReady}
                      onMarkReady={handleMarkReady}
                    />
                  ))}
                </OrderSection>
              )}
            </>
          )}
        </>
      )}

      {/* ── TAB: Alertas ── */}
      {tab === 'alerts' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={14} color="var(--accent)" />
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>Centro de alertas</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
              Notificaciones en tiempo real
            </span>
          </div>
          {alerts.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <Volume2 size={32} color="var(--muted2)" style={{ marginBottom: 10 }} />
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin alertas aún. Te notificaremos aquí con sonido.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {alerts.map((a) => (
                <div key={a.id} style={{
                  padding: '12px 18px', borderTop: '1px solid var(--border)',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: a.meta.bg, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 18,
                  }}>
                    {a.meta.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5, color: a.meta.color }}>{a.meta.label}</div>
                    {a.type === 'driver_nearby' && a.distMeters != null && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        Distancia: {a.distMeters < 1000 ? `${a.distMeters} m` : `${(a.distMeters / 1000).toFixed(1)} km`}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 3 }}>{fmt(a.ts)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── KPI Card grande ───────────────────────────────────────────────────────────
function KpiCard({ label, value, color, bg, Icon }) {
  return (
    <div className="card" style={{
      padding: '22px 24px', background: bg,
      borderColor: color + '44', display: 'flex', alignItems: 'center', gap: 18,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, background: color + '22',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={24} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 36, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 12.5, color, fontWeight: 600, marginTop: 4, opacity: 0.85 }}>{label}</div>
      </div>
    </div>
  )
}

// ── Radar de Proximidad ───────────────────────────────────────────────────────
function ProximityRadar({ driverInfo, isVeryClose, onDismiss }) {
  if (!driverInfo) return null

  const distLabel = driverInfo.distMeters < 1000
    ? `${driverInfo.distMeters} m`
    : `${(driverInfo.distMeters / 1000).toFixed(1)} km`

  return (
    <div className="card ft-card-enter" style={{ overflow: 'hidden', border: `2px solid ${isVeryClose ? '#dc2626' : '#f59e0b'}` }}>
      {/* Header del radar */}
      <div style={{
        padding: '10px 16px',
        background: isVeryClose ? '#fee2e2' : '#fef3c7',
        display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Truck size={16} color={isVeryClose ? '#dc2626' : '#d97706'} />
          <span style={{ fontWeight: 700, fontSize: 13.5, color: isVeryClose ? '#dc2626' : '#d97706' }}>
            Estado del Repartidor
          </span>
          <span style={{
            background: isVeryClose ? '#dc2626' : '#f59e0b',
            color: '#fff', borderRadius: 20, padding: '1px 9px',
            fontSize: 11, fontWeight: 700,
          }}>
            {distLabel}
          </span>
        </div>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}>
          <X size={14} />
        </button>
      </div>

      {/* Alerta parpadeante a <500m */}
      {isVeryClose && (
        <div style={{
          padding: '8px 16px',
          background: '#dc2626',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span className="ft-blink" style={{ fontSize: 15 }}>⚠️</span>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 13.5, letterSpacing: 0.3 }}>
            REPARTIDOR CERCA — Prepare los bultos
          </span>
          <span className="ft-blink" style={{ fontSize: 15, marginLeft: 'auto' }}>⚠️</span>
        </div>
      )}

      {/* Mini-mapa OpenStreetMap */}
      <iframe
        title="driver-proximity-map"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${driverInfo.lng - 0.005},${driverInfo.lat - 0.005},${driverInfo.lng + 0.005},${driverInfo.lat + 0.005}&layer=mapnik&marker=${driverInfo.lat},${driverInfo.lng}`}
        style={{ width: '100%', height: 200, border: 'none', display: 'block' }}
      />
    </div>
  )
}

// ── Sección de pedidos con título ─────────────────────────────────────────────
function OrderSection({ title, count, color, bg, Icon, children, collapsed = false }) {
  const [open, setOpen] = useState(!collapsed)
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', padding: '13px 18px',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 8, background: bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon size={14} color={color} />
        </div>
        <span style={{ fontWeight: 700, fontSize: 14, color }}>{title}</span>
        <span style={{
          background: bg, color, borderRadius: 12,
          padding: '1px 9px', fontSize: 11.5, fontWeight: 700,
        }}>{count}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Tarjeta de pedido ─────────────────────────────────────────────────────────
function OrderCard({ order: o, loadingReady, onMarkReady }) {
  const meta    = STATUS_META[o.status] || STATUS_META.PENDING
  const { Icon } = meta
  const isPending  = o.status === 'PENDING'
  const isReady    = o.status === 'READY_FOR_PICKUP'
  const isLoading  = loadingReady === o.id
  const code       = o.pickup_code || orderCode(o.id)
  const hasInvoice = Boolean(o.invoice_photo_url)

  return (
    <div className="ft-card-enter" style={{
      padding: '16px 18px',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'flex-start', gap: 14,
      background: isReady ? 'rgba(124,58,237,0.03)' : 'transparent',
    }}>
      {/* Ícono de estado */}
      <div style={{
        width: 40, height: 40, borderRadius: 11, flexShrink: 0,
        background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={19} color={meta.color} />
      </div>

      {/* Datos */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Fila 1: nombre + badge estado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, fontSize: 15 }}>{o.customer_name}</span>
          {o.customer_phone && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{o.customer_phone}</span>
          )}
          <span style={{
            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4,
            background: meta.bg, color: meta.color,
            borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 700,
          }}>
            <Icon size={9} /> {meta.label}
          </span>
        </div>

        {/* Fila 2: dirección */}
        <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
          <MapPin size={11} />
          <span style={{ fontWeight: 500 }}>{o.delivery_address}</span>
        </div>

        {/* Fila 3: monto + código + factura */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          {o.payment_amount > 0 && (
            <span style={{
              fontSize: 15, fontWeight: 800, color: '#059669',
              background: '#d1fae5', borderRadius: 8, padding: '3px 9px',
            }}>
              ${parseFloat(o.payment_amount).toLocaleString('es-AR')}
            </span>
          )}
          <span style={{
            fontSize: 13, fontWeight: 700, color: '#4f46e5',
            background: 'var(--accent-l)', borderRadius: 8, padding: '3px 9px',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            📦 Código: {code}
          </span>

          {/* Indicador de factura */}
          {hasInvoice ? (
            <a
              href={o.invoice_photo_url}
              target="_blank"
              rel="noreferrer"
              title="Ver factura"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 700, color: '#059669',
                background: '#d1fae5', borderRadius: 8, padding: '3px 9px',
                textDecoration: 'none',
              }}
            >
              ✅ Factura OK
            </a>
          ) : (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 700, color: '#dc2626',
              background: '#fee2e2', borderRadius: 8, padding: '3px 9px',
            }}>
              ⚠️ Sin foto de factura
            </span>
          )}

          <span style={{ fontSize: 11, color: 'var(--muted2)', marginLeft: 'auto' }}>{fmt(o.created_at)}</span>
        </div>

        {/* Tags de producto */}
        {(o.product_brand || o.product_weight) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
            {o.product_brand && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11.5, color: '#4f46e5', fontWeight: 600,
                background: 'var(--accent-l)', borderRadius: 6, padding: '2px 7px',
              }}>
                <Tag size={10} /> {o.product_brand}
              </span>
            )}
            {o.product_weight && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11.5, color: '#0284c7', fontWeight: 600,
                background: '#e0f2fe', borderRadius: 6, padding: '2px 7px',
              }}>
                <Weight size={10} /> {o.product_weight}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Botón acción */}
      <div style={{ flexShrink: 0, alignSelf: 'center' }}>
        {isPending && (
          <button
            onClick={() => onMarkReady(o.id)}
            disabled={isLoading}
            style={{
              background: '#7c3aed', color: '#fff',
              border: 'none', borderRadius: 9, padding: '9px 14px',
              fontSize: 12.5, fontWeight: 700,
              cursor: isLoading ? 'wait' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              whiteSpace: 'nowrap',
              transition: 'background .15s',
            }}
          >
            {isLoading ? '…' : '✓ Listo para retiro'}
          </button>
        )}
        {isReady && (
          <div style={{
            background: '#059669', color: '#fff',
            borderRadius: 9, padding: '9px 14px',
            fontSize: 12.5, fontWeight: 700,
            whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            ✅ Listo
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 13px', borderRadius: 7, border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: active ? 700 : 500,
        background: active ? 'var(--surface)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)',
        boxShadow: active ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
        transition: 'all .12s',
      }}
    >
      {children}
    </button>
  )
}
