import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Package, Plus, Trash2, Lock, Unlock, MapPin,
  AlertTriangle, CheckCircle, XCircle, Eye, EyeOff,
  ShoppingBag,
} from 'lucide-react'
import { api, getLocationId } from '../services/api'

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_META = {
  PENDING: { label: 'Pendiente', bg: '#fef3c7', color: '#d97706', Icon: AlertTriangle },
  IN_TRANSIT: { label: 'En camino', bg: 'var(--accent-l)', color: 'var(--accent)', Icon: MapPin },
  DELIVERED: { label: 'Entregado', bg: 'var(--success-l)', color: '#059669', Icon: CheckCircle },
  FAILED: { label: 'Fallido', bg: '#fee2e2', color: '#dc2626', Icon: XCircle },
}

const ACCES_META = {
  OK: { label: 'OK', bg: 'var(--success-l)', color: '#059669', Icon: CheckCircle },
  COUNT_MISMATCH: { label: 'Dif. conteo', bg: '#fef3c7', color: '#d97706', Icon: AlertTriangle },
  WRONG_CODE: { label: 'Cód. incorrecto', bg: '#fee2e2', color: '#dc2626', Icon: XCircle },
  BLOCKED: { label: 'Bloqueado', bg: '#fee2e2', color: '#dc2626', Icon: Lock },
}

const TABS = ['Lotes', 'Pedidos', 'Bloqueos', 'Historial']

const LOCATION_TYPE_LABELS = {
  store: 'Sucursal',
  branch: 'Punto de Despacho',
  warehouse: 'Depósito',
  logistics: 'Logística',
  office: 'Oficina / admin',
  pickup: 'Punto de retiro',
  other: 'Otro',
}

export default function BultosPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('Lotes')

  const { data: bultos = [], isLoading: loadBultos } = useQuery({ queryKey: ['bultos'], queryFn: api.getBultos })
  const { data: orders = [], isLoading: loadOrders } = useQuery({ queryKey: ['orders'], queryFn: () => api.getOrders() })
  const { data: locations = [] } = useQuery({ queryKey: ['locations'], queryFn: api.getLocations })
  const { data: blocked = [], isLoading: loadBlocked } = useQuery({ queryKey: ['bultos-blocked'], queryFn: api.getBlockedRiders, refetchInterval: 15_000 })
  const { data: accesos = [], isLoading: loadAccesos } = useQuery({ queryKey: ['accesos-lote'], queryFn: api.getAccesosLog })

  const createBultoMut = useMutation({
    mutationFn: api.createBulto,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bultos'] })
      setShowBultoForm(false)
      resetBultoForm()
    },
  })
  const deleteBultoMut = useMutation({
    mutationFn: api.deleteBulto,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bultos'] }),
  })
  const createOrderMut = useMutation({
    mutationFn: api.createOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] })
      setShowOrderForm(false)
      resetOrderForm()
    },
  })
  const deleteOrderMut = useMutation({
    mutationFn: api.deleteOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  })

  const [showBultoForm, setShowBultoForm] = useState(false)
  const [bultoForm, setBultoForm] = useState({ codigo_lote: '', cantidad_esperada: '', clave_desbloqueo: '', descripcion: '' })
  function resetBultoForm() { setBultoForm({ codigo_lote: '', cantidad_esperada: '', clave_desbloqueo: '', descripcion: '' }) }

  const [showOrderForm, setShowOrderForm] = useState(false)
  const [orderForm, setOrderForm] = useState({
    bulto_id: '',
    location_id: '',
    customer_name: '',
    customer_phone: '',
    delivery_address: '',
    delivery_lat: '',
    delivery_lng: '',
    notes: '',
    payment_amount: '',
  })
  function resetOrderForm() {
    setOrderForm({
      bulto_id: '',
      location_id: '',
      customer_name: '',
      customer_phone: '',
      delivery_address: '',
      delivery_lat: '',
      delivery_lng: '',
      notes: '',
      payment_amount: '',
    })
  }

  const [revealedKeys, setRevealedKeys] = useState({})
  function toggleReveal(id) { setRevealedKeys((p) => ({ ...p, [id]: !p[id] })) }

  const activeLocations = locations.filter((location) => location.is_active !== false)
  const riderVisibleLocations = activeLocations.filter((location) => location.rider_visible !== false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Control de Lotes</h1>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
              Gestioná lotes, pedidos y bloqueos de repartidores. Las ubicaciones se administran desde{' '}
              <Link to="/locations" style={{ color: 'var(--accent)', fontWeight: 600 }}>
                Ubicaciones
              </Link>.
            </p>
          </div>
          {tab === 'Lotes' && <button className="btn-primary" onClick={() => setShowBultoForm((v) => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><Plus size={14} /> Nuevo lote</button>}
          {tab === 'Pedidos' && <button data-testid="bultos-new-order-button" className="btn-primary" onClick={() => setShowOrderForm((v) => !v)} disabled={activeLocations.length === 0} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><Plus size={14} /> Nuevo pedido</button>}
        </div>

        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          {TABS.map((t) => (
            <button
              key={t}
              data-testid={t === 'Pedidos' ? 'bultos-tab-pedidos' : undefined}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? 'var(--accent)' : 'var(--muted)',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                background: 'transparent',
                marginBottom: -1,
                transition: 'all .12s',
              }}
            >
              {t}
              {t === 'Bloqueos' && blocked.length > 0 && (
                <span style={{ marginLeft: 5, background: '#dc2626', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700 }}>
                  {blocked.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'Lotes' && (
        <>
          {showBultoForm && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Nuevo lote</h3>
              <form onSubmit={(e) => { e.preventDefault(); createBultoMut.mutate(bultoForm) }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {[
                  ['Código de lote *', 'codigo_lote', 'text', 'LOTE-001'],
                  ['Cantidad esperada *', 'cantidad_esperada', 'number', '24'],
                  ['Clave desbloqueo *', 'clave_desbloqueo', 'text', 'Clave supervisor'],
                  ['Descripción', 'descripcion', 'text', 'Ej: Zona norte'],
                ].map(([label, key, type, ph]) => (
                  <label key={key} style={lblStyle}>
                    {label}
                    <input
                      className="input"
                      type={type}
                      placeholder={ph}
                      required={label.includes('*')}
                      value={bultoForm[key]}
                      onChange={(e) => setBultoForm({ ...bultoForm, [key]: type === 'text' && key === 'codigo_lote' ? e.target.value.toUpperCase() : e.target.value })}
                    />
                  </label>
                ))}
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowBultoForm(false)}>Cancelar</button>
                  <button type="submit" className="btn-primary" disabled={createBultoMut.isPending}>{createBultoMut.isPending ? 'Guardando…' : 'Crear lote'}</button>
                </div>
              </form>
            </div>
          )}
          <TableCard title="Lotes registrados" count={bultos.length} loading={loadBultos} Icon={Package}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg)' }}>{['Código', 'Cantidad', 'Clave desbloqueo', 'Descripción', 'Creado', ''].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>
                {bultos.map((b) => (
                  <tr key={b.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={tdS}><code style={{ fontWeight: 700 }}>{b.codigo_lote}</code></td>
                    <td style={{ ...tdS, textAlign: 'center' }}>{b.cantidad_esperada}</td>
                    <td style={tdS}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, letterSpacing: revealedKeys[b.id] ? 0 : 2 }}>
                          {revealedKeys[b.id] ? b.clave_desbloqueo : '••••••'}
                        </span>
                        <button onClick={() => toggleReveal(b.id)} style={iconBtn} title={revealedKeys[b.id] ? 'Ocultar' : 'Revelar'}>
                          {revealedKeys[b.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                        </button>
                      </div>
                    </td>
                    <td style={{ ...tdS, color: 'var(--muted)', fontSize: 12 }}>{b.descripcion || '—'}</td>
                    <td style={{ ...tdS, fontSize: 12, color: 'var(--muted)' }}>{fmt(b.created_at)}</td>
                    <td style={tdS}><button onClick={() => { if (confirm(`¿Eliminar ${b.codigo_lote}?`)) deleteBultoMut.mutate(b.id) }} style={iconBtn}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {tab === 'Pedidos' && (
        <>
          <div className="card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Ubicaciones canónicas para pedidos</div>
                <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                  Cada pedido sale desde un <strong>Punto de Despacho</strong> definido en <Link to="/locations" style={{ color: 'var(--accent)', fontWeight: 600 }}>Ubicaciones</Link>. En este panel solo elegís una sucursal activa para operar.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="badge active">{activeLocations.length} activas</span>
                <span className="badge">{riderVisibleLocations.length} puntos visibles para riders</span>
              </div>
            </div>
            {activeLocations.length === 0 && (
              <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 10, border: '1px solid #fcd34d', background: '#fffbeb' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#b45309', marginBottom: 4 }}>No hay ubicaciones activas para originar pedidos</div>
                <p style={{ fontSize: 12.5, color: '#92400e', marginBottom: 10 }}>
                  Antes de crear pedidos, activá o cargá un Punto de Despacho en la superficie canónica de <Link to="/locations" style={{ color: '#b45309', fontWeight: 700 }}>Ubicaciones</Link>.
                </p>
                <Link to="/locations" className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <MapPin size={14} />
                  Ir a Ubicaciones
                </Link>
              </div>
            )}
          </div>

          {showOrderForm && (
            <div className="card" style={{ padding: '20px 24px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Nuevo pedido</h3>
              <form data-testid="bultos-order-form" onSubmit={(e) => { e.preventDefault(); createOrderMut.mutate(orderForm) }} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <label style={lblStyle}>
                  Lote asociado
                  <select data-testid="bultos-order-bulto-select" className="input" value={orderForm.bulto_id} onChange={(e) => setOrderForm({ ...orderForm, bulto_id: e.target.value })}>
                    <option value="">Sin lote</option>
                    {bultos.map((b) => <option key={b.id} value={b.id}>{b.codigo_lote}</option>)}
                  </select>
                </label>
                <label style={lblStyle}>
                  Sucursal / Punto de Despacho *
                  <select
                    data-testid="bultos-order-location-select"
                    className="input"
                    value={orderForm.location_id}
                    onChange={(e) => setOrderForm({ ...orderForm, location_id: e.target.value })}
                    required
                    disabled={activeLocations.length === 0}
                  >
                    <option value="">Sin Punto de Despacho</option>
                    {activeLocations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name} · {LOCATION_TYPE_LABELS[location.location_type] || 'Otro'}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                    Las altas, bajas y cambios de estado se hacen desde <Link to="/locations" style={{ color: 'var(--accent)', fontWeight: 600 }}>Ubicaciones</Link>.
                  </span>
                </label>
                {[
                  ['Nombre del cliente *', 'customer_name', 'text', 'Juan Pérez'],
                  ['Teléfono', 'customer_phone', 'text', '+54 9 299 000-0000'],
                  ['Dirección de entrega *', 'delivery_address', 'text', 'Av. Argentina 1234'],
                  ['Monto a cobrar ($)', 'payment_amount', 'number', '0'],
                  ['Notas', 'notes', 'text', 'Dejar en recepción'],
                  ['Latitud', 'delivery_lat', 'number', '-38.9516'],
                  ['Longitud', 'delivery_lng', 'number', '-68.0591'],
                ].map(([label, key, type, ph]) => (
                  <label key={key} style={lblStyle}>
                    {label}
                    <input
                      data-testid={`bultos-order-${key}`}
                      className="input"
                      type={type}
                      placeholder={ph}
                      required={label.includes('*')}
                      value={orderForm[key]}
                      onChange={(e) => setOrderForm({ ...orderForm, [key]: e.target.value })}
                      step={type === 'number' ? 'any' : undefined}
                    />
                  </label>
                ))}
                <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowOrderForm(false)}>Cancelar</button>
                  <button data-testid="bultos-order-submit" type="submit" className="btn-primary" disabled={createOrderMut.isPending || activeLocations.length === 0}>{createOrderMut.isPending ? 'Guardando…' : 'Crear pedido'}</button>
                </div>
              </form>
            </div>
          )}
          <TableCard title="Pedidos" count={orders.length} loading={loadOrders} Icon={ShoppingBag}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: 'var(--bg)' }}>{['Lote', 'Origen', 'Cliente / Dirección', 'Monto', 'Auditoría de fotos', 'Estado', 'Fecha', ''].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
              <tbody>
                {orders.map((o) => {
                  const meta = STATUS_META[o.status] || STATUS_META.PENDING
                  const { Icon } = meta
                  const lote = bultos.find((b) => b.id === o.bulto_id)
                  const orderLocation = locations.find((location) => location.id === getLocationId(o))
                  const hasAudit = o.invoice_photo_url || o.pod_photo_url
                  return (
                    <tr key={o.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={tdS}><code style={{ fontSize: 12 }}>{lote?.codigo_lote || '—'}</code></td>
                      <td style={tdS}>
                        {orderLocation ? (
                          <>
                            <div style={{ fontWeight: 600, fontSize: 12.5 }}>{orderLocation.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                              {LOCATION_TYPE_LABELS[orderLocation.location_type] || 'Otro'}
                            </div>
                          </>
                        ) : (
                          <span style={{ color: 'var(--muted2)', fontSize: 12 }}>Sin Punto de Despacho</span>
                        )}
                      </td>
                      <td style={tdS}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{o.customer_name}</div>
                        {o.customer_phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{o.customer_phone}</div>}
                        <div style={{ fontSize: 11, color: 'var(--muted2)', marginTop: 2, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {o.delivery_address}
                        </div>
                      </td>
                      <td style={{ ...tdS, fontWeight: 600 }}>
                        {o.payment_amount > 0
                          ? <span style={{ color: '#059669' }}>${parseFloat(o.payment_amount).toLocaleString('es-AR')}</span>
                          : <span style={{ color: 'var(--muted2)', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={tdS}>
                        {hasAudit ? (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
                                Factura
                              </div>
                              {o.invoice_photo_url ? (
                                <a href={o.invoice_photo_url} target="_blank" rel="noreferrer" title="Ver factura completa">
                                  <img src={o.invoice_photo_url} alt="Factura" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 7, border: '2px solid #fcd34d', display: 'block' }} />
                                </a>
                              ) : (
                                <div style={{ width: 52, height: 52, borderRadius: 7, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 9, color: 'var(--muted2)' }}>—</span>
                                </div>
                              )}
                            </div>
                            <div style={{ paddingTop: 24, color: 'var(--muted2)', fontSize: 16 }}>→</div>
                            <div style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 }}>
                                Entrega
                              </div>
                              {o.pod_photo_url ? (
                                <a href={o.pod_photo_url} target="_blank" rel="noreferrer" title="Ver foto de entrega completa">
                                  <img src={o.pod_photo_url} alt="PoD" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 7, border: '2px solid #6ee7b7', display: 'block' }} />
                                </a>
                              ) : (
                                <div style={{ width: 52, height: 52, borderRadius: 7, border: '2px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 9, color: 'var(--muted2)' }}>{o.status === 'DELIVERED' ? '?' : '—'}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--muted2)' }}>Sin fotos</span>
                        )}
                      </td>
                      <td style={tdS}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: meta.bg, color: meta.color, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                          <Icon size={10} />{meta.label}
                        </span>
                      </td>
                      <td style={{ ...tdS, fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmt(o.created_at)}</td>
                      <td style={tdS}><button onClick={() => { if (confirm('¿Eliminar este pedido?')) deleteOrderMut.mutate(o.id) }} style={iconBtn}><Trash2 size={13} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {tab === 'Bloqueos' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {loadBlocked ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando…</p>
          ) : blocked.length === 0 ? (
            <div className="card" style={{ padding: 24, display: 'flex', alignItems: 'center', gap: 10, gridColumn: '1/-1' }}>
              <Unlock size={18} color="#059669" />
              <p style={{ color: '#059669', fontWeight: 600, fontSize: 14 }}>Sin bloqueos activos</p>
            </div>
          ) : blocked.map((r) => (
            <div key={r.id} style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Lock size={15} color="#dc2626" />
                <span style={{ fontWeight: 700, fontSize: 14, color: '#991b1b' }}>{r.full_name}</span>
              </div>
              <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>
                Último lote: <code style={{ fontWeight: 700 }}>{r.ultimo_codigo_lote || '—'}</code>
              </div>
              {r.clave_desbloqueo && (
                <div style={{ background: '#fff', borderRadius: 8, border: '1px dashed #f87171', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>Clave supervisor</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: '#dc2626', letterSpacing: 3 }}>
                    {r.clave_desbloqueo}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'Historial' && (
        <TableCard title="Historial de accesos" count={accesos.length} loading={loadAccesos} Icon={AlertTriangle} subtitle="Últimos 200 registros">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--bg)' }}>{['Repartidor', 'Lote', 'Esperado', 'Ingresado', 'Resultado', 'Fecha'].map((h) => <th key={h} style={thS}>{h}</th>)}</tr></thead>
            <tbody>
              {accesos.map((a) => {
                const resultKey = a.bloqueado_por_codigo ? 'WRONG_CODE' : a.tiene_diferencia ? 'COUNT_MISMATCH' : 'OK'
                const meta = ACCES_META[resultKey]
                const { Icon } = meta
                return (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={tdS}>{a.profiles?.full_name || '—'}</td>
                    <td style={tdS}><code style={{ fontSize: 12, fontWeight: 600 }}>{a.codigo_lote}</code></td>
                    <td style={{ ...tdS, textAlign: 'center' }}>{a.conteo_esperado || '—'}</td>
                    <td style={{ ...tdS, textAlign: 'center' }}>{a.conteo_ingresado}</td>
                    <td style={tdS}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: meta.bg, color: meta.color, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
                        <Icon size={10} />{meta.label}
                      </span>
                    </td>
                    <td style={{ ...tdS, color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(a.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableCard>
      )}
    </div>
  )
}

function TableCard({ title, count, loading, Icon, subtitle, children }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon size={14} color="var(--accent)" />
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{title}</span>
        <span style={{ marginLeft: 4, background: 'var(--accent-l)', color: 'var(--accent)', borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{count}</span>
        {subtitle && <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--muted)' }}>{subtitle}</span>}
      </div>
      {loading ? (
        <p style={{ padding: 20, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>Cargando…</p>
      ) : count === 0 ? (
        <p style={{ padding: 20, color: 'var(--muted)', fontSize: 13, textAlign: 'center' }}>Sin registros.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>{children}</div>
      )}
    </div>
  )
}

const lblStyle = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: 'var(--text2)' }
const thS = { padding: '9px 14px', fontSize: 11, fontWeight: 600, color: 'var(--muted)', textAlign: 'left', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '.04em' }
const tdS = { padding: '11px 14px', fontSize: 13, color: 'var(--text)', verticalAlign: 'middle' }
const iconBtn = { padding: 6, background: 'transparent', color: 'var(--muted)', borderRadius: 6, cursor: 'pointer' }
