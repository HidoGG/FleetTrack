import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function AuthGuard({ children }) {
  const token   = useAuthStore((s) => s.token)
  const profile = useAuthStore((s) => s.profile)

  if (!token) return <Navigate to="/login" replace />
  // Los puntos de despacho tienen su propio portal y no acceden al panel admin.
  if (profile?.role === 'store') return <Navigate to="/store/dashboard" replace />
  return children
}
