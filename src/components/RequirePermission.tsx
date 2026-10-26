import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

/** UX guard only; the database enforces the same permission on every call. */
export default function RequirePermission({ permission }: { permission: string }) {
  const { can } = useAuth()
  return can(permission) ? <Outlet /> : <Navigate to="/" replace />
}
