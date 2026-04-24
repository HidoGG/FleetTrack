import { NavLink, useNavigate } from 'react-router-dom'
import { Outlet } from 'react-router-dom'
import { Package, PlusCircle, LogOut, Store } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { api } from '../services/api'

const NAV = [
  { to: '/store/dashboard',  label: 'Mis pedidos',    Icon: Package },
  { to: '/store/new-order',  label: 'Nuevo despacho', Icon: PlusCircle },
]

export default function StoreLayout() {
  const { profile, logout } = useAuthStore()
  const navigate = useNavigate()

  async function handleLogout() {
    await api.logout().catch(() => {})
    logout()
    navigate('/login')
  }

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'T'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Sidebar mínimo para portal de despacho */}
      <aside style={{
        width: 220, flexShrink: 0,
        background: 'var(--surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: '#059669', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Store size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Portal de Despacho</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{profile?.full_name || 'Sucursal'}</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px' }}>
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 11px', borderRadius: 8, marginBottom: 2,
                color: isActive ? '#059669' : 'var(--muted)',
                background: isActive ? '#d1fae5' : 'transparent',
                fontWeight: isActive ? 600 : 400, fontSize: 13.5,
                transition: 'all .12s',
              })}
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#d1fae5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.full_name || 'Punto de Despacho'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Rol: punto de despacho</div>
          </div>
          <button onClick={handleLogout} style={{ padding: 6, background: 'transparent', color: 'var(--muted)', borderRadius: 6 }} title="Salir">
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      {/* Contenido principal */}
      <main style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        <Outlet />
      </main>
    </div>
  )
}
