import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCompare } from '../lib/compare'
import { na } from '../lib/bom'

interface P {
  id: string; product_code: string; name: string; brand: string | null; material: string | null; pitch_mm: number | null; width_mm: number | null
  thickness_mm: number | null; colour: string | null; application: string | null; source_page: number | null; verification_status: string
  product_categories: { name: string } | null; catalogues: { name: string } | null
  product_specifications: { spec_key: string; spec_value: string; unit: string | null }[]
}

export default function Compare() {
  const { ids, toggle, clear } = useCompare()
  const [items, setItems] = useState<P[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (ids.length === 0) { setItems([]); return }
    let live = true
    supabase.from('products')
      .select('id,product_code,name,brand,material,pitch_mm,width_mm,thickness_mm,colour,application,source_page,verification_status,product_categories(name),catalogues(name),product_specifications(spec_key,spec_value,unit)')
      .in('id', ids).then(({ data, error }) => {
        if (!live) return
        if (error) return setErr(error.message)
        setItems(ids.flatMap((id) => (data as unknown as P[]).filter((p) => p.id === id)))
      })
    return () => { live = false }
  }, [ids])

  if (err) return <p role="alert" className="text-red-700">{err}</p>
  if (!items) return <p role="status" className="text-steel-600">Loading…</p>
  if (items.length === 0) return <div><h1 className="text-2xl font-bold">Product comparison</h1><p className="mt-2 text-steel-600">Nothing selected. Tick Compare on products in the <Link className="underline" to="/catalogue">catalogue</Link> (up to 4).</p></div>

  const unit = (v: string | number | null, u: string) => (v === null ? null : `${v} ${u}`)
  const fixed: [string, (p: P) => string | null][] = [
    ['Name', (p) => p.name], ['Category', (p) => p.product_categories?.name ?? null], ['Brand', (p) => p.brand], ['Material', (p) => p.material],
    ['Pitch', (p) => unit(p.pitch_mm, 'mm')], ['Width', (p) => unit(p.width_mm, 'mm')], ['Thickness', (p) => unit(p.thickness_mm, 'mm')],
    ['Colour', (p) => p.colour], ['Application', (p) => p.application], ['Catalogue', (p) => p.catalogues?.name ?? null], ['Catalogue page', (p) => (p.source_page === null ? null : String(p.source_page))],
    ['Data status', (p) => (p.verification_status === 'verified' ? 'Verified' : 'Not verified')],
  ]
  const keys = [...new Set(items.flatMap((p) => p.product_specifications.map((s) => s.spec_key)))].sort()
  const spec = (p: P, k: string) => { const s = p.product_specifications.find((x) => x.spec_key === k); return s ? `${s.spec_value}${s.unit ? ` ${s.unit}` : ''}` : null }
  const rows: [string, (string | null)[]][] = [
    ...fixed.map(([l, f]) => [l, items.map(f)] as [string, (string | null)[]]),
    ...keys.map((k) => [k, items.map((p) => spec(p, k))] as [string, (string | null)[]]),
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Product comparison</h1><button onClick={clear} className="underline text-sm">Clear all</button></div>
      {items.some((p) => p.verification_status !== 'verified') && <p className="text-sm bg-amber-100 text-amber-950 px-3 py-2">Some products have not been verified against the original catalogue. Check the source page before relying on a value. Rows with differences are shaded.</p>}
      <div className="overflow-x-auto border border-steel-300 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-steel-100 text-left"><tr><th className="px-3 py-2">Field</th>{items.map((p) => (
            <th key={p.id} className="px-3 py-2 align-top"><Link className="underline font-mono" to={`/products/${p.id}`}>{p.product_code}</Link><br /><button className="font-normal underline text-steel-600" onClick={() => toggle(p.id)}>Remove</button></th>))}</tr></thead>
          <tbody>{rows.map(([label, vals]) => {
            const differs = new Set(vals.map((v) => v ?? '')).size > 1
            return <tr key={label} className={`border-t border-steel-300 ${differs ? 'bg-belt-100' : ''}`}><th scope="row" className="text-left px-3 py-2 font-medium">{label}</th>{vals.map((v, i) => <td key={i} className="px-3 py-2">{na(v)}</td>)}</tr>
          })}</tbody>
        </table>
      </div>
    </div>
  )
}
