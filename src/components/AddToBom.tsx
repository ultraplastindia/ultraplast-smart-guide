import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { MAX_COMPARE, useCompare } from '../lib/compare'

export function CompareToggle({ id, hideLinks = false }: { id: string; hideLinks?: boolean }) {
  const { ids, toggle } = useCompare()
  const on = ids.includes(id)
  return (
    <div className="text-sm">
      <button onClick={() => toggle(id)} disabled={!on && ids.length >= MAX_COMPARE} className="border border-steel-300 bg-white px-3 py-2 hover:bg-steel-100 disabled:opacity-50">
        {on ? 'Remove from comparison' : 'Add to comparison'}
      </button>
      {!hideLinks && ids.length > 0 && <Link to="/compare" className="ml-3 underline">Compare {ids.length}</Link>}
      {!on && ids.length >= MAX_COMPARE && <p className="text-steel-600 mt-1">You can compare up to {MAX_COMPARE} products.</p>}
    </div>
  )
}

export default function AddToBom({ productId, hideLinks = false }: { productId: string; hideLinks?: boolean }) {
  const [boms, setBoms] = useState<{ id: string; name: string; reference: string }[]>([])
  const [bom, setBom] = useState('')
  const [qty, setQty] = useState(1)
  const [newName, setNewName] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('boms').select('id,name,reference').order('updated_at', { ascending: false }).then(({ data }) => {
      setBoms(data ?? []); if (data?.length) setBom(data[0].id)
    })
  }, [])

  const add = async () => {
    setBusy(true); setMsg(null)
    try {
      let target = bom
      if (!target) {
        const name = newName.trim()
        if (!name) throw new Error('Enter a name for the new BOM.')
        const ins = await supabase.from('boms').insert({ name }).select('id,name,reference').single()
        if (ins.error) throw new Error(ins.error.message)
        target = ins.data.id; setBoms([ins.data]); setBom(target)
      }
      const { error } = await supabase.rpc('add_to_bom', { p_bom: target, p_product: productId, p_qty: qty })
      if (error) throw new Error(error.message)
      setMsg({ ok: true, text: 'Added to BOM.' })
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }

  const f = 'w-full rounded-sm border border-steel-300 bg-white px-3 py-2 text-sm focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30'
  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-steel-800">Add to a bill of materials</p>
      <div className="grid grid-cols-[1fr_5rem] items-end gap-2">
        {boms.length > 0 ? (
          <div><label htmlFor="ab" className="mb-1 block text-xs font-medium text-steel-800">BOM</label>
            <select id="ab" className={f} value={bom} onChange={(e) => setBom(e.target.value)}>{boms.map((b) => <option key={b.id} value={b.id}>{b.reference} {b.name}</option>)}</select></div>
        ) : (
          <div><label htmlFor="nb" className="mb-1 block text-xs font-medium text-steel-800">New BOM name</label>
            <input id="nb" className={f} value={newName} maxLength={200} placeholder="For example: Line 3 conveyor" onChange={(e) => setNewName(e.target.value)} /></div>)}
        <div><label htmlFor="aq" className="mb-1 block text-xs font-medium text-steel-800">Qty</label>
          <input id="aq" type="number" min={1} max={100000} className={`${f} text-center`} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100000, Number(e.target.value) || 1)))} /></div>
      </div>
      <button onClick={() => void add()} disabled={busy} className="w-full rounded-sm bg-belt-700 px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-60">{busy ? 'Adding…' : 'Add to BOM'}</button>
      {msg && <p role="status" className={msg.ok ? 'text-green-800' : 'text-red-700'}>{msg.text} {msg.ok && !hideLinks && <Link className="underline" to="/bom">Open BOM</Link>}</p>}
    </div>
  )
}
