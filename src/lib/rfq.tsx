import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

export interface RfqItem { id: string; code: string; name: string; qty: number }
export interface RfqForm { name: string; company: string; email: string; phone: string; message: string }
const KEY = 'ucp_rfq'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function load(): RfqItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(v)) return []
    return v.filter((x) => x && typeof x.id === 'string' && UUID.test(x.id) && typeof x.code === 'string' && typeof x.name === 'string' && Number.isInteger(x.qty) && x.qty >= 1 && x.qty <= 100000).slice(0, 200)
  } catch { return [] }
}

interface Ctx {
  items: RfqItem[]; open: boolean; setOpen: (o: boolean) => void
  add: (i: Omit<RfqItem, 'qty'>, qty?: number) => void; setQty: (id: string, qty: number) => void; remove: (id: string) => void; clear: () => void
}
const C = createContext<Ctx | null>(null)

export function RfqProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<RfqItem[]>(load)
  const [open, setOpen] = useState(false)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* storage unavailable */ } }, [items])
  const value = useMemo<Ctx>(() => ({
    items, open, setOpen,
    add: (i, qty = 1) => setItems((cur) => (cur.some((x) => x.id === i.id) ? cur.map((x) => (x.id === i.id ? { ...x, qty: Math.min(100000, x.qty + qty) } : x)) : cur.length >= 200 ? cur : [...cur, { ...i, qty }])),
    setQty: (id, qty) => setItems((cur) => cur.map((x) => (x.id === id ? { ...x, qty: Math.max(1, Math.min(100000, Math.floor(qty) || 1)) } : x))),
    remove: (id) => setItems((cur) => cur.filter((x) => x.id !== id)),
    clear: () => setItems([]),
  }), [items, open])
  return <C.Provider value={value}>{children}</C.Provider>
}

export function useRfq(): Ctx {
  const v = useContext(C)
  if (!v) throw new Error('useRfq must be used inside RfqProvider')
  return v
}

export async function submitRfq(f: RfqForm, items: RfqItem[]): Promise<string> {
  const { data, error } = await supabase.rpc('submit_rfq', {
    p_name: f.name, p_company: f.company, p_email: f.email, p_phone: f.phone, p_message: f.message, p_items: items.map((i) => ({ id: i.id, qty: i.qty })),
  })
  if (error) throw new Error(error.message)
  return data as string
}
