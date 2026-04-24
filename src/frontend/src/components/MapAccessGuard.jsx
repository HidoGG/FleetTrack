import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

export default function MapAccessGuard({ children }) {
  const token = useAuthStore((state) => state.token)
  const canAccessCompanyMap = useAuthStore(
    (state) => state.mapAccess?.capabilities?.includes('map.view.company') ?? false
  )

  if (!token) return <Navigate to="/login" replace />
  if (!canAccessCompanyMap) return <Navigate to="/dashboard" replace />
  return children
}
