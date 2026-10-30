import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { linkFor } from '../lib/share'

interface Row {
  id: string; token: string; kind: string; created_at: string; expires_at: string | null; revoked_at: string | null
  products: { product_code: string; name: string } | null; product_categories: { name: string } | null
}

export default function AdminShare() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('share_links')
      .select('id,token,kind,created_at,expires_at,revoked_at,products(product_code,name),product_categories(name)').order('created_at', { ascending: false }).limit(200)
    if (error) setMsg({ ok: false, text: error.message }); else { setRows(data as unknown as Row[]); setPicked(new Set()) }
  }, [])
  useEffect(() => { void load() }, [load])

  const state = (r: Row) => (r.revoked_at ? 'Withdrawn' : r.expires_at && new Date(r.expires_at) < new Date() ? 'Expired' : 'Active')
  const copy = async (r: Row) => {
    try { await navigator.clipboard.writeText(linkFor(r.token)); setMsg({ ok: true, text: 'Link copied.' }) } catch { setMsg({ ok: false, text: linkFor(r.token) }) }
  }
  const revoke = async (r: Row) => {
    if (!window.confirm('Withdraw this link? People who have it will no longer be able to open it.')) return
    const { error } = await supabase.rpc('revoke_share_link', { p_id: r.id })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Link withdrawn.' })
    if (!error) await load()
  }

  const revokeMany = async (ids: string[]) => {
    if (ids.length === 0) return setMsg({ ok: false, text: 'Select at least one active link.' })
    if (!window.confirm(`Withdraw ${ids.length} link(s)? People who have them will no longer be able to open them.`)) return
    const results = await Promise.all(ids.map((id) => supabase.rpc('revoke_share_link', { p_id: id })))
    const bad = results.find((r) => r.error)
    setMsg(bad?.error ? { ok: false, text: bad.error.message } : { ok: true, text: `${ids.length} link(s) withdrawn.` }); await load()
  }
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const active = (rows ?? []).filter((r) => state(r) === 'Active')

  return (
    <div className="space-y-4">
      <p className="text-sm"><Link className="underline" to="/admin">Back to admin</Link></p>
      <h1 className="text-2xl font-bold">Customer links</h1>
      <p className="text-sm text-steel-600">Create a link from a product page or a category (Copy customer link). Anyone with a link can see only that product or category, without signing in. Withdraw a link to stop access.</p>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
      {rows === null && !msg && <p role="status" className="text-steel-600">Loading…</p>}
      {rows?.length === 0 && <p className="text-steel-600">No customer links yet.</p>}
      {active.length > 0 && (<div className="flex flex-wrap items-center gap-2 text-sm">
        <span aria-live="polite">{picked.size} selected</span>
        <button className="border border-steel-300 bg-white px-3 py-1 hover:bg-steel-100" onClick={() => setPicked(new Set(active.map((r) => r.id)))}>Select all active</button>
        <button className="border border-steel-300 bg-white px-3 py-1 hover:bg-steel-100" onClick={() => setPicked(new Set())}>Clear</button>
        <button className="border border-steel-300 bg-white px-3 py-1 text-red-700 hover:bg-steel-100" onClick={() => void revokeMany([...picked])}>Withdraw selected</button>
      </div>)}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto border border-steel-300 bg-white"><table className="w-full text-sm">
          <thead className="bg-steel-100 text-left"><tr><th className="px-3 py-2"><span className="sr-only">Select</span></th>{['Shared item', 'Type', 'Created', 'Expires', 'Status', ''].map((h, i) => <th key={i} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-steel-300">
              <td className="px-3 py-2">{state(r) === 'Active' && <input type="checkbox" aria-label="Select link" checked={picked.has(r.id)} onChange={() => toggle(r.id)} />}</td>
              <td className="px-3 py-2">{r.kind === 'product' ? `${r.products?.product_code ?? ''} ${r.products?.name ?? ''}` : r.product_categories?.name ?? 'Not available'}</td>
              <td className="px-3 py-2">{r.kind === 'product' ? 'Product' : 'Category'}</td>
              <td className="px-3 py-2">{new Date(r.created_at).toLocaleDateString()}</td>
              <td className="px-3 py-2">{r.expires_at ? new Date(r.expires_at).toLocaleDateString() : 'Never'}</td>
              <td className="px-3 py-2">{state(r)}</td>
              <td className="px-3 py-2 space-x-3 whitespace-nowrap">
                {state(r) === 'Active' && <><button className="underline" onClick={() => void copy(r)}>Copy link</button><button className="underline text-red-700" onClick={() => void revoke(r)}>Withdraw</button></>}
              </td></tr>))}</tbody></table></div>)}
    </div>
  )
}
