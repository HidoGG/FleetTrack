import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, AlertCircle } from 'lucide-react'
import { api } from '../services/api'
import { useAuthStore } from '../store/authStore'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await api.login(email, password)
      login(data.token, data.user)
      // Redirigir según rol
      const role = data.user?.profile?.role
      navigate(role === 'store' ? '/store/dashboard' : '/dashboard')
    } catch (err) {
      setError(err.message || 'Error al iniciar sesión. Intentá nuevamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: 'var(--bg)',
    }}>
      {/* Panel izquierdo — decorativo */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div style={{
            width: 44, height: 44, background: 'rgba(255,255,255,.2)',
            borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={24} color="#fff" />
          </div>
          <span style={{ fontSize: 22, fontWeight: 700 }}>FleetTrack</span>
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 700, lineHeight: 1.2, marginBottom: 16 }}>
          Gestión de flotas<br />en tiempo real
        </h1>
        <p style={{ fontSize: 16, opacity: .75, lineHeight: 1.6, maxWidth: 360 }}>
          Monitoreá tu flota, asigná conductores y optimizá rutas desde un solo panel.
        </p>

        {/* Stats decorativos */}
        <div style={{ display: 'flex', gap: 32, marginTop: 56 }}>
          {[
            { value: '99.9%', label: 'Uptime' },
            { value: '< 1s',  label: 'Latencia GPS' },
            { value: '24/7',  label: 'Monitoreo' },
          ].map(({ value, label }) => (
            <div key={label}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 12, opacity: .65, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div style={{
        width: 460,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 52px',
        flexShrink: 0,
      }}>
        <div style={{ width: '100%' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Iniciar sesión
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 28 }}>
            Ingresá con tu cuenta de administrador
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@empresa.com"
                required
                autoFocus
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 500, color: 'var(--text2)' }}>
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--danger-l)', border: '1px solid #fca5a5',
                borderRadius: 8, padding: '10px 12px', color: '#dc2626', fontSize: 13,
              }}>
                <AlertCircle size={15} strokeWidth={2} />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ padding: '11px', fontWeight: 600, fontSize: 14, marginTop: 4 }}
            >
              {loading ? 'Ingresando...' : 'Ingresar al panel'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
