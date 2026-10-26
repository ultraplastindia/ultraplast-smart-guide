import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export const MAX_COMPARE = 4
const KEY = 'ucp_compare'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
interface Ctx { ids: string[]; toggle: (id: string) => void; clear: () => void }
const C = createContext<Ctx | null>(null)

function load(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && UUID.test(x)).slice(0, MAX_COMPARE) : []
  } catch { return [] }
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>(load)
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* storage unavailable */ } }, [ids])
  const value = useMemo<Ctx>(() => ({
    ids,
    toggle: (id) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_COMPARE ? cur : [...cur, id])),
    clear: () => setIds([]),
  }), [ids])
  return <C.Provider value={value}>{children}</C.Provider>
}

export function useCompare(): Ctx {
  const v = useContext(C)
  if (!v) throw new Error('useCompare must be used inside CompareProvider')
  return v
}
