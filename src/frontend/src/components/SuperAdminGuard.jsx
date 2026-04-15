import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function SuperAdminGuard({ children }) {
  const token = useAuthStore((s) => s.token)
  const profile = useAuthStore((s) => s.profile)

  if (!token) return <Navigate to="/login" replace />
  if (profile?.role !== 'super_admin') return <Navigate to="/dashboard" replace />
  return children
}
