import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getFacets, searchProducts, type Facets, type ProductRow } from '../lib/catalogue'
import { PAGE_SIZE, pageCount, parseParams, show } from '../lib/format'
import { useCompare } from '../lib/compare'
import ShareBar from '../components/ShareBar'
import { Frame } from '../components/ImageViewer'
import { supabase } from '../lib/supabase'

export default function Catalogue() {
  const [sp, setSp] = useSearchParams()
  const cmp = useCompare()
  const params = parseParams(sp)
  const [facets, setFacets] = useState<Facets | null>(null)
  const [data, setData] = useState<{ total: number; items: ProductRow[] } | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState(params.q)
  const key = sp.toString()
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map())

  useEffect(() => { getFacets().then(setFacets).catch(() => setFacets(null)) }, [])
  useEffect(() => {
    let live = true
    setData(null); setErr('')
    searchProducts(parseParams(new URLSearchParams(key))).then((d) => live && setData(d)).catch((e: Error) => live && setErr(e.message))
    return () => { live = false }
  }, [key])

  useEffect(() => {
    if (!data || data.items.length === 0) { setThumbs(new Map()); return }
    let live = true
    ;(async () => {
      const ids = data.items.map((i) => i.id)
      const im = await supabase.from('product_images').select('product_id,storage_path,sort_order').in('product_id', ids).order('sort_order')
      const first = new Map<string, string>()
      for (const r of (im.data ?? []) as { product_id: string; storage_path: string }[]) if (!first.has(r.product_id)) first.set(r.product_id, r.storage_path)
      if (first.size === 0) return live ? setThumbs(new Map()) : undefined
      const signed = await supabase.storage.from('product-images').createSignedUrls([...first.values()], 3600)
      const byPath = new Map<string, string>()
      for (const u of signed.data ?? []) if (u.signedUrl && u.path) byPath.set(u.path, u.signedUrl)
      const out = new Map<string, string>()
      for (const [pid, path] of first) { const u = byPath.get(path); if (u) out.set(pid, u) }
      if (live) setThumbs(out)
    })()
    return () => { live = false }
  }, [data])

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k))
    if (!('page' in changes)) next.delete('page')
    setSp(next)
  }
  const submit = (e: FormEvent) => { e.preventDefault(); update({ q: q.trim() }) }
  const sel = 'border border-steel-300 px-2 py-2 bg-white text-sm w-full'
  const pages = data ? pageCount(data.total) : 1
  const activeCat = facets?.categories.find((c) => c.value === params.category)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Product catalogue</h1>
      <form onSubmit={submit} role="search" className="flex flex-wrap gap-2">
        <label htmlFor="cq" className="sr-only">Search by code, name or specification</label>
        <input id="cq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, name or specification" className="flex-1 min-w-48 border border-steel-300 px-3 py-2 bg-white" />
        <button className="bg-belt-700 hover:bg-belt-600 text-white px-4">Search</button>
      </form>

      {params.category && activeCat && <ShareBar kind="category" id={params.category} name={activeCat.name} />}

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside aria-label="Filters" className="print:hidden space-y-4 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <details open className="border border-steel-300 bg-white">
            <summary className="px-3 py-2 font-semibold cursor-pointer">Categories</summary>
            <ul className="text-sm max-h-80 overflow-auto">
              <li><button onClick={() => update({ category: '' })} className={`w-full text-left px-3 py-2 hover:bg-belt-100 ${!params.category ? 'font-semibold bg-belt-100' : ''}`}>All products</button></li>
              {facets?.categories.map((c) => (
                <li key={c.value}><button onClick={() => update({ category: c.value })} className={`w-full text-left px-3 py-2 hover:bg-belt-100 ${params.category === c.value ? 'font-semibold bg-belt-100' : ''}`}>{c.name} <span className="text-steel-600">({c.count})</span></button></li>))}
            </ul>
          </details>
          {facets && facets.brands.length > 0 && (<div><label htmlFor="fb" className="block text-sm font-medium">Brand</label>
            <select id="fb" className={sel} value={params.brand} onChange={(e) => update({ brand: e.target.value })}><option value="">All brands</option>{facets.brands.map((b) => <option key={b.value} value={b.value}>{b.value} ({b.count})</option>)}</select></div>)}
          {facets && facets.materials.length > 0 && (<div><label htmlFor="fm" className="block text-sm font-medium">Material</label>
            <select id="fm" className={sel} value={params.material} onChange={(e) => update({ material: e.target.value })}><option value="">All materials</option>{facets.materials.map((m) => <option key={m.value} value={m.value}>{m.value} ({m.count})</option>)}</select></div>)}
          <div><label htmlFor="fs" className="block text-sm font-medium">Sort by</label>
            <select id="fs" className={sel} value={params.sort} onChange={(e) => update({ sort: e.target.value })}><option value="name">Name</option><option value="code">Product code</option><option value="category">Category</option></select></div>
          {(params.q || params.category || params.brand || params.material) && <button className="text-sm underline" onClick={() => { setQ(''); setSp(new URLSearchParams()) }}>Clear filters</button>}
        </aside>

        <section aria-label="Results" className="space-y-3">
          {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
          {!data && !err && <p role="status" className="text-steel-600">Loading products…</p>}
          {data && data.total === 0 && <p className="text-steel-600">No products found. Try a shorter code or clear the filters. If the catalogue is still empty, an administrator needs to import and publish products.</p>}
          {data && data.total > 0 && (<>
            <p className="text-sm text-steel-600" aria-live="polite">{data.total} product{data.total === 1 ? '' : 's'}{activeCat ? ` in ${activeCat.name}` : ''}</p>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.items.map((p) => (
                <li key={p.id} className="flex flex-col bg-white border border-steel-300 rounded-md shadow-sm hover:shadow-md transition overflow-hidden">
                  <Link to={`/products/${p.id}`} className="block p-3 space-y-2 flex-1">
                    <Frame src={thumbs.get(p.id)} alt={p.name} />
                    <span className="block font-semibold leading-snug">{p.name}</span>
                    <span className="block text-sm font-mono text-steel-600">{p.product_code}</span>
                    <span className="block text-xs text-steel-600">{show(p.category_name)}</span>
                    {p.verification_status !== 'verified' && <span className="inline-block text-xs text-amber-900 bg-amber-100 px-1">Not yet verified</span>}
                  </Link>
                  <label className="flex items-center gap-2 px-3 py-2 border-t border-steel-300 text-sm"><input type="checkbox" checked={cmp.ids.includes(p.id)} disabled={!cmp.ids.includes(p.id) && cmp.ids.length >= 4} onChange={() => cmp.toggle(p.id)} /> Compare</label>
                </li>))}
            </ul>
            <nav aria-label="Pagination" className="flex items-center gap-3 text-sm">
              <button disabled={params.page <= 1} onClick={() => update({ page: String(params.page - 1) })} className="border border-steel-300 px-3 py-1 disabled:opacity-40">Previous</button>
              <span>Page {params.page} of {pages} ({PAGE_SIZE} per page)</span>
              <button disabled={params.page >= pages} onClick={() => update({ page: String(params.page + 1) })} className="border border-steel-300 px-3 py-1 disabled:opacity-40">Next</button>
            </nav>
          </>)}
        </section>
      </div>
    </div>
  )
}
