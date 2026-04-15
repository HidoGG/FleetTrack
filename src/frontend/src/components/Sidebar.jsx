import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Map, Truck, Users, Route, LogOut, Zap, Package } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { api } from '../services/api'

const NAV = [
  { to: '/dashboard', label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/map',       label: 'Mapa en vivo', Icon: Map },
  { to: '/vehicles',  label: 'Vehículos',    Icon: Truck },
  { to: '/drivers',   label: 'Conductores',  Icon: Users },
  { to: '/trips',     label: 'Viajes',       Icon: Route },
  { to: '/bultos',    label: 'Lotes',        Icon: Package },
]

export default function Sidebar() {
  const { profile, logout } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await api.logout().catch(() => {})
    logout()
    navigate('/login')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'A'

  return (
    <aside style={{
      width: 'var(--sidebar)',
      background: 'var(--surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 20px 18px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 34, height: 34,
          background: 'var(--accent)',
          borderRadius: 9,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Zap size={18} color="#fff" strokeWidth={2.5} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', letterSpacing: '-.01em' }}>
            FleetTrack
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
            Panel Admin
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        <p style={{
          fontSize: 10, fontWeight: 600, color: 'var(--muted2)',
          textTransform: 'uppercase', letterSpacing: '.08em',
          padding: '6px 10px 8px',
        }}>
          Menú
        </p>
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 11px',
              borderRadius: 8,
              marginBottom: 2,
              color: isActive ? 'var(--accent)' : 'var(--muted)',
              background: isActive ? 'var(--accent-l)' : 'transparent',
              fontWeight: isActive ? 600 : 400,
              fontSize: 13.5,
              transition: 'all .12s',
            })}
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User + Logout */}
      <div style={{
        padding: '12px 14px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--accent-l)',
          color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {profile?.full_name || 'Admin'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'capitalize' }}>
            {profile?.role}
          </div>
        </div>
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          style={{ padding: 6, background: 'transparent', color: 'var(--muted)', borderRadius: 7, flexShrink: 0 }}
        >
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  )
}
