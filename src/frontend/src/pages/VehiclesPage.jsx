import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Truck, Search } from 'lucide-react'
import { api } from '../services/api'

const EMPTY = { plate: '', brand: '', model: '', year: '', color: '' }

const FIELDS = [
  { name: 'plate',  label: 'Patente',  placeholder: 'ABC123',  required: true },
  { name: 'brand',  label: 'Marca',    placeholder: 'Toyota',  required: true },
  { name: 'model',  label: 'Modelo',   placeholder: 'Hilux',   required: true },
  { name: 'year',   label: 'Año',      placeholder: '2022' },
  { name: 'color',  label: 'Color',    placeholder: 'Blanco' },
]

export default function VehiclesPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState(EMPTY)
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['vehicles'],
    queryFn: api.getVehicles,
  })

  const save = useMutation({
    mutationFn: (data) => editing ? api.updateVehicle(editing, data) : api.createVehicle(data),
    onSuccess: () => { qc.invalidateQueries(['vehicles']); reset() },
  })

  const remove = useMutation({
    mutationFn: api.deleteVehicle,
    onSuccess: () => qc.invalidateQueries(['vehicles']),
  })

  function reset() { setForm(EMPTY); setEditing(null); setShowForm(false) }
  function edit(v) { setForm(v); setEditing(v.id); setShowForm(true) }
  function handleChange(e) { setForm((f) => ({ ...f, [e.target.name]: e.target.value })) }

  const filtered = vehicles.filter((v) =>
    [v.plate, v.brand, v.model].some((s) => s?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Vehículos</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
            {vehicles.length} vehículo{vehicles.length !== 1 ? 's' : ''} registrado{vehicles.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => { reset(); setShowForm(true) }}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Nuevo vehículo
        </button>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="card" style={{ padding: 22, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18 }}>
            {editing ? 'Editar vehículo' : 'Nuevo vehículo'}
          </h3>
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(form) }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
              {FIELDS.map(({ name, label, placeholder, required }) => (
                <div key={name}>
                  <label style={{ display: 'block', marginBottom: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)' }}>
                    {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
                  </label>
                  <input
                    name={name}
                    value={form[name] || ''}
                    onChange={handleChange}
                    placeholder={placeholder}
                    required={required}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn-primary" disabled={save.isPending}>
                {save.isPending ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear vehículo'}
              </button>
              <button type="button" className="btn-secondary" onClick={reset}>Cancelar</button>
            </div>
          </form>
        </div>
      )}

      {/* Buscador */}
      <div style={{ position: 'relative', marginBottom: 14, maxWidth: 320 }}>
        <Search size={14} color="var(--muted2)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por patente, marca o modelo..."
          style={{ paddingLeft: 34 }}
        />
      </div>

      {/* Tabla */}
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
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td>
                    <span style={{ fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', fontSize: 13 }}>
                      {v.plate}
                    </span>
                  </td>
                  <td>
                    <div style={{ fontWeight: 500, color: 'var(--text)' }}>{v.brand} {v.model}</div>
                    {v.color && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{v.color}</div>}
                  </td>
                  <td>{v.year || '—'}</td>
                  <td>{v.odometer_km > 0 ? `${Number(v.odometer_km).toLocaleString()} km` : '—'}</td>
                  <td><span className={`badge ${v.status}`}>{v.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => edit(v)}
                        className="btn-secondary"
                        style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      <button
                        onClick={() => window.confirm(`¿Eliminar ${v.plate}?`) && remove.mutate(v.id)}
                        className="btn-danger"
                        style={{ padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
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
