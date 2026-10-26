import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { routeForStatus } from '../lib/access'

export default function RequireApproved() {
  const { session, status, loading, allowed } = useAuth()
  const loc = useLocation()
  if (loading) return <p className="p-8 text-steel-600" role="status">Checking your access…</p>
  if (!session) return <Navigate to="/login" state={{ from: loc.pathname }} replace />
  if (!allowed) return <Navigate to={routeForStatus(status)} replace />
  return <Outlet />
}
