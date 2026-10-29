import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { show } from '../lib/format'

interface Row { id: string; product_code: string; name: string; source_page: number | null; product_categories: { name: string } | null }
const SIZE = 100

export default function AdminReview() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error, count } = await supabase.from('products')
      .select('id,product_code,name,source_page,product_categories!category_id(name)', { count: 'exact' })
      .eq('status', 'draft').order('source_page', { ascending: true, nullsFirst: false }).range(page * SIZE, page * SIZE + SIZE - 1)
    if (error) return setMsg({ ok: false, text: error.message })
    setRows(data as unknown as Row[]); setTotal(count ?? 0); setPicked(new Set())
  }, [page])
  useEffect(() => { void load() }, [load])

  const apply = async (ids: string[], change: { status: string; verification_status?: string }, done: string) => {
    if (ids.length === 0) return setMsg({ ok: false, text: 'Select at least one product.' })
    const { error } = await supabase.from('products').update(change).in('id', ids)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${ids.length} product(s): ${done}` })
    if (!error) await load()
  }
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const ids = [...picked]
  const btn = 'border border-steel-300 bg-white px-3 py-1 hover:bg-steel-100'

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Review queue</h1>
      <p className="text-sm text-steel-600">Imported products wait here as drafts. <strong>Publish (keep Not verified)</strong> makes them visible to users with a warning label. <strong>Verify and publish</strong> should only be used after checking a product against its catalogue page.</p>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
      {rows === null && <p role="status" className="text-steel-600">Loading…</p>}
      {rows?.length === 0 && <p className="text-steel-600">Nothing to review. Import a file to add drafts.</p>}
      {rows && rows.length > 0 && (<>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span aria-live="polite">{total} drafts, {picked.size} selected</span>
          <button className={btn} onClick={() => setPicked(new Set(rows.map((r) => r.id)))}>Select all on this page</button>
          <button className={btn} onClick={() => setPicked(new Set())}>Clear</button>
          <button className={btn} onClick={() => void apply(ids, { status: 'active' }, 'published (Not verified).')}>Publish (keep Not verified)</button>
          <button className={btn} onClick={() => void apply(ids, { status: 'active', verification_status: 'verified' }, 'verified and published.')}>Verify and publish</button>
          <button className={btn} onClick={() => void apply(ids, { status: 'archived' }, 'archived.')}>Archive</button>
        </div>
        <div className="overflow-x-auto border border-steel-300 bg-white"><table className="w-full text-sm">
          <thead className="bg-steel-100 text-left"><tr><th className="px-3 py-2"><span className="sr-only">Select</span></th>{['Code', 'Name', 'Category', 'Source page'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-steel-300">
              <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${r.product_code}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} /></td>
              <td className="px-3 py-2 font-mono"><Link className="underline" to={`/products/${r.id}`}>{r.product_code}</Link></td>
              <td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{show(r.product_categories?.name)}</td><td className="px-3 py-2">{show(r.source_page)}</td></tr>))}</tbody></table></div>
        <div className="flex gap-3 text-sm">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="border border-steel-300 px-3 py-1 disabled:opacity-40">Previous</button>
          <button disabled={(page + 1) * SIZE >= total} onClick={() => setPage(page + 1)} className="border border-steel-300 px-3 py-1 disabled:opacity-40">Next</button>
        </div></>)}
    </div>
  )
}
