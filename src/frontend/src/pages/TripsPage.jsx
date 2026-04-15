import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Route, Clock, CheckCircle, XCircle, Navigation } from 'lucide-react'
import { api } from '../services/api'

const STATUS_CONFIG = {
  in_progress: { label: 'En curso',    Icon: Navigation,   className: 'in_progress' },
  completed:   { label: 'Completado',  Icon: CheckCircle,  className: 'completed' },
  cancelled:   { label: 'Cancelado',   Icon: XCircle,      className: 'cancelled' },
}

function formatDuration(start, end) {
  if (!end) return '—'
  const mins = Math.round((new Date(end) - new Date(start)) / 60000)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function TripsPage() {
  const [statusFilter, setStatusFilter] = useState('')

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['trips', statusFilter],
    queryFn: () => api.getTrips(statusFilter ? { status: statusFilter } : {}),
  })

  const completedKm = trips
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + (t.km_total || 0), 0)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Historial de Viajes</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
            {trips.length} viaje{trips.length !== 1 ? 's' : ''} · {completedKm.toLocaleString()} km totales
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: 'auto', minWidth: 180 }}
        >
          <option value="">Todos los estados</option>
          <option value="in_progress">En curso</option>
          <option value="completed">Completados</option>
          <option value="cancelled">Cancelados</option>
        </select>
      </div>

      <div className="card">
        {isLoading ? (
          <p style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Cargando...</p>
        ) : trips.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <Route size={32} color="var(--muted2)" style={{ marginBottom: 10 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin viajes registrados</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Conductor</th>
                <th>Fecha y hora</th>
                <th>Duración</th>
                <th>Km</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => {
                const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.cancelled
                return (
                  <tr key={t.id}>
                    <td>
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 13 }}>
                        {t.vehicles?.plate}
                      </span>
                      <span style={{ color: 'var(--muted)', marginLeft: 6, fontSize: 12 }}>
                        {t.vehicles?.brand} {t.vehicles?.model}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text2)' }}>{t.drivers?.profiles?.full_name || '—'}</td>
                    <td>
                      <div style={{ fontSize: 13 }}>
                        {new Date(t.start_time).toLocaleDateString('es-AR')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <Clock size={10} />
                        {new Date(t.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td>{formatDuration(t.start_time, t.end_time)}</td>
                    <td>
                      {t.km_total > 0
                        ? <span style={{ fontWeight: 600 }}>{t.km_total} km</span>
                        : <span style={{ color: 'var(--muted2)' }}>—</span>
                      }
                    </td>
                    <td>
                      <span className={`badge ${cfg.className}`}>
                        <cfg.Icon size={10} strokeWidth={2.5} />
                        {cfg.label}
                      </span>
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
