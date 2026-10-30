import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { groupByCategory, na, totalQuantity } from '../lib/bom'
import { exportExcel, exportPdf, fetchExport } from '../lib/exportBom'

interface Bom { id: string; reference: string; name: string; project: string | null; notes: string | null; updated_at: string }
interface Line {
  id: string; quantity: number; notes: string | null; product_code: string; category: string | null
  name: string; material: string | null; pitch_mm: number | null; width_mm: number | null; source_page: number | null; verified: boolean
}
interface RawLine {
  id: string; quantity: number; notes: string | null; product_code_snapshot: string; name_snapshot: string
  products: { material: string | null; pitch_mm: number | null; width_mm: number | null; source_page: number | null; verification_status: string; product_categories: { name: string } | null } | null
}

export default function BomPage() {
  const { can } = useAuth()
  const [boms, setBoms] = useState<Bom[]>([])
  const [sel, setSel] = useState<string>('')
  const [lines, setLines] = useState<Line[]>([])
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const bom = boms.find((b) => b.id === sel)

  const loadBoms = useCallback(async () => {
    const { data, error } = await supabase.from('boms').select('id,reference,name,project,notes,updated_at').order('updated_at', { ascending: false })
    if (error) return setMsg({ ok: false, text: error.message })
    setBoms(data as Bom[])
    const want = new URLSearchParams(window.location.search).get('open')
    setSel((cur) => cur || data.find((b) => b.id === want)?.id || data[0]?.id || '')
  }, [])
  const loadLines = useCallback(async (id: string) => {
    if (!id) return setLines([])
    const { data, error } = await supabase.from('bom_items')
      .select('id,quantity,notes,product_code_snapshot,name_snapshot,products(material,pitch_mm,width_mm,source_page,verification_status,product_categories!category_id(name))')
      .eq('bom_id', id).order('product_code_snapshot')
    if (error) return setMsg({ ok: false, text: error.message })
    setLines((data as unknown as RawLine[]).map((r) => ({
      id: r.id, quantity: r.quantity, notes: r.notes, product_code: r.product_code_snapshot, name: r.name_snapshot,
      category: r.products?.product_categories?.name ?? null, material: r.products?.material ?? null, pitch_mm: r.products?.pitch_mm ?? null,
      width_mm: r.products?.width_mm ?? null, source_page: r.products?.source_page ?? null, verified: r.products?.verification_status === 'verified',
    })))
  }, [])
  useEffect(() => { void loadBoms() }, [loadBoms])
  useEffect(() => { void loadLines(sel) }, [sel, loadLines])
  useEffect(() => { setPicked(new Set()) }, [sel, lines])

  const fail = (e: { message: string } | null) => { if (e) setMsg({ ok: false, text: e.message }); return !e }
  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const { data, error } = await supabase.from('boms').insert({ name: name.trim() }).select('id').single()
    if (!fail(error)) return
    setName(''); await loadBoms(); setSel(data!.id)
  }
  const updateBom = async (change: Partial<Bom>) => { if (fail((await supabase.from('boms').update(change).eq('id', sel)).error)) await loadBoms() }
  const updateLine = async (id: string, change: { quantity?: number; notes?: string | null }) => { if (fail((await supabase.from('bom_items').update(change).eq('id', id)).error)) await loadLines(sel) }
  const removeLine = async (id: string) => { if (fail((await supabase.from('bom_items').delete().eq('id', id)).error)) await loadLines(sel) }
  const removeLines = async (ids: string[]) => {
    if (ids.length === 0) return setMsg({ ok: false, text: 'Select at least one line.' })
    if (!window.confirm(`Remove ${ids.length} line(s) from this BOM?`)) return
    if (fail((await supabase.from('bom_items').delete().in('id', ids)).error)) await loadLines(sel)
  }
  const removeBom = async () => {
    if (!window.confirm('Delete this BOM and all its lines?')) return
    if (fail((await supabase.from('boms').delete().eq('id', sel)).error)) { setSel(''); await loadBoms() }
  }
  const exportAs = async (kind: 'xlsx' | 'pdf') => {
    setBusy(true); setMsg(null)
    try { const d = await fetchExport(sel); await (kind === 'xlsx' ? exportExcel(d) : exportPdf(d)) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }

  const field = 'border border-steel-300 px-2 py-1 bg-white'
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold print:hidden">My BOM</h1>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
      <div className="flex flex-wrap gap-4 items-end print:hidden">
        {boms.length > 0 && <div><label htmlFor="bs" className="block text-sm font-medium">BOM</label>
          <select id="bs" className={`${field} py-2`} value={sel} onChange={(e) => setSel(e.target.value)}>{boms.map((b) => <option key={b.id} value={b.id}>{b.reference} {b.name}</option>)}</select></div>}
        <form onSubmit={create} className="flex gap-2 items-end">
          <div><label htmlFor="nn" className="block text-sm font-medium">New BOM</label><input id="nn" className={`${field} py-2`} value={name} maxLength={200} onChange={(e) => setName(e.target.value)} placeholder="Name" /></div>
          <button className="bg-belt-700 text-white px-4 py-2">Create</button>
        </form>
      </div>
      {boms.length === 0 && <p className="text-steel-600">No BOMs yet. Create one, then add products from their detail pages.</p>}

      {bom && (<>
        <section className="grid sm:grid-cols-3 gap-3 print:hidden">
          <div><label htmlFor="bn" className="block text-sm font-medium">Name</label><input id="bn" key={bom.id + bom.name} defaultValue={bom.name} maxLength={200} className={`${field} w-full`} onBlur={(e) => e.target.value.trim() && e.target.value !== bom.name && void updateBom({ name: e.target.value.trim() })} /></div>
          <div><label htmlFor="bp" className="block text-sm font-medium">Project</label><input id="bp" key={bom.id + 'p'} defaultValue={bom.project ?? ''} maxLength={200} className={`${field} w-full`} onBlur={(e) => e.target.value !== (bom.project ?? '') && void updateBom({ project: e.target.value.trim() || null })} /></div>
          <div><label htmlFor="bt" className="block text-sm font-medium">Notes</label><input id="bt" key={bom.id + 't'} defaultValue={bom.notes ?? ''} maxLength={2000} className={`${field} w-full`} onBlur={(e) => e.target.value !== (bom.notes ?? '') && void updateBom({ notes: e.target.value.trim() || null })} /></div>
        </section>

        <div className="hidden print:block">
          <p className="text-lg font-bold">Ultraplast Chainbelts Pvt. Ltd.: Bill of Materials</p>
          <p className="text-sm">Reference {bom.reference} | {bom.name} | Project: {na(bom.project)} | {new Date().toLocaleDateString()}</p>
        </div>

        {lines.length === 0 ? <p className="text-steel-600">This BOM is empty. Open a product and choose Add to BOM.</p> : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
              <span aria-live="polite">{picked.size} selected</span>
              <button className="border border-steel-300 bg-white px-3 py-1 hover:bg-steel-100" onClick={() => setPicked(new Set(lines.map((l) => l.id)))}>Select all lines</button>
              <button className="border border-steel-300 bg-white px-3 py-1 hover:bg-steel-100" onClick={() => setPicked(new Set())}>Clear</button>
              <button className="border border-steel-300 bg-white px-3 py-1 text-red-700 hover:bg-steel-100" onClick={() => void removeLines([...picked])}>Remove selected</button>
            </div>
            {groupByCategory(lines).map((g) => (
              <section key={g.category} aria-label={g.category}>
                <h2 className="font-semibold mb-1">{g.category}</h2>
                <div className="overflow-x-auto border border-steel-300 bg-white"><table className="w-full text-sm">
                  <thead className="bg-steel-100 text-left"><tr><th className="px-3 py-2 print:hidden"><span className="sr-only">Select</span></th>{['Code', 'Description', 'Qty', 'Material', 'Pitch', 'Width', 'Cat. page', 'Status', 'Notes', ''].map((h, i) => <th key={i} className="px-3 py-2">{h}</th>)}</tr></thead>
                  <tbody>{g.items.map((l) => (
                    <tr key={l.id} className="border-t border-steel-300 align-top">
                      <td className="px-3 py-2 print:hidden"><input type="checkbox" aria-label={`Select ${l.product_code}`} checked={picked.has(l.id)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n })} /></td>
                      <td className="px-3 py-2 font-mono">{l.product_code}</td><td className="px-3 py-2">{l.name}</td>
                      <td className="px-3 py-2"><input aria-label={`Quantity for ${l.product_code}`} type="number" min={1} max={100000} defaultValue={l.quantity} className={`${field} w-20 print:border-0`}
                        onBlur={(e) => { const q = Math.floor(Number(e.target.value)); if (q >= 1 && q <= 100000 && q !== l.quantity) void updateLine(l.id, { quantity: q }); else e.target.value = String(l.quantity) }} /></td>
                      <td className="px-3 py-2">{na(l.material)}</td><td className="px-3 py-2">{na(l.pitch_mm)}</td><td className="px-3 py-2">{na(l.width_mm)}</td><td className="px-3 py-2">{na(l.source_page)}</td>
                      <td className="px-3 py-2">{l.verified ? 'Verified' : 'Not verified'}</td>
                      <td className="px-3 py-2"><input aria-label={`Note for ${l.product_code}`} defaultValue={l.notes ?? ''} maxLength={1000} className={`${field} w-40 print:border-0`} onBlur={(e) => e.target.value !== (l.notes ?? '') && void updateLine(l.id, { notes: e.target.value.trim() || null })} /></td>
                      <td className="px-3 py-2 print:hidden"><button className="underline" onClick={() => void removeLine(l.id)}>Remove</button></td>
                    </tr>))}</tbody></table></div>
              </section>))}
            <p className="text-sm font-medium">Total quantity: {totalQuantity(lines)}</p>
            {lines.some((l) => !l.verified) && <p className="text-sm bg-amber-100 text-amber-950 px-3 py-2">Lines marked Not verified have not been checked against the original catalogue.</p>}
          </div>)}

        <div className="flex flex-wrap gap-2 print:hidden">
          {can('export_bom') ? (<>
            <button disabled={busy || lines.length === 0} onClick={() => void exportAs('xlsx')} className="border border-steel-300 bg-white px-4 py-2 hover:bg-steel-100 disabled:opacity-50">Export Excel</button>
            <button disabled={busy || lines.length === 0} onClick={() => void exportAs('pdf')} className="border border-steel-300 bg-white px-4 py-2 hover:bg-steel-100 disabled:opacity-50">Export PDF</button>
          </>) : <p className="text-sm text-steel-600">Your account does not have the BOM export permission.</p>}
          <button disabled={lines.length === 0} onClick={() => window.print()} className="border border-steel-300 bg-white px-4 py-2 hover:bg-steel-100 disabled:opacity-50">Print</button>
          <button onClick={() => void removeBom()} className="ml-auto text-red-700 underline">Delete BOM</button>
        </div>
      </>)}
    </div>
  )
}
