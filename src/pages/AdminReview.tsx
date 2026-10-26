import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { show } from '../lib/format'

interface Row { id: string; product_code: string; name: string; source_page: number | null; category_id: string | null; product_categories: { name: string } | null }
const SIZE = 50

export default function AdminReview() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error, count } = await supabase.from('products')
      .select('id,product_code,name,source_page,category_id,product_categories(name)', { count: 'exact' })
      .eq('status', 'draft').order('source_page', { ascending: true, nullsFirst: false }).range(page * SIZE, page * SIZE + SIZE - 1)
    if (error) return setMsg({ ok: false, text: error.message })
    setRows(data as unknown as Row[]); setTotal(count ?? 0)
  }, [page])
  useEffect(() => { void load() }, [load])

  const act = async (id: string, change: { status: string; verification_status?: string }, done: string) => {
    const { error } = await supabase.from('products').update(change).eq('id', id)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: done })
    if (!error) await load()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Review queue</h1>
      <p className="text-sm text-steel-600">Draft products appear here. Compare each with its catalogue page, then verify and publish it, or archive it. Only published products are visible to other users.</p>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
      {rows === null && <p role="status" className="text-steel-600">Loading…</p>}
      {rows?.length === 0 && <p className="text-steel-600">Nothing to review. Import a file to add drafts.</p>}
      {rows && rows.length > 0 && (<>
        <p className="text-sm" aria-live="polite">{total} drafts</p>
        <div className="overflow-x-auto border border-steel-300 bg-white"><table className="w-full text-sm">
          <thead className="bg-steel-100 text-left"><tr>{['Code', 'Name', 'Category', 'Source page', 'Actions'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-steel-300">
              <td className="px-3 py-2 font-mono"><Link className="underline" to={`/products/${r.id}`}>{r.product_code}</Link></td>
              <td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{show(r.product_categories?.name)}</td><td className="px-3 py-2">{show(r.source_page)}</td>
              <td className="px-3 py-2 space-x-2">
                <button className="border border-steel-300 px-2 py-1 hover:bg-steel-100" onClick={() => void act(r.id, { status: 'active', verification_status: 'verified' }, 'Verified and published.')}>Verify and publish</button>
                <button className="border border-steel-300 px-2 py-1 hover:bg-steel-100" onClick={() => void act(r.id, { status: 'archived' }, 'Archived.')}>Archive</button>
              </td></tr>))}</tbody></table></div>
        <div className="flex gap-3 text-sm">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="border border-steel-300 px-3 py-1 disabled:opacity-40">Previous</button>
          <button disabled={(page + 1) * SIZE >= total} onClick={() => setPage(page + 1)} className="border border-steel-300 px-3 py-1 disabled:opacity-40">Next</button>
        </div></>)}
    </div>
  )
}
