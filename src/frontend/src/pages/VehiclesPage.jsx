import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Truck, Search, Gauge, MapPin, Clock3 } from 'lucide-react'
import { api } from '../services/api'

const EMPTY = {
  plate: '',
  brand: '',
  model: '',
  year: '',
  color: '',
  status: 'active',
  odometer_km: '',
}

const FIELDS = [
  { name: 'plate', label: 'Patente', placeholder: 'ABC123', required: true },
  { name: 'brand', label: 'Marca', placeholder: 'Toyota', required: true },
  { name: 'model', label: 'Modelo', placeholder: 'Hilux', required: true },
  { name: 'year', label: 'Año', placeholder: '2022' },
  { name: 'color', label: 'Color', placeholder: 'Blanco' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Activo' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'inactive', label: 'Inactivo' },
]

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((item) => [item.value, item.label]))

function normalizeVehicleForm(form) {
  return {
    plate: form.plate.trim(),
    brand: form.brand.trim(),
    model: form.model.trim(),
    year: form.year?.trim() || null,
    color: form.color?.trim() || null,
    status: form.status || 'active',
    odometer_km: form.odometer_km === '' ? null : Number(form.odometer_km),
  }
}

export default function VehiclesPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [locationTarget, setLocationTarget] = useState(null)

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: api.getVehicles,
  })

  const vehicleLocation = useQuery({
    queryKey: ['vehicle-location', locationTarget?.id],
    enabled: Boolean(locationTarget?.id),
    retry: false,
    queryFn: async () => {
      try {
        return await api.getVehicleLocation(locationTarget.id)
      } catch (error) {
        if (error.message?.includes('Sin ubicación registrada')) return null
        throw error
      }
    },
  })

  const save = useMutation({
    mutationFn: (data) => editing ? api.updateVehicle(editing.id, data) : api.createVehicle(data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['vehicles'] })
      reset()
    },
  })

  const remove = useMutation({
    mutationFn: api.deleteVehicle,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  })

  function reset() {
    setForm(EMPTY)
    setEditing(null)
    setShowForm(false)
  }

  function edit(vehicle) {
    setForm({
      plate: vehicle.plate || '',
      brand: vehicle.brand || '',
      model: vehicle.model || '',
      year: vehicle.year ? String(vehicle.year) : '',
      color: vehicle.color || '',
      status: vehicle.status || 'active',
      odometer_km: vehicle.odometer_km != null ? String(vehicle.odometer_km) : '',
    })
    setEditing(vehicle)
    setShowForm(true)
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  function toggleLocation(vehicle) {
    setLocationTarget((current) => current?.id === vehicle.id ? null : vehicle)
  }

  const filtered = vehicles.filter((vehicle) =>
    [
      vehicle.plate,
      vehicle.brand,
      vehicle.model,
      vehicle.color,
      STATUS_LABELS[vehicle.status] || vehicle.status,
    ].some((value) => value?.toLowerCase().includes(search.toLowerCase()))
  )

  const activeCount = vehicles.filter((vehicle) => vehicle.status === 'active').length
  const maintenanceCount = vehicles.filter((vehicle) => vehicle.status === 'maintenance').length
  const inactiveCount = vehicles.filter((vehicle) => vehicle.status === 'inactive').length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Vehículos</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
            Panel operativo inicial para altas, estado y kilometraje de la flota.
          </p>
        </div>
        <button
          data-testid="vehicles-new-button"
          className="btn-primary"
          onClick={() => { reset(); setShowForm(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Nuevo vehículo
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Vehículos registrados</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{vehicles.length}</div>
        </div>
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Activos</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#059669', marginTop: 6 }}>{activeCount}</div>
        </div>
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>En mantenimiento</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#d97706', marginTop: 6 }}>{maintenanceCount}</div>
        </div>
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Inactivos</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--muted)', marginTop: 6 }}>{inactiveCount}</div>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ padding: 22, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>
            {editing ? 'Editar vehículo' : 'Nuevo vehículo'}
          </h3>
          <form data-testid="vehicles-form" onSubmit={(event) => { event.preventDefault(); save.mutate(normalizeVehicleForm(form)) }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
              {FIELDS.map(({ name, label, placeholder, required }) => (
                <div key={name}>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
                  </label>
                  <input
                    data-testid={`vehicles-field-${name}`}
                    name={name}
                    value={form[name] || ''}
                    onChange={handleChange}
                    placeholder={placeholder}
                    required={required}
                  />
                </div>
              ))}

              <div>
                <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Estado operativo
                </label>
                <select
                  data-testid="vehicles-field-status"
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Odómetro actual (km)
                </label>
                <input
                  data-testid="vehicles-field-odometer"
                  name="odometer_km"
                  type="number"
                  min="0"
                  step="1"
                  value={form.odometer_km}
                  onChange={handleChange}
                  placeholder="12500"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button data-testid="vehicles-submit" type="submit" className="btn-primary" disabled={save.isPending}>
                {save.isPending ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear vehículo'}
              </button>
              <button type="button" className="btn-secondary" onClick={reset}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 14, maxWidth: 360 }}>
        <Search size={14} color="var(--muted2)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          data-testid="vehicles-search-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por patente, marca, modelo o estado..."
          style={{ paddingLeft: 34 }}
        />
      </div>

      {locationTarget && (
        <div className="card" data-testid={`vehicles-last-location-panel-${locationTarget.id}`} style={{ padding: '18px 20px', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Última ubicación consultada</div>
              <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>
                {locationTarget.plate} · {locationTarget.brand} {locationTarget.model}
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setLocationTarget(null)}>
              Cerrar
            </button>
          </div>

          {vehicleLocation.isLoading && (
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Consultando última señal...</p>
          )}

          {vehicleLocation.isError && (
            <div data-testid="vehicles-last-location-error" style={{ padding: '12px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>
              No se pudo consultar la ubicación de este vehículo.
            </div>
          )}

          {!vehicleLocation.isLoading && vehicleLocation.isFetched && !vehicleLocation.data && !vehicleLocation.isError && (
            <div data-testid={`vehicles-last-location-empty-${locationTarget.id}`} style={{ padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13 }}>
              Todavía no hay ubicación registrada para este vehículo.
            </div>
          )}

          {vehicleLocation.data && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Coordenadas</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                  {Number(vehicleLocation.data.lat).toFixed(5)}, {Number(vehicleLocation.data.lng).toFixed(5)}
                </div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Velocidad</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                  {vehicleLocation.data.speed_kmh != null ? `${vehicleLocation.data.speed_kmh} km/h` : 'Sin dato'}
                </div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Rumbo</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                  {vehicleLocation.data.heading != null ? `${vehicleLocation.data.heading}°` : 'Sin dato'}
                </div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 4 }}>Timestamp</div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                  {vehicleLocation.data.timestamp ? new Date(vehicleLocation.data.timestamp).toLocaleString('es-AR') : 'Sin dato'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        {isLoading ? (
          <p style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Cargando...</p>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <Truck size={32} color="var(--muted2)" style={{ marginBottom: 10 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              {search ? 'Sin resultados para tu búsqueda' : 'Todavía no hay vehículos registrados'}
            </p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Patente</th>
                <th>Vehículo</th>
                <th>Año</th>
                <th>Odómetro</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((vehicle) => (
                <tr key={vehicle.id} data-testid={`vehicles-row-${vehicle.id}`}>
                  <td>
                    <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', fontSize: 13 }}>
                      {vehicle.plate}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, color: 'var(--text)' }}>{vehicle.brand} {vehicle.model}</div>
                    {vehicle.color && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{vehicle.color}</div>}
                  </td>
                  <td>{vehicle.year || '—'}</td>
                  <td>
                    {vehicle.odometer_km > 0
                      ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Gauge size={14} color="var(--muted)" />
                          <span>{Number(vehicle.odometer_km).toLocaleString('es-AR')} km</span>
                        </div>
                      )
                      : '—'}
                  </td>
                  <td><span className={`badge ${vehicle.status || 'inactive'}`}>{STATUS_LABELS[vehicle.status] || vehicle.status || 'Sin estado'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        data-testid={`vehicles-last-location-button-${vehicle.id}`}
                        onClick={() => toggleLocation(vehicle)}
                        className="btn-secondary"
                        style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                      >
                        {locationTarget?.id === vehicle.id ? <Clock3 size={12} /> : <MapPin size={12} />} Ubicación
                      </button>
                      <button
                        data-testid={`vehicles-edit-${vehicle.id}`}
                        onClick={() => edit(vehicle)}
                        className="btn-secondary"
                        style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      <button
                        data-testid={`vehicles-delete-${vehicle.id}`}
                        onClick={() => window.confirm(`¿Eliminar ${vehicle.plate}?`) && remove.mutate(vehicle.id)}
                        className="btn-danger"
                        style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                        disabled={remove.isPending}
                      >
                        <Trash2 size={12} /> Eliminar
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
