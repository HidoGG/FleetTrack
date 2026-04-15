import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AuthGuard    from './components/AuthGuard'
import StoreGuard   from './components/StoreGuard'
import SuperAdminGuard from './components/SuperAdminGuard'
import Layout       from './components/Layout'
import StoreLayout  from './components/StoreLayout'
import LoginPage    from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import MapPage      from './pages/MapPage'
import VehiclesPage from './pages/VehiclesPage'
import DriversPage  from './pages/DriversPage'
import TripsPage    from './pages/TripsPage'
import BultosPage   from './pages/BultosPage'
import SuperAdminPage from './pages/SuperAdminPage'
import StoreDashboard from './pages/store/StoreDashboard'
import NewOrderPage   from './pages/store/NewOrderPage'

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="map"       element={<MapPage />} />
          <Route path="vehicles"  element={<VehiclesPage />} />
          <Route path="drivers"   element={<DriversPage />} />
          <Route path="trips"     element={<TripsPage />} />
          <Route path="bultos"    element={<BultosPage />} />
          <Route
            path="super-admin"
            element={
              <SuperAdminGuard>
                <SuperAdminPage />
              </SuperAdminGuard>
            }
          />
        </Route>
        {/* Portal de tiendas */}
        <Route
          path="/store"
          element={
            <StoreGuard>
              <StoreLayout />
            </StoreGuard>
          }
        >
          <Route index element={<Navigate to="/store/dashboard" replace />} />
          <Route path="dashboard" element={<StoreDashboard />} />
          <Route path="new-order" element={<NewOrderPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
