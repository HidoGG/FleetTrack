import { useQuery } from '@tanstack/react-query'
import { Plus, Users, AlertTriangle, CheckCircle } from 'lucide-react'
import { api } from '../services/api'

export default function DriversPage() {
  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['drivers'],
    queryFn: api.getDrivers,
  })

  const today = new Date()
  const expiringSoon = drivers.filter((d) => {
    const days = (new Date(d.license_expiry) - today) / (1000 * 60 * 60 * 24)
    return days >= 0 && days <= 30
  }).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Conductores</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 3 }}>
            {drivers.length} conductor{drivers.length !== 1 ? 'es' : ''} registrado{drivers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={15} strokeWidth={2.5} /> Nuevo conductor
        </button>
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

      <div className="card">
        {isLoading ? (
          <p style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>Cargando...</p>
        ) : drivers.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center' }}>
            <Users size={32} color="var(--muted2)" style={{ marginBottom: 10 }} />
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>Todavía no hay conductores registrados</p>
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
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => {
                const expiry = new Date(d.license_expiry)
                const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24))
                const expired = daysLeft < 0
                const expiringSoon = daysLeft >= 0 && daysLeft <= 30

                return (
                  <tr key={d.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: '50%',
                          background: 'var(--accent-l)', color: 'var(--accent)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, flexShrink: 0,
                        }}>
                          {(d.profiles?.full_name || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                          {d.profiles?.full_name || '—'}
                        </span>
                      </div>
                    </td>
                    <td>{d.profiles?.phone || '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{d.license_number}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {expired
                          ? <AlertTriangle size={13} color="var(--danger)" />
                          : expiringSoon
                          ? <AlertTriangle size={13} color="var(--warn)" />
                          : <CheckCircle size={13} color="var(--success)" />
                        }
                        <span style={{ color: expired ? 'var(--danger)' : expiringSoon ? '#d97706' : 'var(--text2)' }}>
                          {expiry.toLocaleDateString('es-AR')}
                        </span>
                        {expiringSoon && !expired && (
                          <span style={{ fontSize: 11, color: '#d97706' }}>({daysLeft}d)</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {d.vehicles
                        ? <><span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{d.vehicles.plate}</span> · {d.vehicles.brand} {d.vehicles.model}</>
                        : <span style={{ color: 'var(--muted2)' }}>Sin asignar</span>
                      }
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
