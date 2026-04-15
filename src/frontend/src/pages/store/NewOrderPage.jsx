import { useRef, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Camera, X, CheckCircle, Send, Plus, Trash2, Package, MapPin } from 'lucide-react'
import { api } from '../../services/api'

// ── Photon Autocomplete (Komoot — sin API Key, más rápido que Nominatim) ──────
// Motor: https://photon.komoot.io  |  Debounce: 600ms
// Modo híbrido: si el usuario agrega número manualmente sobre una calle
// ya geocodificada, las coordenadas de la calle se preservan (no se borran).

const PHOTON_URL = 'https://photon.komoot.io/api/'
const DEBOUNCE_MS = 600

// Construye texto de dirección legible a partir del feature GeoJSON de Photon
function formatPhotonAddress(feature) {
  const p = feature.properties
  const parts = []

  // Calle + número
  if (p.street && p.housenumber) {
    parts.push(`${p.street} ${p.housenumber}`)
  } else if (p.street) {
    parts.push(p.street)
  } else if (p.name) {
    parts.push(p.name)
  }

  // Ciudad
  if (p.city)        parts.push(p.city)
  else if (p.county) parts.push(p.county)
  else if (p.state)  parts.push(p.state)

  // Provincia (solo si hay ciudad para evitar duplicar)
  if (p.state && p.city && p.state !== p.city) parts.push(p.state)

  return parts.filter(Boolean).join(', ')
}

// Línea secundaria de la sugerencia (tipo + ciudad)
function formatPhotonSub(feature) {
  const p = feature.properties
  const parts = []
  if (p.city && p.street && p.city !== p.street) parts.push(p.city)
  if (p.state && p.state !== p.city)              parts.push(p.state)
  if (p.countrycode)                              parts.push(p.countrycode)
  return parts.filter(Boolean).join(', ')
}

// ── Modos de coordenadas ──────────────────────────────────────────────────────
// null    → sin GPS capturado aún
// 'exact' → coords del resultado seleccionado, texto sin modificar
// 'hybrid'→ coords de la calle base preservadas, texto editado manualmente

function PhotonAutocomplete({ value, onChange, onPlaceSelect, required }) {
  const [suggestions, setSuggestions] = useState([])
  const [open,        setOpen]        = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [coordsMode,  setCoordsMode]  = useState(null)

  // Referencia a las coords y texto del último resultado seleccionado
  const lockedCoordsRef = useRef(null)  // { lat, lng }
  const selectedTextRef = useRef('')    // texto en el momento de la selección
  const debounceRef     = useRef(null)
  const containerRef    = useRef(null)
  const lastQuery       = useRef('')

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function onOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  function handleInput(e) {
    const q = e.target.value
    onChange(q)

    // ── Modo híbrido: hay coords bloqueadas del buscador ──────────────────────
    if (lockedCoordsRef.current) {
      const baseText = selectedTextRef.current

      // Si el usuario borró todo o más de 8 caracteres del texto base → desbloquear
      const deletion = baseText.length - q.length
      if (q.trim() === '' || deletion > 8) {
        unlockCoords()
        // Seguir hacia la búsqueda normal
      } else {
        // Edición menor (agregar número, sigla, etc.) → preservar coords
        setCoordsMode('hybrid')
        clearTimeout(debounceRef.current)
        return   // No disparar nueva búsqueda: el usuario está refinando la dirección
      }
    } else {
      setCoordsMode(null)
    }

    // ── Búsqueda normal ───────────────────────────────────────────────────────
    clearTimeout(debounceRef.current)

    if (q.length < 4) {
      setSuggestions([])
      setOpen(false)
      return
    }

    lastQuery.current = q
    debounceRef.current = setTimeout(() => searchPhoton(q), DEBOUNCE_MS)
  }

  async function searchPhoton(q) {
    if (q !== lastQuery.current) return
    setLoading(true)
    try {
      // Photon soporta lang: 'en' | 'de' | 'fr' — 'es' causa 400.
      // Sin lang, OSM devuelve los nombres en su idioma original (español en AR).
      const params = new URLSearchParams({ q, limit: '7' })
      const res  = await fetch(`${PHOTON_URL}?${params}`)
      const json = await res.json()
      // Filtrar solo Argentina y resultados con coordenadas válidas
      const features = (json.features || []).filter(
        f => f.properties?.countrycode === 'AR' && f.geometry?.coordinates?.length === 2
      )
      setSuggestions(features)
      setOpen(features.length > 0)
    } catch {
      setSuggestions([])
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(feature) {
    const text       = formatPhotonAddress(feature)
    const [lng, lat] = feature.geometry.coordinates  // Photon: [lon, lat]

    // Actualizar padre con texto Y coords
    onChange(text)
    onPlaceSelect({ address: text, lat, lng })

    // Bloquear coords para el modo híbrido
    lockedCoordsRef.current = { lat, lng }
    selectedTextRef.current = text
    setCoordsMode('exact')

    setSuggestions([])
    setOpen(false)
  }

  function unlockCoords() {
    lockedCoordsRef.current = null
    selectedTextRef.current = ''
    setCoordsMode(null)
  }

  function handleClearLock() {
    onChange('')
    unlockCoords()
    setSuggestions([])
    setOpen(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const pinColor = coordsMode === 'exact' ? '#059669' : coordsMode === 'hybrid' ? '#d97706' : null

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>

      {/* Input principal */}
      <div style={{ position: 'relative' }}>
        <input
          className="input"
          value={value}
          onChange={handleInput}
          placeholder="Av. Argentina 1234, Neuquén"
          required={required}
          autoComplete="off"
          style={{ paddingRight: coordsMode ? 58 : 10 }}
        />

        {/* Indicadores de estado (derecha del input) */}
        <div style={{
          position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
          display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none',
        }}>
          {loading && (
            <span style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>
              buscando…
            </span>
          )}
          {pinColor && !loading && (
            <MapPin size={14} color={pinColor} />
          )}
          {/* Botón de desbloqueo (modo híbrido) — tiene pointer-events propios */}
          {coordsMode === 'hybrid' && !loading && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); handleClearLock() }}
              title="Limpiar y buscar una calle nueva"
              style={{
                pointerEvents: 'all',
                background: '#fef3c7', border: '1px solid #fcd34d',
                borderRadius: 4, width: 18, height: 18, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              }}
            >
              <X size={10} color="#b45309" />
            </button>
          )}
        </div>
      </div>

      {/* Pill de estado bajo el input */}
      {coordsMode === 'exact' && (
        <span style={{ fontSize: 11, color: '#059669', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <MapPin size={10} /> GPS exacto capturado
        </span>
      )}
      {coordsMode === 'hybrid' && (
        <span style={{ fontSize: 11, color: '#d97706', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <MapPin size={10} />
          GPS de calle preservado — podés agregar el número sin perder la ubicación
        </span>
      )}

      {/* Dropdown de sugerencias */}
      {open && suggestions.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 9999,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,.15)',
          maxHeight: 250, overflowY: 'auto',
        }}>
          {suggestions.map((feature, i) => {
            const main = formatPhotonAddress(feature)
            const sub  = formatPhotonSub(feature)
            return (
              <div
                key={`${feature.properties?.osm_id ?? i}-${i}`}
                onMouseDown={() => handleSelect(feature)}
                style={{
                  padding: '9px 13px', cursor: 'pointer',
                  borderBottom: i < suggestions.length - 1 ? '1px solid var(--border)' : 'none',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-l)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                  {main || '(sin nombre)'}
                </div>
                {sub && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.3 }}>
                    {sub}
                  </div>
                )}
              </div>
            )
          })}
          <div style={{
            padding: '5px 13px', fontSize: 10, color: 'var(--muted2)',
            borderTop: '1px solid var(--border)', background: 'var(--bg)',
            borderBottomLeftRadius: 10, borderBottomRightRadius: 10,
          }}>
            © OpenStreetMap contributors · Photon (Komoot)
          </div>
        </div>
      )}
    </div>
  )
}

// ── Bloque individual de producto ─────────────────────────────────────────────

function ProductItem({ item, index, presets, onChange, onRemove, canRemove }) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      padding: '14px 16px', background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          Producto {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              background: '#fee2e2', border: 'none', borderRadius: 6,
              padding: '3px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 11, color: '#dc2626', fontWeight: 600,
            }}
          >
            <Trash2 size={11} /> Quitar
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <label style={lblStyle}>
          Marca
          <input
            className="input"
            placeholder="YPF, Coca-Cola…"
            value={item.brand}
            onChange={e => onChange({ ...item, brand: e.target.value })}
          />
        </label>
        <label style={lblStyle}>
          Producto *
          <input
            className="input"
            placeholder="Aceite, Gaseosa…"
            required
            value={item.product}
            onChange={e => onChange({ ...item, product: e.target.value })}
          />
        </label>
        <label style={lblStyle}>
          Cantidad *
          <input
            className="input"
            type="number"
            min="1"
            step="1"
            required
            value={item.quantity}
            onChange={e => onChange({ ...item, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
          />
        </label>
        <label style={lblStyle}>
          Peso / Tamaño *
          <select
            className="input"
            required
            value={item.weight_preset_id}
            onChange={e => {
              const preset = presets.find(p => p.id === e.target.value)
              onChange({
                ...item,
                weight_preset_id: e.target.value,
                weight_label: preset ? `${preset.label} (${preset.weight_kg} kg)` : '',
              })
            }}
            style={{ appearance: 'auto' }}
          >
            <option value="">Seleccioná…</option>
            {presets.filter(p => p.active).map(p => (
              <option key={p.id} value={p.id}>
                {p.label} — {p.weight_kg} kg
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

const EMPTY_ITEM = () => ({ brand: '', product: '', quantity: 1, weight_preset_id: '', weight_label: '' })

export default function NewOrderPage() {
  const navigate = useNavigate()

  // Datos del destinatario
  const [customer_name,    setCustomerName]    = useState('')
  const [customer_phone,   setCustomerPhone]   = useState('')
  const [delivery_address, setDeliveryAddress] = useState('')
  const [delivery_lat,     setDeliveryLat]     = useState(null)
  const [delivery_lng,     setDeliveryLng]     = useState(null)
  const [notes,            setNotes]           = useState('')

  // Multi-producto
  const [items, setItems] = useState([EMPTY_ITEM()])

  // Cobro condicional
  const [alreadyPaid,     setAlreadyPaid]    = useState(false)  // "¿Ya fue pagado?"
  const [payment_amount,  setPaymentAmount]  = useState('')
  const [merchandise_value, setMerchandiseValue] = useState('')

  // Foto de factura
  const [invoiceFile,    setInvoiceFile]    = useState(null)
  const [invoicePreview, setInvoicePreview] = useState(null)
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState('')

  // Presets de peso desde el backend
  const { data: presets = [] } = useQuery({
    queryKey: ['weight-presets'],
    queryFn:  api.getWeightPresets,
    staleTime: 5 * 60 * 1000,
  })

  // ── Callbacks ───────────────────────────────────────────────────────────────

  const handlePlaceSelect = useCallback(({ address, lat, lng }) => {
    setDeliveryAddress(address)
    setDeliveryLat(lat)
    setDeliveryLng(lng)
  }, [])

  function addItem() {
    setItems(prev => [...prev, EMPTY_ITEM()])
  }

  function updateItem(index, updated) {
    setItems(prev => prev.map((item, i) => i === index ? updated : item))
  }

  function removeItem(index) {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setInvoiceFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setInvoicePreview(reader.result)
    reader.readAsDataURL(file)
  }

  function removeInvoice() {
    setInvoiceFile(null)
    setInvoicePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const order = await api.createOrder({
        customer_name:     customer_name.trim(),
        customer_phone:    customer_phone || undefined,
        delivery_address:  delivery_address.trim(),
        delivery_lat:      delivery_lat  ?? undefined,
        delivery_lng:      delivery_lng  ?? undefined,
        notes:             notes || undefined,
        is_cod:            !alreadyPaid,
        payment_amount:    alreadyPaid ? 0 : (parseFloat(payment_amount) || 0),
        merchandise_value: parseFloat(merchandise_value) || 0,
        items:             items.filter(i => i.product?.trim()),
      })

      if (invoiceFile) {
        const base64 = await fileToBase64(invoiceFile)
        await api.uploadInvoice(order.id, base64)
      }

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        navigate('/store/dashboard')
      }, 1800)

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Estados de UI ────────────────────────────────────────────────────────────

  if (success) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
        <CheckCircle size={52} color="#059669" strokeWidth={1.5} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#059669' }}>¡Pedido despachado!</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Redirigiendo a tus pedidos…</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 660 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Nuevo despacho</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
          Completá los datos del destino y los productos del envío.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Destinatario ── */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={sectionTitle}>Destinatario</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <label style={lblStyle}>
              Nombre del cliente *
              <input
                className="input"
                placeholder="Juan Pérez"
                required
                value={customer_name}
                onChange={e => setCustomerName(e.target.value)}
              />
            </label>
            <label style={lblStyle}>
              Teléfono
              <input
                className="input"
                placeholder="+54 9 299 000-0000"
                value={customer_phone}
                onChange={e => setCustomerPhone(e.target.value)}
              />
            </label>
            <label style={{ ...lblStyle, gridColumn: '1/-1' }}>
              Dirección de entrega *
              <PhotonAutocomplete
                value={delivery_address}
                onChange={setDeliveryAddress}
                onPlaceSelect={handlePlaceSelect}
                required
              />
            </label>
            <label style={{ ...lblStyle, gridColumn: '1/-1' }}>
              Notas (instrucciones de entrega)
              <textarea
                className="input"
                rows={2}
                placeholder="Dejar en portería, llamar antes de llegar…"
                style={{ resize: 'vertical' }}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </label>
          </div>
        </div>

        {/* ── Detalle multi-producto ── */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ ...sectionTitle, margin: 0 }}>
              <Package size={13} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Detalle del envío
            </h3>
            <button
              type="button"
              onClick={addItem}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'var(--accent-l)', color: 'var(--accent)',
                border: '1px solid var(--accent)', borderRadius: 8,
                padding: '5px 12px', cursor: 'pointer',
                fontSize: 12, fontWeight: 700,
              }}
            >
              <Plus size={13} /> Agregar producto
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((item, i) => (
              <ProductItem
                key={i}
                index={i}
                item={item}
                presets={presets}
                onChange={updated => updateItem(i, updated)}
                onRemove={() => removeItem(i)}
                canRemove={items.length > 1}
              />
            ))}
          </div>

          {presets.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10, fontStyle: 'italic' }}>
              Sin presets de peso configurados. El administrador puede agregarlos desde el panel.
            </p>
          )}
        </div>

        {/* ── Cobro condicional ── */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={sectionTitle}>Cobro en destino</h3>

          {/* Pregunta principal */}
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>
            ¿El producto ya fue pagado?
          </p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
            <label style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 10,
              border: `2px solid ${alreadyPaid ? '#059669' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
              background: alreadyPaid ? '#f0fdf4' : 'var(--bg)',
              transition: 'all .15s',
            }}>
              <input
                type="radio"
                name="already_paid"
                checked={alreadyPaid}
                onChange={() => { setAlreadyPaid(true); setPaymentAmount('') }}
                style={{ accentColor: '#059669' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: alreadyPaid ? '#059669' : 'var(--text)' }}>
                  Sí, ya fue pagado
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                  El repartidor no cobra nada
                </div>
              </div>
            </label>

            <label style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 10,
              border: `2px solid ${!alreadyPaid ? '#d97706' : 'var(--border)'}`,
              borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
              background: !alreadyPaid ? '#fffbeb' : 'var(--bg)',
              transition: 'all .15s',
            }}>
              <input
                type="radio"
                name="already_paid"
                checked={!alreadyPaid}
                onChange={() => setAlreadyPaid(false)}
                style={{ accentColor: '#d97706' }}
              />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: !alreadyPaid ? '#d97706' : 'var(--text)' }}>
                  No, cobra en destino (COD)
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                  El repartidor recauda el efectivo
                </div>
              </div>
            </label>
          </div>

          {/* Monto (visible solo si no fue pagado) */}
          {!alreadyPaid && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <label style={lblStyle}>
                Monto a cobrar ($) *
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="0.00"
                  value={payment_amount}
                  onChange={e => setPaymentAmount(e.target.value)}
                />
              </label>
              <label style={lblStyle}>
                Valor de mercadería ($)
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={merchandise_value}
                  onChange={e => setMerchandiseValue(e.target.value)}
                />
              </label>
            </div>
          )}

          {/* Monto bloqueado si ya fue pagado */}
          {alreadyPaid && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 8, padding: '10px 14px',
            }}>
              <CheckCircle size={15} color="#059669" />
              <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>
                Monto bloqueado en $0 — sin cobro en destino
              </span>
            </div>
          )}
        </div>

        {/* ── Foto de factura ── */}
        <div className="card" style={{ padding: '20px 24px' }}>
          <h3 style={{ ...sectionTitle, marginBottom: 4 }}>Foto de factura / remito</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
            Se usará para auditoría. El admin puede compararla con la foto de entrega.
          </p>

          {invoicePreview ? (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img
                src={invoicePreview}
                alt="Vista previa factura"
                style={{ width: '100%', maxWidth: 320, height: 200, objectFit: 'cover', borderRadius: 10, border: '2px solid #059669' }}
              />
              <button
                type="button"
                onClick={removeInvoice}
                style={{
                  position: 'absolute', top: 8, right: 8,
                  background: '#fff', border: '1px solid var(--border)',
                  borderRadius: '50%', width: 28, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,.1)',
                }}
              >
                <X size={14} color="#dc2626" />
              </button>
            </div>
          ) : (
            <label
              htmlFor="invoice-input"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 10, padding: '28px 20px',
                border: '2px dashed var(--border)', borderRadius: 10,
                cursor: 'pointer', background: 'var(--bg)',
                transition: 'border-color .15s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#059669'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <Camera size={28} color="var(--muted2)" />
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 500 }}>
                Tocá para tomar o subir la foto de la factura
              </span>
              <span style={{ fontSize: 11, color: 'var(--muted2)' }}>JPEG, PNG · máx 10 MB</span>
            </label>
          )}

          <input
            id="invoice-input"
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: '#059669', color: '#fff',
            border: 'none', borderRadius: 10, padding: '14px 24px',
            fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Despachando…' : (<><Send size={16} /> Despachar pedido</>)}
        </button>
      </form>
    </div>
  )
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

const lblStyle = {
  display: 'flex', flexDirection: 'column', gap: 5,
  fontSize: 13, fontWeight: 600, color: 'var(--text2)',
}

const sectionTitle = {
  fontSize: 14, fontWeight: 700, marginBottom: 16,
  color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.04em',
}
