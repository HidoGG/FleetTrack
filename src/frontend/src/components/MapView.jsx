import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import L from 'leaflet'

// ── Iconos de vehículos ────────────────────────────────────────────────────────

// cashLevel: 'normal' | 'warning' | 'danger' | null
function createTruckIcon(isFollowed = false, cashLevel = null) {
  const bg   = isFollowed ? '#0f172a' : '#4f46e5'

  // Semáforo de efectivo: el borde exterior indica el nivel de alerta
  const cashBorderColor = {
    warning: '#f59e0b',
    danger:  '#ef4444',
    normal:  null,
  }[cashLevel] || null

  // Si hay alerta de efectivo, usar borde de semáforo; si no, el estilo original
  const ring = cashBorderColor
    ? `3px solid ${cashBorderColor}`
    : isFollowed ? '3px solid #4f46e5' : '2px solid #fff'

  const glow = cashBorderColor
    ? `0 0 0 4px ${cashLevel === 'danger' ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.3)'}, 0 2px 8px rgba(0,0,0,.25)`
    : isFollowed
      ? '0 0 0 4px rgba(79,70,229,.25), 0 2px 8px rgba(0,0,0,.3)'
      : '0 2px 6px rgba(79,70,229,.4)'

  // Indicador pequeño de alerta (punto parpadeante sobre el ícono)
  const alertDot = cashBorderColor
    ? `<div style="
        position:absolute;top:-4px;right:-4px;
        width:10px;height:10px;border-radius:50%;
        background:${cashBorderColor};
        border:1.5px solid #fff;
        box-shadow:0 1px 4px rgba(0,0,0,.2);
      "></div>`
    : ''

  return L.divIcon({
    html: `<div style="position:relative;width:34px;height:34px;">
      <div style="
        width:34px;height:34px;
        background:${bg};
        border-radius:50% 50% 50% 4px;
        border:${ring};
        box-shadow:${glow};
        display:flex;align-items:center;justify-content:center;
        transition:all .2s;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/>
          <rect x="9" y="11" width="14" height="10" rx="2"/>
          <circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
        </svg>
      </div>
      ${alertDot}
    </div>`,
    className:   '',
    iconSize:    [34, 34],
    iconAnchor:  [17, 17],
    popupAnchor: [0, -20],
  })
}

// ── Iconos de pedidos (pines naranja/verde numerados) ─────────────────────────

function createOrderIcon(num, status) {
  const isDelivered = status === 'DELIVERED' || status === 'FAILED'
  const bg = isDelivered ? '#10b981' : '#f59e0b'
  const shadow = isDelivered
    ? '0 2px 8px rgba(16,185,129,.45)'
    : '0 2px 8px rgba(245,158,11,.45)'
  const inner = isDelivered
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
         fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
         <polyline points="20 6 9 17 4 12"/>
       </svg>`
    : `<span style="color:#fff;font-size:11px;font-weight:800;line-height:1">${num}</span>`

  return L.divIcon({
    html: `<div style="
      width:30px;height:30px;
      background:${bg};
      border-radius:50%;
      border:2.5px solid #fff;
      box-shadow:${shadow};
      display:flex;align-items:center;justify-content:center;
    ">${inner}</div>`,
    className:   '',
    iconSize:    [30, 30],
    iconAnchor:  [15, 30],
    popupAnchor: [0, -32],
  })
}

// Formatea un timestamp ISO o string "HH:MM" a "HH:MM"
function formatDeliveryTime(raw) {
  if (!raw) return null
  if (/^\d{2}:\d{2}$/.test(raw)) return raw          // ya es "HH:MM"
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return raw
  }
}

// ── Popup para pines entregados (con evidencia) ───────────────────────────────

function buildDeliveredPopup(order) {
  const timeLabel = formatDeliveryTime(order.delivered_at)
  const timeStr = timeLabel
    ? `<div style="color:#64748b;font-size:11px;margin-top:3px;display:flex;align-items:center;gap:4px">
         <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none"
           stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
           <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
         </svg>
         ${timeLabel} hs
       </div>`
    : ''

  const amountStr = order.payment_amount > 0
    ? `<div style="color:#059669;font-size:11px;font-weight:600;margin-top:4px">
         $${parseFloat(order.payment_amount).toLocaleString('es-AR')}
       </div>`
    : ''

  return `
    <div style="font-family:Inter,sans-serif;min-width:190px;max-width:220px">
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
        <div style="width:18px;height:18px;background:#10b981;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <span style="font-weight:700;font-size:12px;color:#059669">Entrega Confirmada</span>
      </div>
      ${timeStr}
      <div style="border-top:1px solid #e2e8f0;margin:7px 0 5px"></div>
      <div style="font-weight:600;font-size:13px;color:#0f172a">${order.customer_name}</div>
      <div style="color:#64748b;font-size:11px;margin-top:1px">${order.delivery_address}</div>
      ${amountStr}
      ${order.pod_photo_url
        ? `<img src="${order.pod_photo_url}" alt="Foto de entrega"
             style="width:100%;border-radius:8px;margin-top:9px;display:block;max-height:140px;object-fit:cover"/>`
        : `<div style="
             background:#f0fdf4;border-radius:8px;padding:12px 8px;
             text-align:center;margin-top:9px;border:1px dashed #86efac;">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60" width="80" height="60">
               <rect width="80" height="60" rx="6" fill="#f0fdf4"/>
               <rect x="18" y="8" width="44" height="36" rx="4" fill="#d1fae5"/>
               <path d="M28 8 Q40 2 52 8" stroke="#10b981" stroke-width="2.5" fill="none" stroke-linecap="round"/>
               <rect x="28" y="15" width="24" height="3" rx="1.5" fill="#10b981" opacity=".5"/>
               <rect x="28" y="22" width="18" height="3" rx="1.5" fill="#10b981" opacity=".5"/>
               <rect x="28" y="29" width="20" height="3" rx="1.5" fill="#10b981" opacity=".5"/>
               <circle cx="40" cy="50" r="5" fill="#10b981" opacity=".8"/>
               <polyline points="37 50 39.5 52.5 43.5 47" stroke="#fff" stroke-width="1.5"
                 fill="none" stroke-linecap="round" stroke-linejoin="round"/>
             </svg>
             <div style="font-size:10px;color:#059669;font-weight:600;margin-top:2px">Foto de entrega</div>
           </div>`
      }
    </div>`
}

// ── Popup para pines pendientes ───────────────────────────────────────────────

function buildPendingPopup(order, num) {
  return `
    <div style="font-family:Inter,sans-serif;min-width:160px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <div style="
          width:20px;height:20px;background:#f59e0b;border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:10px;font-weight:800;color:#fff;flex-shrink:0
        ">${num}</div>
        <span style="font-weight:700;font-size:13px;color:#0f172a">${order.customer_name}</span>
      </div>
      <div style="color:#64748b;font-size:11px">${order.delivery_address}</div>
      <div style="margin-top:6px;display:flex;align-items:center;gap:6px">
        <span style="background:#fef3c7;color:#d97706;border-radius:20px;padding:2px 8px;font-size:10px;font-weight:700">
          ${order.status === 'IN_TRANSIT' ? 'En camino' : 'Pendiente'}
        </span>
        ${order.payment_amount > 0
          ? `<span style="color:#059669;font-size:11px;font-weight:600">$${parseFloat(order.payment_amount).toLocaleString('es-AR')}</span>`
          : ''}
      </div>
    </div>`
}

// ── Componente principal ──────────────────────────────────────────────────────

/**
 * MapView expone estos métodos via ref:
 *   flyTo(lat, lng, zoom?)                — volar a una coordenada
 *   fitAll(vehicles)                      — ajustar zoom a todos los vehículos activos
 *   setFollowed(vehicleId)                — marcar vehículo seguido (cambia icono)
 *   showOrderPins(orders)                 — mostrar pines de pedidos (naranja/verde)
 *   updateOrderPin(orderId, status)       — actualizar color de un pin sin recargar todos
 *   clearOrderPins()                      — quitar todos los pines y la polyline
 *   showHistoryPath(pathCoords)           — trazar polyline azul del rastro del día
 *   clearHistoryPath()                    — quitar la polyline del rastro
 */
// cashData: { [vehicleId]: { amount: number, level: 'normal'|'warning'|'danger' } }
const MapView = forwardRef(function MapView({ vehicles = [], height = '100%', cashData = {} }, ref) {
  const mapDivRef       = useRef(null)
  const mapInst         = useRef(null)
  const markersRef      = useRef({})   // { vehicleId: L.Marker }
  const orderMarkersRef = useRef({})   // { orderId: { marker, num, status } }
  const followedRef     = useRef(null)
  const polylineRef     = useRef(null) // línea de trayectoria azul
  const cashDataRef     = useRef({})   // ref siempre fresca de cashData (para callbacks)

  // ─── Inicializar mapa ─────────────────────────────────────────────────────
  useEffect(() => {
    if (mapInst.current) return
    mapInst.current = L.map(mapDivRef.current, {
      center:      [-38.9516, -68.0591], // centrado en Neuquén para la demo
      zoom:        13,
      zoomControl: true,
    })
    // CartoDB Positron — fondo claro/grisáceo, alto contraste para los pines de semáforo
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains:  'abcd',
      maxZoom:     20,
    }).addTo(mapInst.current)

    return () => {
      mapInst.current?.remove()
      mapInst.current = null
    }
  }, [])

  // ─── API pública ──────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({

    flyTo(lat, lng, zoom = 15) {
      mapInst.current?.flyTo([lat, lng], zoom, { duration: 0.8, easeLinearity: 0.25 })
    },

    fitAll(activeVehicles) {
      const pts = activeVehicles.filter(v => v.lat && v.lng)
      if (!pts.length) return
      if (pts.length === 1) {
        mapInst.current?.flyTo([pts[0].lat, pts[0].lng], 14, { duration: 0.8 })
        return
      }
      const bounds = L.latLngBounds(pts.map(v => [v.lat, v.lng]))
      mapInst.current?.flyToBounds(bounds, { padding: [60, 60], duration: 0.9, maxZoom: 15 })
    },

    setFollowed(vehicleId) {
      const prev = followedRef.current
      followedRef.current = vehicleId
      if (prev && markersRef.current[prev]) {
        markersRef.current[prev].setIcon(createTruckIcon(false, cashDataRef.current[prev]?.level))
      }
      if (vehicleId && markersRef.current[vehicleId]) {
        markersRef.current[vehicleId].setIcon(createTruckIcon(true, cashDataRef.current[vehicleId]?.level))
      }
    },

    // ── Pines de pedidos ────────────────────────────────────────────────────
    // numberMap: { [orderId]: number } — números estáticos asignados externamente.
    // Si no se provee (o un id no está), se asigna por conteo secuencial de pendientes.
    showOrderPins(orders, numberMap = {}) {
      if (!mapInst.current) return

      // Limpiar los anteriores
      Object.values(orderMarkersRef.current).forEach(({ marker }) => marker.remove())
      orderMarkersRef.current = {}

      let pendingIdx = 0
      orders.forEach((order) => {
        if (!order.delivery_lat || !order.delivery_lng) return

        const isDelivered = order.status === 'DELIVERED' || order.status === 'FAILED'
        // Usar número estático externo si existe; si no, asignar secuencialmente
        const num = isDelivered
          ? null
          : (numberMap[order.id] != null ? numberMap[order.id] : ++pendingIdx)
        const icon = createOrderIcon(num, order.status)

        const popup = isDelivered
          ? buildDeliveredPopup(order)
          : buildPendingPopup(order, num)

        const marker = L.marker([order.delivery_lat, order.delivery_lng], { icon })
          .addTo(mapInst.current)
          .bindPopup(popup, { maxWidth: 260 })

        orderMarkersRef.current[order.id] = { marker, num, status: order.status }
      })
    },

    // Actualiza el color/ícono de un pin sin recrear todos.
    // El número original (num) se preserva siempre — no se nulifica al entregar.
    updateOrderPin(orderId, newStatus) {
      const entry = orderMarkersRef.current[orderId]
      if (!entry) return
      const isDelivered = newStatus === 'DELIVERED' || newStatus === 'FAILED'
      // displayNum: null solo para el ícono del entregado (muestra checkmark);
      // entry.num queda intacto para futuras referencias.
      const displayNum = isDelivered ? null : entry.num
      entry.marker.setIcon(createOrderIcon(displayNum, newStatus))
      // Solo actualizar status; num permanece con su valor original
      orderMarkersRef.current[orderId] = { ...entry, status: newStatus }
    },

    clearOrderPins() {
      Object.values(orderMarkersRef.current).forEach(({ marker }) => marker.remove())
      orderMarkersRef.current = {}
      // Limpiar la polyline de trayectoria también
      if (polylineRef.current) {
        polylineRef.current.remove()
        polylineRef.current = null
      }
    },

    // ── Trayectoria del día (History Path) ──────────────────────────────────
    showHistoryPath(pathCoords) {
      if (!mapInst.current) return
      // Remover polyline anterior si existe
      if (polylineRef.current) {
        polylineRef.current.remove()
        polylineRef.current = null
      }
      if (!pathCoords || pathCoords.length < 2) return

      polylineRef.current = L.polyline(
        pathCoords.map(p => [p.lat, p.lng]),
        {
          color:        '#3B82F6',
          weight:       3.5,
          opacity:      0.6,
          smoothFactor: 1,
          dashArray:    null,
        }
      ).addTo(mapInst.current)
    },

    clearHistoryPath() {
      if (polylineRef.current) {
        polylineRef.current.remove()
        polylineRef.current = null
      }
    },

  }), [])

  // ─── Mantener cashDataRef fresca ─────────────────────────────────────────
  useEffect(() => { cashDataRef.current = cashData }, [cashData])

  // ─── Marcadores de vehículos ──────────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current) return
    const map = mapInst.current

    vehicles.forEach(({ id, plate, lat, lng, status, speed }) => {
      if (!lat || !lng) return

      const isFollowed = followedRef.current === id
      const cash       = cashData[id]
      const icon       = createTruckIcon(isFollowed, cash?.level ?? null)

      // Alerta de efectivo en el popup
      const cashAlert = cash && cash.level !== 'normal'
        ? `<div style="
            display:flex;align-items:center;gap:5px;
            margin-top:7px;padding:6px 9px;
            background:${cash.level === 'danger' ? '#fee2e2' : '#fef3c7'};
            border-radius:7px;border:1px solid ${cash.level === 'danger' ? '#fca5a5' : '#fcd34d'};
          ">
            <span style="font-size:13px">${cash.level === 'danger' ? '🔴' : '🟡'}</span>
            <div>
              <div style="font-weight:700;font-size:11px;color:${cash.level === 'danger' ? '#dc2626' : '#b45309'}">
                ${cash.level === 'danger' ? 'Exceso de efectivo' : 'Efectivo en revisión'}
              </div>
              <div style="font-size:11px;color:${cash.level === 'danger' ? '#dc2626' : '#b45309'}">
                $${cash.amount.toLocaleString('es-AR')} a rendir
              </div>
            </div>
          </div>`
        : ''

      const popup = `
        <div style="font-family:Inter,sans-serif;min-width:150px">
          <div style="font-weight:700;font-size:14px;color:#0f172a">${plate}</div>
          <div style="color:#64748b;font-size:12px;margin-top:2px">${status}</div>
          ${speed != null
            ? `<div style="color:#4f46e5;font-size:12px;margin-top:4px;font-weight:600">${speed} km/h</div>`
            : ''}
          <div style="color:#94a3b8;font-size:11px;margin-top:3px">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
          ${cashAlert}
        </div>`

      if (markersRef.current[id]) {
        markersRef.current[id]
          .setLatLng([lat, lng])
          .setIcon(icon)
          .getPopup()?.setContent(popup)
      } else {
        markersRef.current[id] = L.marker([lat, lng], { icon })
          .addTo(map)
          .bindPopup(popup)
      }
    })
  }, [vehicles, cashData])

  return (
    <div
      ref={mapDivRef}
      style={{ height, width: '100%', borderRadius: 'var(--radius-lg)' }}
    />
  )
})

export default MapView
