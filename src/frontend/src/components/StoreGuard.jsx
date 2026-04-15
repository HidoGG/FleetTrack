import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

/**
 * Protege las rutas /store/*
 * - Sin sesión: redirige a /login
 * - Con sesión pero rol != 'store': redirige al dashboard admin
 */
export default function StoreGuard({ children }) {
  const token   = useAuthStore((s) => s.token)
  const profile = useAuthStore((s) => s.profile)

  if (!token)                      return <Navigate to="/login"     replace />
  if (profile?.role !== 'store')   return <Navigate to="/dashboard" replace />
  return children
}
