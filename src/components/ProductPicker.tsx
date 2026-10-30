import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface PickedProduct { id: string; code: string; name: string }

/** Type a code or name, pick the product from the list. */
export default function ProductPicker({ value, onChange, id }: { value: PickedProduct | null; onChange: (p: PickedProduct | null) => void; id?: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PickedProduct[]>([])

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    let live = true
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_products', { p_q: q.trim(), p_limit: 8, p_offset: 0 })
      const items = ((data as { items?: { id: string; product_code: string; name: string }[] } | null)?.items ?? [])
      if (live) setResults(items.map((i) => ({ id: i.id, code: i.product_code, name: i.name })))
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  if (value) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="bg-belt-100 px-2 py-1 rounded"><span className="font-mono">{value.code}</span> {value.name}</span>
        <button type="button" className="underline" onClick={() => onChange(null)}>Change</button>
      </div>
    )
  }
  return (
    <div className="relative">
      <input id={id} className="border border-steel-300 px-2 py-2 bg-white w-full text-sm" placeholder="Type a product code or name" value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-steel-300 rounded shadow-lg max-h-56 overflow-auto text-sm">
          {results.map((r) => (
            <li key={r.id}><button type="button" className="w-full text-left px-3 py-2 hover:bg-belt-100" onClick={() => { onChange(r); setQ(''); setResults([]) }}><span className="font-mono">{r.code}</span> {r.name}</button></li>))}
        </ul>)}
    </div>
  )
}
