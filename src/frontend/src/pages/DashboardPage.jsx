import { useQuery } from '@tanstack/react-query'
import { Truck, Navigation, CalendarCheck, Wrench, TrendingUp, Clock, Banknote, ShoppingBag } from 'lucide-react'
import { api } from '../services/api'
import { useAuthStore } from '../store/authStore'

function KpiCard({ label, value, Icon, color, bg, trend, sublabel }) {
  return (
    <div className="card" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {label}
        </span>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={color} strokeWidth={2} />
        </div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>
        {value ?? '—'}
      </div>
      {sublabel && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: -6 }}>
          {sublabel}
        </div>
      )}
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--success)' }}>
          <TrendingUp size={12} />
          {trend}
        </div>
      )}
    </div>
  )
}

function FinancialCard({ label, amount, Icon, color, bg, description }) {
  const formatted = typeof amount === 'number'
    ? `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : '—'

  return (
    <div className="card" style={{
      padding: '20px 22px',
      borderLeft: `4px solid ${color}`,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {label}
        </span>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} color={color} strokeWidth={2} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>
        {formatted}
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4, margin: 0 }}>
        {description}
      </p>
    </div>
  )
}

export default function DashboardPage() {
  const profile = useAuthStore((s) => s.profile)

  const { data: vehicles = [] } = useQuery({ queryKey: ['vehicles'], queryFn: api.getVehicles })
  const { data: trips    = [] } = useQuery({ queryKey: ['trips', 'in_progress'], queryFn: () => api.getTrips({ status: 'in_progress' }) })
  const { data: allTrips = [] } = useQuery({ queryKey: ['trips', 'all'],         queryFn: () => api.getTrips({ limit: 100 }) })
  const { data: financials }    = useQuery({
    queryKey: ['orders', 'financials'],
    queryFn:  api.getDashboardFinancials,
    refetchInterval: 30_000,
  })

  const active      = vehicles.filter(v => v.status === 'active').length
  const maintenance = vehicles.filter(v => v.status === 'maintenance').length
  const today       = new Date().toDateString()
  const tripsToday  = allTrips.filter(t => new Date(t.start_time).toDateString() === today).length

  const hour     = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
          {greeting}, {profile?.full_name?.split(' ')[0] || 'Admin'}
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 4, fontSize: 13.5 }}>
          {new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* KPIs operativos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
        <KpiCard label="Vehículos activos" value={active}         Icon={Truck}         color="#4f46e5" bg="var(--accent-l)" />
        <KpiCard label="Viajes en curso"   value={trips.length}   Icon={Navigation}    color="#059669" bg="var(--success-l)" />
        <KpiCard label="Viajes hoy"        value={tripsToday}     Icon={CalendarCheck} color="#d97706" bg="var(--warn-l)" />
        <KpiCard label="En mantenimiento"  value={maintenance}    Icon={Wrench}        color="#ef4444" bg="var(--danger-l)" />
      </div>

      {/* KPIs financieros */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
        <FinancialCard
          label="Efectivo a Rendir"
          amount={financials?.cash_in_transit}
          Icon={Banknote}
          color="#dc2626"
          bg="#fee2e2"
          description="Suma de pedidos COD en tránsito. El repartidor debe rendir este monto al finalizar."
        />
        <FinancialCard
          label="Valor de Mercadería"
          amount={financials?.merchandise_value}
          Icon={ShoppingBag}
          color="#7c3aed"
          bg="#ede9fe"
          description="Valor estimado de productos actualmente en ruta (todos los pedidos activos)."
        />
      </div>

      {/* Tabla viajes en curso */}
      <div className="card">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Navigation size={16} color="var(--accent)" />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Viajes en curso</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} /> Actualización en vivo
          </span>
        </div>
        {trips.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Sin viajes activos en este momento
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vehículo</th>
                <th>Conductor</th>
                <th>Inicio</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {t.vehicles?.plate}
                    <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>
                      {t.vehicles?.brand} {t.vehicles?.model}
                    </span>
                  </td>
                  <td>{t.drivers?.profiles?.full_name || '—'}</td>
                  <td>{new Date(t.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td><span className="badge in_progress">En curso</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
