import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getFacets, searchProducts, type Facets, type ProductRow } from '../lib/catalogue'
import { PAGE_SIZE, pageCount, parseParams, show } from '../lib/format'
import { useCompare } from '../lib/compare'

export default function Catalogue() {
  const [sp, setSp] = useSearchParams()
  const cmp = useCompare()
  const params = parseParams(sp)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [data, setData] = useState<{ total: number; items: ProductRow[] } | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState(params.q)
  const key = sp.toString()

  useEffect(() => { getFacets().then(setFacets).catch(() => setFacets(null)) }, [])
  useEffect(() => {
    let live = true
    setData(null); setErr('')
    searchProducts(parseParams(new URLSearchParams(key))).then((d) => live && setData(d)).catch((e: Error) => live && setErr(e.message))
    return () => { live = false }
  }, [key])

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k))
    if (!('page' in changes)) next.delete('page')
    setSp(next)
  }
  const submit = (e: FormEvent) => { e.preventDefault(); update({ q: q.trim() }) }
  const sel = 'border border-steel-300 px-2 py-2 bg-white text-sm'
  const pages = data ? pageCount(data.total) : 1

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Product catalogue</h1>
      <form onSubmit={submit} role="search" className="flex flex-wrap gap-2">
        <label htmlFor="cq" className="sr-only">Search by code, name or specification</label>
        <input id="cq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name or specification" className="flex-1 min-w-48 border border-steel-300 px-3 py-2 bg-white" />
        <button className="bg-belt-700 hover:bg-belt-600 text-white px-4">Search</button>
      </form>
      <div className="flex flex-wrap gap-2 items-center">
        {facets && facets.categories.length > 0 && (
          <select aria-label="Category" className={sel} value={params.category} onChange={(e) => update({ category: e.target.value })}>
            <option value="">All categories</option>
            {facets.categories.map((c) => <option key={c.value} value={c.value}>{c.name} ({c.count})</option>)}
          </select>)}
        {facets && facets.brands.length > 0 && (
          <select aria-label="Brand" className={sel} value={params.brand} onChange={(e) => update({ brand: e.target.value })}>
            <option value="">All brands</option>
            {facets.brands.map((b) => <option key={b.value} value={b.value}>{b.value} ({b.count})</option>)}
          </select>)}
        {facets && facets.materials.length > 0 && (
          <select aria-label="Material" className={sel} value={params.material} onChange={(e) => update({ material: e.target.value })}>
            <option value="">All materials</option>
            {facets.materials.map((m) => <option key={m.value} value={m.value}>{m.value} ({m.count})</option>)}
          </select>)}
        <select aria-label="Sort by" className={`${sel} ml-auto`} value={params.sort} onChange={(e) => update({ sort: e.target.value })}>
          <option value="name">Sort: name</option><option value="code">Sort: product code</option><option value="category">Sort: category</option>
        </select>
        {(params.q || params.category || params.brand || params.material) && (
          <button className="text-sm underline" onClick={() => { setQ(''); setSp(new URLSearchParams()) }}>Clear filters</button>)}
      </div>

      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
      {!data && !err && <p role="status" className="text-steel-600">Loading products…</p>}
      {data && data.total === 0 && <p className="text-steel-600">No products found. Try a shorter code, or clear the filters. If the catalogue is still empty, products arrive with the catalogue import.</p>}
      {data && data.total > 0 && (<>
        <p className="text-sm text-steel-600" aria-live="polite">{data.total} product{data.total === 1 ? '' : 's'}</p>
        <ul className="grid gap-px bg-steel-300 border border-steel-300 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((p) => (
            <li key={p.id} className="bg-white">
              <Link to={`/products/${p.id}`} className="block px-4 py-3 hover:bg-belt-100">
                <span className="block font-mono text-sm">{p.product_code}</span>
                <span className="block font-medium">{p.name}</span>
                <span className="block text-sm text-steel-600">{show(p.category_name)} · {show(p.brand)}</span>
                {p.verification_status !== 'verified' && <span className="text-xs text-amber-900 bg-amber-100 px-1">Not yet verified</span>}
              </Link>
              <label className="flex items-center gap-2 px-4 pb-3 text-sm"><input type="checkbox" checked={cmp.ids.includes(p.id)} disabled={!cmp.ids.includes(p.id) && cmp.ids.length >= 4} onChange={() => cmp.toggle(p.id)} /> Compare</label>
            </li>
          ))}
        </ul>
        <nav aria-label="Pagination" className="flex items-center gap-3 text-sm">
          <button disabled={params.page <= 1} onClick={() => update({ page: String(params.page - 1) })} className="border border-steel-300 px-3 py-1 disabled:opacity-40">Previous</button>
          <span>Page {params.page} of {pages} ({PAGE_SIZE} per page)</span>
          <button disabled={params.page >= pages} onClick={() => update({ page: String(params.page + 1) })} className="border border-steel-300 px-3 py-1 disabled:opacity-40">Next</button>
        </nav>
      </>)}
    </div>
  )
}
