import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, MapPin, Pencil, Plus, Radio, Search, Trash2, Warehouse } from 'lucide-react'
import { api } from '../services/api'

const EMPTY_LOCATION = {
  name: '',
  location_type: 'store',
  address: '',
  lat: '',
  lng: '',
  is_active: true,
  rider_visible: true,
  is_temporary: false,
}

const LOCATION_TYPE_OPTIONS = [
  { value: 'store', label: 'Sucursal' },
  { value: 'branch', label: 'Ubicación operativa' },
  { value: 'warehouse', label: 'Depósito' },
  { value: 'logistics', label: 'Logística' },
  { value: 'office', label: 'Oficina / admin' },
  { value: 'pickup', label: 'Punto de retiro' },
  { value: 'other', label: 'Otro' },
]

const LOCATION_TYPE_LABELS = Object.fromEntries(LOCATION_TYPE_OPTIONS.map((option) => [option.value, option.label]))

function buildForm(location) {
  if (!location) return EMPTY_LOCATION

  return {
    name: location.name || '',
    location_type: location.location_type || 'store',
    address: location.address || '',
    lat: location.lat ?? '',
    lng: location.lng ?? '',
    is_active: location.is_active ?? true,
    rider_visible: location.rider_visible ?? true,
    is_temporary: location.is_temporary ?? false,
  }
}

function StatCard({ label, value, Icon, color, background }) {
  return (
    <div className="card" style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background,
          color,
          flexShrink: 0,
        }}
      >
        <Icon size={18} />
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1, color: 'var(--text)' }}>{value}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  )
}

export default function LocationsPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_LOCATION)

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: api.getLocations,
  })

  const saveLocation = useMutation({
    mutationFn: (payload) =>
      editing ? api.updateLocation(editing.id, payload) : api.createLocation(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] })
      setShowForm(false)
      setEditing(null)
      setForm(EMPTY_LOCATION)
    },
  })

  const deleteLocation = useMutation({
    mutationFn: api.deleteLocation,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations'] }),
  })

  const summary = useMemo(() => {
    return locations.reduce(
      (acc, location) => {
        acc.total += 1
        if (location.is_active) acc.active += 1
        if (location.rider_visible) acc.riderVisible += 1
        if (location.is_temporary) acc.temporary += 1
        return acc
      },
      { total: 0, active: 0, riderVisible: 0, temporary: 0 }
    )
  }, [locations])

  const filteredLocations = useMemo(() => {
    const term = search.trim().toLowerCase()

    return locations.filter((location) => {
      const matchesSearch =
        !term ||
        location.name?.toLowerCase().includes(term) ||
        location.address?.toLowerCase().includes(term)

      const matchesType = typeFilter === 'all' || location.location_type === typeFilter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && location.is_active) ||
        (statusFilter === 'inactive' && !location.is_active)

      return matchesSearch && matchesType && matchesStatus
    })
  }, [locations, search, typeFilter, statusFilter])

  function resetForm() {
    setEditing(null)
    setForm(EMPTY_LOCATION)
    setShowForm(false)
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_LOCATION)
    setShowForm(true)
  }

  function openEdit(location) {
    setEditing(location)
    setForm(buildForm(location))
    setShowForm(true)
  }

  function submitLocation(event) {
    event.preventDefault()
    saveLocation.mutate({
      ...form,
      lat: form.lat === '' ? null : Number(form.lat),
      lng: form.lng === '' ? null : Number(form.lng),
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Ubicaciones</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            Superficie canonica para administrar ubicaciones operativas de la empresa.
          </p>
        </div>
        <button className="btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} strokeWidth={2.5} />
          Nueva ubicación
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 20 }}>
        <StatCard label="Ubicaciones totales" value={summary.total} Icon={Building2} color="#0f766e" background="#ccfbf1" />
        <StatCard label="Activas" value={summary.active} Icon={MapPin} color="#0284c7" background="#e0f2fe" />
        <StatCard label="Visibles para riders" value={summary.riderVisible} Icon={Radio} color="#7c3aed" background="#ede9fe" />
        <StatCard label="Temporales" value={summary.temporary} Icon={Warehouse} color="#d97706" background="#fef3c7" />
      </div>

      {showForm && (
        <div className="card" style={{ padding: 22, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>
            {editing ? 'Editar ubicación' : 'Nueva ubicación'}
          </h3>
          <form onSubmit={submitLocation}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
              <label style={labelStyle}>
                Nombre *
                <input
                  name="name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Ubicación Norte"
                  required
                />
              </label>
              <label style={labelStyle}>
                Tipo *
                <select
                  name="location_type"
                  value={form.location_type}
                  onChange={(event) => setForm((current) => ({ ...current, location_type: event.target.value }))}
                >
                  {LOCATION_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
                Dirección
                <input
                  name="address"
                  value={form.address}
                  onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                  placeholder="Av. Principal 123"
                />
              </label>
              <label style={labelStyle}>
                Latitud
                <input
                  name="lat"
                  type="number"
                  step="any"
                  value={form.lat}
                  onChange={(event) => setForm((current) => ({ ...current, lat: event.target.value }))}
                  placeholder="-38.9516"
                />
              </label>
              <label style={labelStyle}>
                Longitud
                <input
                  name="lng"
                  type="number"
                  step="any"
                  value={form.lng}
                  onChange={(event) => setForm((current) => ({ ...current, lng: event.target.value }))}
                  placeholder="-68.0591"
                />
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 18 }}>
              <label style={checkboxCardStyle}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                />
                <div>
                  <div style={checkboxTitleStyle}>Activa</div>
                  <div style={checkboxTextStyle}>Disponible para operar desde paneles y flujo diario.</div>
                </div>
              </label>
              <label style={checkboxCardStyle}>
                <input
                  type="checkbox"
                  checked={form.rider_visible}
                  onChange={(event) => setForm((current) => ({ ...current, rider_visible: event.target.checked }))}
                />
                <div>
                  <div style={checkboxTitleStyle}>Visible para riders</div>
                  <div style={checkboxTextStyle}>Se podrá exponer en contextos operativos del rider.</div>
                </div>
              </label>
              <label style={checkboxCardStyle}>
                <input
                  type="checkbox"
                  checked={form.is_temporary}
                  onChange={(event) => setForm((current) => ({ ...current, is_temporary: event.target.checked }))}
                />
                <div>
                  <div style={checkboxTitleStyle}>Temporal</div>
                  <div style={checkboxTextStyle}>Ubicación transitoria para campañas, eventos o retiros puntuales.</div>
                </div>
              </label>
            </div>

            {saveLocation.error && (
              <p style={{ color: 'var(--danger)', fontSize: 12.5, marginBottom: 12 }}>
                {saveLocation.error.message}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn-primary" disabled={saveLocation.isPending}>
                {saveLocation.isPending ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear ubicación'}
              </button>
              <button type="button" className="btn-secondary" onClick={resetForm}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) 180px 180px', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} color="var(--muted2)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o dirección"
            style={{ paddingLeft: 34 }}
          />
        </div>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="all">Todos los tipos</option>
          {LOCATION_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">Todos los estados</option>
          <option value="active">Activas</option>
          <option value="inactive">Inactivas</option>
        </select>
      </div>

      <div className="card">
        {isLoading ? (
          <p style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Cargando ubicaciones...</p>
        ) : filteredLocations.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <MapPin size={32} color="var(--muted2)" style={{ marginBottom: 10 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              {locations.length === 0 ? 'Todavía no hay ubicaciones operativas registradas' : 'No hay ubicaciones que coincidan con los filtros actuales'}
            </p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ubicación</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Riders</th>
                <th>Coordenadas</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredLocations.map((location) => (
                <tr key={location.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>{location.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{location.address || 'Sin dirección cargada'}</div>
                  </td>
                  <td>{LOCATION_TYPE_LABELS[location.location_type] || 'Otro'}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <span className={`badge ${location.is_active ? 'active' : 'inactive'}`}>
                        {location.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                      {location.is_temporary && <span className="badge suspended">Temporal</span>}
                    </div>
                  </td>
                  <td>
                    <span style={{ color: location.rider_visible ? 'var(--success)' : 'var(--muted2)', fontWeight: 600 }}>
                      {location.rider_visible ? 'Visible' : 'Oculta'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12.5, color: 'var(--muted2)' }}>
                    {location.lat && location.lng
                      ? `${Number(location.lat).toFixed(4)}, ${Number(location.lng).toFixed(4)}`
                      : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => openEdit(location)}
                        className="btn-secondary"
                        style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                      >
                        <Pencil size={12} />
                        Editar
                      </button>
                      <button
                        onClick={() => window.confirm(`¿Eliminar ${location.name}?`) && deleteLocation.mutate(location.id)}
                        className="btn-danger"
                        style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                      >
                        <Trash2 size={12} />
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  fontSize: 12.5,
  fontWeight: 500,
  color: 'var(--text2)',
}

const checkboxCardStyle = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  fontSize: 12.5,
  color: 'var(--text2)',
}

const checkboxTitleStyle = {
  fontWeight: 700,
  color: 'var(--text)',
  marginBottom: 3,
}

const checkboxTextStyle = {
  fontSize: 11.5,
  color: 'var(--muted)',
  lineHeight: 1.4,
}
