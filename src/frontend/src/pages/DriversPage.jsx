import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, AlertTriangle, CheckCircle, Pencil, Trash2, Search, CarFront } from 'lucide-react'
import { api } from '../services/api'
import { useAuthStore } from '../store/authStore'

const EMPTY_FORM = {
  profile_id: '',
  license_number: '',
  license_expiry: '',
  assigned_vehicle_id: '',
}

function normalizeDriverForm(form) {
  return {
    profile_id: form.profile_id,
    license_number: form.license_number.trim(),
    license_expiry: form.license_expiry,
    assigned_vehicle_id: form.assigned_vehicle_id || null,
  }
}

export default function DriversPage() {
  const qc = useQueryClient()
  const profile = useAuthStore((state) => state.profile)
  const companyId = profile?.company_id

  const [form, setForm] = useState(EMPTY_FORM)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: api.getDrivers,
  })

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn: api.getVehicles,
  })

  const { data: companyProfiles = [] } = useQuery({
    queryKey: ['company-profiles', companyId],
    queryFn: () => api.getCompanyProfiles(companyId),
    enabled: Boolean(companyId),
  })

  const save = useMutation({
    mutationFn: (payload) => (
      editing
        ? api.updateDriver(editing.id, payload)
        : api.createDriver(payload)
    ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['drivers'] })
      reset()
    },
  })

  const remove = useMutation({
    mutationFn: api.deleteDriver,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  })

  function reset() {
    setForm(EMPTY_FORM)
    setEditing(null)
    setShowForm(false)
  }

  function editDriver(driver) {
    setEditing(driver)
    setForm({
      profile_id: driver.profile_id || '',
      license_number: driver.license_number || '',
      license_expiry: driver.license_expiry ? String(driver.license_expiry).slice(0, 10) : '',
      assigned_vehicle_id: driver.assigned_vehicle_id || '',
    })
    setShowForm(true)
  }

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const today = new Date()
  const expiringSoon = drivers.filter((driver) => {
    const days = (new Date(driver.license_expiry) - today) / (1000 * 60 * 60 * 24)
    return days >= 0 && days <= 30
  }).length

  const unassignedDrivers = drivers.filter((driver) => !driver.assigned_vehicle_id).length

  const driverProfileIds = new Set(drivers.map((driver) => driver.profile_id))
  const assignableProfiles = companyProfiles.filter((item) => (
    item.state === 'active' &&
    (!driverProfileIds.has(item.id) || item.id === editing?.profile_id)
  ))

  const availableVehicles = vehicles.filter((vehicle) => (
    !drivers.some((driver) => driver.assigned_vehicle_id === vehicle.id && driver.id !== editing?.id)
  ))

  const filteredDrivers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return drivers

    return drivers.filter((driver) => {
      const fields = [
        driver.profiles?.full_name,
        driver.profiles?.phone,
        driver.license_number,
        driver.vehicles?.plate,
        driver.vehicles?.brand,
        driver.vehicles?.model,
      ]

      return fields.some((value) => value?.toLowerCase().includes(term))
    })
  }, [drivers, search])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Conductores</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
            Panel operativo inicial para altas, asignaciones y vencimientos de licencias.
          </p>
        </div>
        <button
          data-testid="drivers-new-button"
          className="btn-primary"
          onClick={() => { reset(); setShowForm(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={15} strokeWidth={2.5} /> Nuevo conductor
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Conductores registrados</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', marginTop: 6 }}>{drivers.length}</div>
        </div>
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Licencias por vencer</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: expiringSoon > 0 ? '#b45309' : 'var(--text)', marginTop: 6 }}>{expiringSoon}</div>
        </div>
        <div className="card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Sin vehículo asignado</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: unassignedDrivers > 0 ? 'var(--danger)' : 'var(--text)', marginTop: 6 }}>{unassignedDrivers}</div>
        </div>
      </div>

      {expiringSoon > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--warn-l)', border: '1px solid #fde68a',
          borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 13,
          color: '#92400e',
        }}>
          <AlertTriangle size={16} color="#d97706" />
          <strong>{expiringSoon}</strong> conductor{expiringSoon !== 1 ? 'es tienen' : ' tiene'} la licencia por vencer en los próximos 30 días
        </div>
      )}

      {showForm && (
        <div className="card" style={{ padding: 22, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>
            {editing ? 'Editar conductor' : 'Nuevo conductor'}
          </h3>
          <form data-testid="drivers-form" onSubmit={(event) => { event.preventDefault(); save.mutate(normalizeDriverForm(form)) }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Perfil asociado *
                </label>
                <select
                  data-testid="drivers-profile-select"
                  name="profile_id"
                  value={form.profile_id}
                  onChange={handleChange}
                  disabled={Boolean(editing)}
                  required
                >
                  <option value="">Seleccionar perfil</option>
                  {assignableProfiles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.full_name} · {item.role}
                    </option>
                  ))}
                </select>
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 5 }}>
                  Solo se muestran perfiles activos de la empresa que todavía no estén vinculados a otro conductor.
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Número de licencia *
                </label>
                <input
                  data-testid="drivers-license-input"
                  name="license_number"
                  value={form.license_number}
                  onChange={handleChange}
                  placeholder="LIC-123456"
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Vencimiento de licencia *
                </label>
                <input
                  data-testid="drivers-expiry-input"
                  name="license_expiry"
                  type="date"
                  value={form.license_expiry}
                  onChange={handleChange}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                  Vehículo asignado
                </label>
                <select
                  data-testid="drivers-vehicle-select"
                  name="assigned_vehicle_id"
                  value={form.assigned_vehicle_id}
                  onChange={handleChange}
                >
                  <option value="">Sin asignar</option>
                  {availableVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.plate} · {vehicle.brand} {vehicle.model}
                    </option>
                  ))}
                  {editing?.vehicles && !availableVehicles.some((vehicle) => vehicle.id === editing.assigned_vehicle_id) && (
                    <option value={editing.assigned_vehicle_id}>
                      {editing.vehicles.plate} · {editing.vehicles.brand} {editing.vehicles.model}
                    </option>
                  )}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button data-testid="drivers-submit" type="submit" className="btn-primary" disabled={save.isPending}>
                {save.isPending ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear conductor'}
              </button>
              <button type="button" className="btn-secondary" onClick={reset}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 14, maxWidth: 360 }}>
        <Search size={14} color="var(--muted2)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por conductor, licencia o vehículo..."
          style={{ paddingLeft: 34 }}
        />
      </div>

      <div className="card">
        {isLoading ? (
          <p style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Cargando...</p>
        ) : filteredDrivers.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <Users size={32} color="var(--muted2)" style={{ marginBottom: 10 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              {search ? 'Sin resultados para tu búsqueda' : 'Todavía no hay conductores registrados'}
            </p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Conductor</th>
                <th>Teléfono</th>
                <th>N° Licencia</th>
                <th>Vencimiento</th>
                <th>Vehículo asignado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.map((driver) => {
                const expiry = new Date(driver.license_expiry)
                const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
                const expired = daysLeft < 0
                const expiring = daysLeft >= 0 && daysLeft <= 30

                return (
                  <tr key={driver.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'var(--accent-l)', color: 'var(--accent)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, flexShrink: 0,
                        }}>
                          {(driver.profiles?.full_name || 'U').split(' ').map((word) => word[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                            {driver.profiles?.full_name || '—'}
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                            {driver.profile_id}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{driver.profiles?.phone || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{driver.license_number}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {expired
                          ? <AlertTriangle size={13} color="var(--danger)" />
                          : expiring
                            ? <AlertTriangle size={13} color="var(--warn)" />
                            : <CheckCircle size={13} color="var(--success)" />
                        }
                        <span style={{ color: expired ? 'var(--danger)' : expiring ? '#d97706' : 'var(--text2)' }}>
                          {expiry.toLocaleDateString('es-AR')}
                        </span>
                        {expiring && !expired && (
                          <span style={{ fontSize: 11, color: '#d97706' }}>({daysLeft}d)</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {driver.vehicles ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CarFront size={14} color="var(--muted)" />
                          <span>
                            <strong style={{ fontFamily: 'monospace' }}>{driver.vehicles.plate}</strong> · {driver.vehicles.brand} {driver.vehicles.model}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted2)' }}>Sin asignar</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          data-testid={`drivers-edit-${driver.id}`}
                          onClick={() => editDriver(driver)}
                          className="btn-secondary"
                          style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                        >
                          <Pencil size={12} /> Editar
                        </button>
                        <button
                          data-testid={`drivers-delete-${driver.id}`}
                          onClick={() => window.confirm(`¿Eliminar el conductor ${driver.profiles?.full_name || driver.license_number}?`) && remove.mutate(driver.id)}
                          className="btn-danger"
                          style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                          disabled={remove.isPending}
                        >
                          <Trash2 size={12} /> Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
