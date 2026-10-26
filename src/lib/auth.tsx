import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { canAccessProtected, fallbackStatus, type AccessStatus, type AppRole } from './access'

interface AuthState {
  session: Session | null
  status: AccessStatus
  role: AppRole | null
  permissions: string[]
  loading: boolean
  allowed: boolean
  can: (permission: string) => boolean
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AccessStatus>('pending_verification')
  const [role, setRole] = useState<AppRole | null>(null)
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const loadAccess = useCallback(async (s: Session | null) => {
    if (!s) {
      setStatus('pending_verification'); setRole(null); setPermissions([])
      return
    }
    // Server decides: my_access() is a security-definer function. On any error we fail closed.
    const { data, error } = await supabase.rpc('my_access')
    if (error || !data) {
      setStatus(fallbackStatus(Boolean(s.user.email_confirmed_at))); setRole(null); setPermissions([])
      return
    }
    setStatus(data.status as AccessStatus)
    setRole((data.role as AppRole | null) ?? null)
    setPermissions(Array.isArray(data.permissions) ? (data.permissions as string[]) : [])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadAccess(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      void loadAccess(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadAccess])

  const value = useMemo<AuthState>(() => {
    const allowed = canAccessProtected(Boolean(session), Boolean(session?.user.email_confirmed_at), status)
    return {
      session, status, role, permissions, loading, allowed,
      can: (p) => allowed && permissions.includes(p),
      signOut: async () => { await supabase.auth.signOut() },
      refresh: () => loadAccess(session),
    }
  }, [session, status, role, permissions, loading, loadAccess])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
