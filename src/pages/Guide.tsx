import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CircleHelp, FileDown, LayoutGrid, Link2, List, Printer, Search, ShoppingCart, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { listCategories } from '../lib/catalogue'
import { buildPages, findPage, guideUrl, pageIndexByCode, type GuideCat, type GuidePage, type GuideProd } from '../lib/format'
import { LOGO_DATA_URL } from '../lib/logo'
import { exportCategoryPdf, exportProductPdf } from '../lib/sharePdf'
import { useRfq } from '../lib/rfq'
import { Frame } from '../components/ImageViewer'
import { AddToRfqButton } from '../components/RfqDrawer'
import ShareBar from '../components/ShareBar'
import ProductDetail from './ProductDetail'

const PALETTE = ['#2f9e44', '#1d5a78', '#e3a008', '#8e44ad', '#c0392b', '#16a085', '#2c3e50', '#d35400']
const color = (i: number) => PALETTE[i % PALETTE.length]

/** First picture of each product, as short-lived signed links. */
async function thumbsFor(ids: string[]): Promise<Map<string, string>> {
  const first = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 100) {
    const r = await supabase.from('product_images').select('product_id,storage_path,sort_order').in('product_id', ids.slice(i, i + 100)).order('sort_order')
    for (const row of (r.data ?? []) as { product_id: string; storage_path: string }[]) if (!first.has(row.product_id)) first.set(row.product_id, row.storage_path)
  }
  const byPath = new Map<string, string>()
  for (const [pid, path] of first) byPath.set(path, pid)
  const out = new Map<string, string>()
  const paths = [...first.values()]
  for (let i = 0; i < paths.length; i += 100) {
    const s = await supabase.storage.from('product-images').createSignedUrls(paths.slice(i, i + 100), 3600)
    for (const u of s.data ?? []) { const pid = u.path ? byPath.get(u.path) : undefined; if (pid && u.signedUrl) out.set(pid, u.signedUrl) }
  }
  return out
}

/** The white "page" with the colour strip, page code, title and logo. */
function Sheet({ code, title, cats, currentCatId, onOpenCat, children }: { code: string; title: string; cats: GuideCat[]; currentCatId?: string; onOpenCat: (id: string) => void; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-5xl bg-white shadow-xl border border-steel-300 print:shadow-none">
      <div className="flex h-5 print:hidden" aria-label="Sections">
        {cats.map((c, i) => (
          <button key={c.id} title={c.name} aria-label={`Open ${c.name}`} onClick={() => onOpenCat(c.id)} className="flex-1 min-w-0 hover:opacity-100 focus-visible:opacity-100" style={{ background: color(i), opacity: c.id === currentCatId ? 1 : 0.45 }} />))}
      </div>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-steel-300">
        <span className="font-mono text-base sm:text-lg font-bold bg-steel-950 text-white px-3 py-1 tracking-widest">{code}</span>
        <h1 className="flex-1 min-w-0 text-base sm:text-xl font-bold uppercase tracking-wide truncate bg-steel-100 px-3 py-1">{title}</h1>
        <img src={LOGO_DATA_URL} alt="Ultraplast" className="h-8 w-auto hidden sm:block" />
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  )
}

/** General index: an original conveyor drawing with a clickable bubble for every category. */
function IndexPage({ cats, thumbs, open }: { cats: GuideCat[]; thumbs: Map<string, string>; open: (id: string) => void }) {
  if (cats.length === 0) return <p className="text-steel-600">No categories yet. An administrator can add them under Admin, Categories.</p>
  const top = cats.filter((_, i) => i % 2 === 0)
  const bottom = cats.filter((_, i) => i % 2 === 1)
  const r = Math.max(18, Math.min(40, 600 / Math.max(top.length, 1) / 2 - 6))
  const slot = (n: number, i: number) => 50 + (600 / n) * (i + 0.5)
  const midY = (x: number) => 438 - (x - 130) * (120 / 460)       // centre line of the belt
  const frontY = (x: number) => 476 - (x - 160) * (120 / 460)     // bottom edge of the front face
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
  const trunc = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  const max = r >= 30 ? 20 : 13
  const A = [100, 420], B = [560, 300], C = [620, 336], D = [160, 456]
  const lerp = (p: number[], q: number[], t: number) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
  const pt = (p: number[]) => `${p[0]},${p[1]}`
  const bubble = (c: GuideCat, x: number, y: number, anchorX: number, anchorY: number, fromY: number) => {
    const i = cats.indexOf(c); const col = color(i); const t = thumbs.get(c.id)
    return (
      <g key={c.id} role="link" tabIndex={0} aria-label={`Open ${c.name}`} className="cursor-pointer outline-none group" onClick={() => open(c.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(c.id) } }}>
        <title>{c.name}</title>
        <line x1={x} y1={fromY} x2={anchorX} y2={anchorY} stroke={col} strokeWidth="1.5" />
        <circle cx={anchorX} cy={anchorY} r="3.5" fill={col} />
        <clipPath id={`cp-${c.id}`}><circle cx={x} cy={y} r={r - 3} /></clipPath>
        <circle cx={x} cy={y} r={r} fill="#fff" stroke={col} strokeWidth="4" className="group-hover:stroke-[7px] group-focus-visible:stroke-[7px]" />
        {t ? <image href={t} x={x - r} y={y - r} width={r * 2} height={r * 2} clipPath={`url(#cp-${c.id})`} preserveAspectRatio="xMidYMid slice" />
          : <text x={x} y={y + 6} textAnchor="middle" fontSize={r * 0.7} fontWeight="700" fill={col}>{c.name.slice(0, 1).toUpperCase()}</text>}
        <text x={x} y={y + r + 15} textAnchor="middle" fontSize="11" fontWeight="700" className="fill-steel-950 group-hover:fill-brand-green">{trunc(c.name, max)}</text>
        <text x={x} y={y + r + 28} textAnchor="middle" fontSize="10" className="fill-steel-600" fontFamily="monospace">{`C${String(i + 1).padStart(2, '0')}`}</text>
      </g>
    )
  }
  return (
    <svg viewBox="0 0 700 720" role="group" aria-label="General index: choose a category" className="w-full h-auto">
      {[200, 380, 560].map((lx) => (<g key={lx}><line x1={lx} y1={frontY(lx)} x2={lx} y2={frontY(lx) + 95} stroke="#8a98a5" strokeWidth="8" /><ellipse cx={lx} cy={frontY(lx) + 97} rx="24" ry="7" fill="#27343f" /></g>))}
      <polygon points={`${pt(A)} ${pt([A[0], A[1] + 20])} ${pt([D[0], D[1] + 20])} ${pt(D)}`} fill="#1b2530" />
      <polygon points={`${pt(D)} ${pt(C)} ${pt([C[0], C[1] + 20])} ${pt([D[0], D[1] + 20])}`} fill="#27343f" />
      <polygon points={`${pt(A)} ${pt(B)} ${pt(C)} ${pt(D)}`} fill="#1d5a78" />
      {Array.from({ length: 26 }, (_, k) => { const s = (k + 1) / 27; const a = lerp(A, B, s), b = lerp(D, C, s); return <line key={k} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#2f7da3" strokeWidth="1" /> })}
      <polygon points={`${pt(A)} ${pt(B)} ${pt([B[0], B[1] - 10])} ${pt([A[0], A[1] - 10])}`} fill="#b9c3cb" />
      <polygon points={`${pt(D)} ${pt(C)} ${pt([C[0], C[1] - 12])} ${pt([D[0], D[1] - 12])}`} fill="#e8ecef" stroke="#b9c3cb" />
      <text x="350" y="90" textAnchor="middle" fontSize="13" className="fill-steel-600">Select a bubble to open a category. Use the arrows or the page code box above to turn pages.</text>
      {top.map((c, i) => { const x = slot(top.length, i); const ax = clamp(x, 170, 560); return bubble(c, x, 160, ax, midY(ax), 160 + r + 36) })}
      {bottom.map((c, i) => { const x = slot(bottom.length, i); const ax = clamp(x, 200, 560); return bubble(c, x, 640, ax, frontY(ax) + 30, 640 - r) })}
    </svg>
  )
}

function CategoryPage({ cat, prods, pages, onOpen, thumbsVersion }: { cat: GuideCat; prods: Map<string, GuideProd>; pages: GuidePage[]; onOpen: (id: string) => void; thumbsVersion: number }) {
  const [ids, setIds] = useState<string[] | null>(null)
  const [shown, setShown] = useState(60)
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let live = true
    setIds(null); setShown(60)
    ;(async () => {
      if (cat.id === 'other') { if (live) setIds(pages.filter((p) => p.kind === 'product' && p.categoryId === 'other').map((p) => p.id)); return }
      const { data } = await supabase.from('product_category_links').select('product_id').eq('category_id', cat.id).range(0, 999)
      const all = ((data ?? []) as { product_id: string }[]).map((r) => r.product_id).filter((id) => prods.has(id))
      all.sort((a, b) => (prods.get(a)!.code).localeCompare(prods.get(b)!.code, undefined, { numeric: true }))
      if (live) setIds(all)
    })()
    return () => { live = false }
  }, [cat.id, prods, pages])

  useEffect(() => {
    if (!ids) return
    let live = true
    thumbsFor(ids.slice(0, shown)).then((m) => live && setThumbs(m)).catch(() => undefined)
    return () => { live = false }
  }, [ids, shown, thumbsVersion])

  if (ids === null) return <p role="status" className="text-steel-600">Loading…</p>
  if (ids.length === 0) return <p className="text-steel-600">No published products in this category yet.</p>
  return (
    <div className="space-y-4">
      {cat.id !== 'other' && <ShareBar kind="category" id={cat.id} name={cat.name} />}
      <p className="text-sm text-steel-600">{ids.length} product{ids.length === 1 ? '' : 's'}</p>
      <ul className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {ids.slice(0, shown).map((id) => { const p = prods.get(id)!; return (
          <li key={id} className="flex flex-col border border-steel-300 rounded-md overflow-hidden bg-white hover:shadow-md transition">
            <button onClick={() => onOpen(id)} className="text-left p-2 space-y-1 flex-1"><Frame src={thumbs.get(id)} alt={p.name} /><span className="block text-sm font-semibold leading-snug">{p.name}</span><span className="block text-xs font-mono text-steel-600">{p.code}</span></button>
            <div className="px-2 pb-2"><AddToRfqButton id={id} code={p.code} name={p.name} /></div>
          </li>) })}
      </ul>
      {ids.length > shown && <button className="border border-steel-300 bg-white px-4 py-2 text-sm hover:bg-steel-100" onClick={() => setShown(shown + 60)}>Show more ({ids.length - shown} left)</button>}
    </div>
  )
}

export default function Guide() {
  const { kind, id } = useParams()
  const nav = useNavigate()
  const { can } = useAuth()
  const rfq = useRfq()
  const [cats, setCats] = useState<GuideCat[]>([])
  const [prods, setProds] = useState<GuideProd[]>([])
  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState('')
  const [panel, setPanel] = useState<'' | 'contents' | 'thumbs' | 'help' | 'share'>('')
  const [codeText, setCodeText] = useState('')
  const [codeBad, setCodeBad] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ id: string; code: string; name: string }[]>([])
  const [filter, setFilter] = useState('')
  const [notice, setNotice] = useState('')
  const [catThumbs, setCatThumbs] = useState<Map<string, string>>(new Map())
  const scroll = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const c = await listCategories()
        const all: GuideProd[] = []
        for (let from = 0; from < 5000; from += 1000) {
          const { data, error } = await supabase.from('products').select('id,product_code,name,category_id').eq('status', 'active').order('product_code').range(from, from + 999)
          if (error) throw new Error(error.message)
          const rows = data as { id: string; product_code: string; name: string; category_id: string | null }[]
          for (const r of rows) all.push({ id: r.id, code: r.product_code, name: r.name, categoryId: r.category_id })
          if (rows.length < 1000) break
        }
        if (live) { setCats(c.map((x) => ({ id: x.id, name: x.name }))); setProds(all); setLoaded(true) }
      } catch (e) { if (live) { setErr((e as Error).message); setLoaded(true) } }
    })()
    return () => { live = false }
  }, [])

  const pages = useMemo(() => buildPages(cats, prods), [cats, prods])
  const prodMap = useMemo(() => new Map(prods.map((p) => [p.id, p])), [prods])
  const idx = useMemo(() => { const i = findPage(pages, kind, id); return i < 0 ? 0 : i }, [pages, kind, id])
  const cur = pages[idx]
  const catList = useMemo(() => (pages.some((p) => p.id === 'other' && p.kind === 'category') ? [...cats, { id: 'other', name: 'Other products' }] : cats), [pages, cats])
  const currentCatId = cur?.kind === 'category' ? cur.id : cur?.categoryId

  useEffect(() => { if (cur) { setCodeText(cur.code); setCodeBad(false) } scroll.current?.scrollTo({ top: 0 }) }, [cur?.code, cur?.kind]) // eslint-disable-line react-hooks/exhaustive-deps

  // a picture for each category bubble on the index
  useEffect(() => {
    if (cats.length === 0) return
    let live = true
    const firstOf = new Map<string, string>()
    for (const p of prods) if (p.categoryId && !firstOf.has(p.categoryId)) firstOf.set(p.categoryId, p.id)
    thumbsFor([...firstOf.values()]).then((m) => { if (!live) return; const out = new Map<string, string>(); for (const [cid, pid] of firstOf) { const u = m.get(pid); if (u) out.set(cid, u) } setCatThumbs(out) }).catch(() => undefined)
    return () => { live = false }
  }, [cats, prods])

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return }
    let live = true
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_products', { p_q: q.trim(), p_limit: 8, p_offset: 0 })
      const items = (data as { items?: { id: string; product_code: string; name: string }[] } | null)?.items ?? []
      if (live) setResults(items.map((i) => ({ id: i.id, code: i.product_code, name: i.name })))
    }, 250)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  const go = useCallback((i: number) => { if (pages[i]) { nav(guideUrl(pages[i])); setPanel('') } }, [pages, nav])
  const openCat = (cid: string) => nav(cid === 'other' ? '/guide/c/other' : `/guide/c/${cid}`)
  const openProd = (pid: string) => nav(`/guide/p/${pid}`)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (document.querySelector('[role="dialog"]')) return
      if (e.key === 'ArrowRight') go(idx + 1)
      else if (e.key === 'ArrowLeft') go(idx - 1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [go, idx])

  const jump = () => {
    const i = pageIndexByCode(pages, codeText)
    if (i < 0) { setCodeBad(true); setNotice(`No page with the code "${codeText.trim()}". Try INDEX, C01 or a product code.`); return }
    setNotice(''); go(i)
  }
  const doPdf = async (mode: 'download' | 'print') => {
    if (!cur) return
    setNotice('')
    const pdfable = (cur.kind === 'product' || (cur.kind === 'category' && cur.id !== 'other')) && can('download_documents')
    if (!pdfable) { if (mode === 'print') window.print(); else setNotice(cur.kind === 'index' ? 'The general index has no PDF. Open a category or product.' : 'PDF is not available for this page or your account.'); return }
    const win = mode === 'print' ? window.open('', '_blank') : null
    win?.document.write('<p style="font-family:sans-serif;padding:24px">Preparing your document…</p>')
    try { await (cur.kind === 'category' ? exportCategoryPdf(cur.id, cur.title, mode, win) : exportProductPdf(cur.id, mode, win)) }
    catch (e) { win?.close(); setNotice((e as Error).message) }
  }

  const ib = 'p-2 text-white hover:bg-white/15 rounded disabled:opacity-40 focus-visible:bg-white/20'
  const filterNeedle = filter.trim().toLowerCase()
  const tree = useMemo(() => catList.map((c) => ({ c, items: pages.filter((p) => p.kind === 'product' && p.categoryId === c.id) })), [catList, pages])

  if (!loaded) return <p role="status" className="text-steel-600">Loading the guide…</p>
  if (err) return <p role="alert" className="text-red-700">{err}</p>

  return (
    <div className="relative flex flex-col h-[calc(100vh-10rem)] min-h-[560px] bg-steel-600 rounded-md overflow-hidden print:h-auto print:min-h-0 print:bg-white print:overflow-visible">
      <div className="flex flex-wrap items-center gap-1 sm:gap-2 bg-neutral-900 px-2 sm:px-3 py-2 print:hidden">
        <div className="relative">
          <div className="flex items-center bg-white rounded-sm">
            <Search size={16} className="ml-2 text-steel-600" aria-hidden />
            <label htmlFor="gq" className="sr-only">Search products</label>
            <input id="gq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products" className="w-40 sm:w-56 px-2 py-1.5 text-sm bg-transparent outline-none" />
            {q && <button aria-label="Clear search" className="px-2 text-steel-950" onClick={() => setQ('')}><X size={16} /></button>}
          </div>
          {results.length > 0 && (
            <ul className="absolute z-40 mt-1 w-72 bg-white border border-steel-300 rounded shadow-lg max-h-64 overflow-auto text-sm">
              {results.map((r) => <li key={r.id}><button className="w-full text-left px-3 py-2 hover:bg-belt-100" onClick={() => { setQ(''); openProd(r.id) }}><span className="font-mono">{r.code}</span> {r.name}</button></li>)}
            </ul>)}
        </div>
        <div className="flex items-center gap-0.5 sm:ml-2">
          <button className={ib} title="Contents" aria-label="Contents" aria-pressed={panel === 'contents'} onClick={() => setPanel(panel === 'contents' ? '' : 'contents')}><List size={22} /></button>
          <button className={ib} title="Thumbnails" aria-label="Thumbnails" aria-pressed={panel === 'thumbs'} onClick={() => setPanel(panel === 'thumbs' ? '' : 'thumbs')}><LayoutGrid size={22} /></button>
          <button className={ib} title="Download this page as PDF" aria-label="Download this page as PDF" onClick={() => void doPdf('download')}><FileDown size={22} /></button>
        </div>
        <div className="flex items-center gap-1 mx-auto">
          <button className={ib} title="Previous page" aria-label="Previous page" disabled={idx <= 0} onClick={() => go(idx - 1)}><ChevronLeft size={24} /></button>
          <label htmlFor="gc" className="sr-only">Page code</label>
          <input id="gc" value={codeText} onChange={(e) => { setCodeText(e.target.value); setCodeBad(false) }} onKeyDown={(e) => { if (e.key === 'Enter') jump() }} onFocus={(e) => e.currentTarget.select()} aria-invalid={codeBad}
            className={`w-28 sm:w-36 text-center font-mono text-sm py-1.5 rounded-sm ${codeBad ? 'bg-red-100 text-red-900' : 'bg-white text-steel-950'}`} />
          <button className={ib} title="Next page" aria-label="Next page" disabled={idx >= pages.length - 1} onClick={() => go(idx + 1)}><ChevronRight size={24} /></button>
        </div>
        <div className="flex items-center gap-0.5 relative">
          <button className={ib} title="Print this page" aria-label="Print this page" onClick={() => void doPdf('print')}><Printer size={22} /></button>
          <button className={ib} title="Share link" aria-label="Share link" aria-pressed={panel === 'share'} onClick={() => setPanel(panel === 'share' ? '' : 'share')}><Link2 size={22} /></button>
          <button className={ib} title="Help" aria-label="Help" aria-pressed={panel === 'help'} onClick={() => setPanel(panel === 'help' ? '' : 'help')}><CircleHelp size={22} /></button>
        </div>
        <button onClick={() => rfq.setOpen(true)} className="ml-auto flex items-center gap-2 bg-brand-green hover:opacity-90 text-white px-3 py-1.5 rounded-sm text-left">
          <ShoppingCart size={22} aria-hidden /><span className="text-xs leading-tight uppercase tracking-wide">Request for quotation<br /><b>{rfq.items.length} items</b></span>
        </button>
      </div>
      {notice && <p role="status" className="bg-amber-100 text-amber-950 text-sm px-3 py-1.5 print:hidden">{notice} <button className="underline ml-2" onClick={() => setNotice('')}>Dismiss</button></p>}

      <div className="relative flex-1 min-h-0 flex">
        {panel === 'contents' && (
          <aside aria-label="Contents" className="absolute inset-y-0 left-0 z-20 w-72 max-w-[85%] bg-white border-r border-steel-300 overflow-y-auto print:hidden">
            <div className="p-2 border-b border-steel-300 flex gap-2"><input aria-label="Filter contents" placeholder="Filter by name or code" value={filter} onChange={(e) => setFilter(e.target.value)} className="flex-1 border border-steel-300 px-2 py-1 text-sm" /><button aria-label="Close contents" onClick={() => setPanel('')}><X size={18} /></button></div>
            <button onClick={() => go(0)} className={`w-full text-left px-3 py-2 text-sm font-semibold hover:bg-belt-100 ${idx === 0 ? 'bg-belt-100' : ''}`}>INDEX · General index</button>
            {tree.map(({ c, items }, i) => {
              const visible = filterNeedle ? items.filter((p) => `${p.code} ${p.title}`.toLowerCase().includes(filterNeedle)) : items
              if (filterNeedle && visible.length === 0 && !c.name.toLowerCase().includes(filterNeedle)) return null
              const catPage = pages.findIndex((p) => p.kind === 'category' && p.id === c.id)
              return (
                <details key={c.id} open={Boolean(filterNeedle) || currentCatId === c.id} className="border-t border-steel-300">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold hover:bg-belt-100 flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color(i) }} />{c.name}<span className="text-xs text-steel-600">({items.length})</span></summary>
                  <ul className="text-sm">
                    <li><button onClick={() => go(catPage)} className={`w-full text-left pl-8 pr-3 py-1.5 hover:bg-belt-100 ${idx === catPage ? 'bg-belt-100 font-semibold' : ''}`}>All products in {c.name}</button></li>
                    {visible.map((p) => { const pi = pages.indexOf(p); return <li key={p.id}><button onClick={() => go(pi)} className={`w-full text-left pl-8 pr-3 py-1.5 hover:bg-belt-100 ${idx === pi ? 'bg-belt-100 font-semibold' : ''}`}><span className="font-mono text-xs text-steel-600">{p.code}</span> {p.title}</button></li> })}
                  </ul>
                </details>)
            })}
          </aside>)}

        {panel === 'thumbs' && (
          <div className="absolute inset-0 z-30 bg-steel-950/95 overflow-y-auto p-4 print:hidden" role="dialog" aria-modal="true" aria-label="Thumbnails">
            <div className="flex justify-between items-center text-white mb-3"><h2 className="font-semibold">All pages ({pages.length})</h2><button className="px-3 py-1 bg-white/15 rounded" onClick={() => setPanel('')}>Close ✕</button></div>
            <button onClick={() => go(0)} className="mb-3 bg-white rounded p-3 text-left w-48"><span className="block font-mono font-bold">INDEX</span><span className="text-sm">General index</span></button>
            {tree.map(({ c, items }, i) => {
              const catPage = pages.findIndex((p) => p.kind === 'category' && p.id === c.id)
              return (
                <section key={c.id} className="mb-4"><h3 className="text-white text-sm font-semibold mb-1 flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-full" style={{ background: color(i) }} />{c.name}</h3>
                  <ul className="grid gap-2 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
                    <li><button onClick={() => go(catPage)} className="w-full h-full text-left bg-white rounded p-2 border-t-4" style={{ borderColor: color(i) }}><span className="block font-mono text-xs font-bold">{pages[catPage]?.code}</span><span className="text-xs">All products</span></button></li>
                    {items.map((p) => <li key={p.id}><button onClick={() => go(pages.indexOf(p))} className="w-full h-full text-left bg-white rounded p-2 border-t-4" style={{ borderColor: color(i) }}><span className="block font-mono text-xs font-bold truncate">{p.code}</span><span className="text-xs line-clamp-2">{p.title}</span></button></li>)}
                  </ul></section>)
            })}
          </div>)}

        {panel === 'help' && (
          <div className="absolute inset-0 z-30 bg-black/60 grid place-items-center p-4 print:hidden" role="dialog" aria-modal="true" aria-label="Guide help">
            <div className="bg-white max-w-lg w-full rounded-md p-5 space-y-2 text-sm max-h-full overflow-y-auto">
              <div className="flex justify-between"><h2 className="font-semibold text-lg">Using the guide</h2><button onClick={() => setPanel('')} aria-label="Close help">✕</button></div>
              <ul className="space-y-1.5 list-disc pl-5">
                <li><b>Search:</b> type a code or name and pick a result.</li><li><b>List icon:</b> contents of every category and product.</li><li><b>Grid icon:</b> thumbnails of all pages.</li>
                <li><b>Arrows or page code box:</b> turn pages, or type INDEX, a category code like C01, or a product code and press Enter. The keyboard arrows also turn pages.</li>
                <li><b>PDF and printer icons:</b> download or print the page you are on.</li><li><b>Link icon:</b> copy a link to the page or a public customer link.</li>
                <li><b>Request for quotation:</b> add products with Add to quotation, then send the list to Ultraplast.</li><li><b>Click an image</b> on a product page to zoom in or out.</li>
              </ul>
              <p><Link className="underline" to="/help">Open the full Help page</Link></p>
            </div>
          </div>)}

        {panel === 'share' && cur && (
          <div className="absolute right-3 top-2 z-30 bg-white border border-steel-300 rounded-md shadow-xl p-3 max-w-sm print:hidden" role="dialog" aria-label="Share this page">
            <div className="flex justify-between mb-2"><h2 className="font-semibold text-sm">Share this page</h2><button onClick={() => setPanel('')} aria-label="Close">✕</button></div>
            {cur.kind === 'index'
              ? <button className="border border-steel-300 px-3 py-1 text-sm hover:bg-steel-100" onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}/guide`).then(() => setNotice('Link copied. It needs a sign-in to open.')) }}>Copy internal link</button>
              : <ShareBar kind={cur.kind === 'category' ? 'category' : 'product'} id={cur.id} name={cur.title} />}
          </div>)}

        <button className="hidden lg:grid absolute left-2 top-1/2 -translate-y-1/2 z-10 h-14 w-9 place-items-center bg-black/30 hover:bg-black/50 text-white rounded disabled:opacity-0 print:hidden" aria-label="Previous page" disabled={idx <= 0} onClick={() => go(idx - 1)}><ChevronLeft /></button>
        <button className="hidden lg:grid absolute right-2 top-1/2 -translate-y-1/2 z-10 h-14 w-9 place-items-center bg-black/30 hover:bg-black/50 text-white rounded disabled:opacity-0 print:hidden" aria-label="Next page" disabled={idx >= pages.length - 1} onClick={() => go(idx + 1)}><ChevronRight /></button>

        <div ref={scroll} className="flex-1 overflow-y-auto p-3 sm:p-6 lg:px-14 print:overflow-visible print:p-0">
          {cur && (
            <Sheet code={cur.code} title={cur.title} cats={catList} currentCatId={currentCatId} onOpenCat={openCat}>
              {cur.kind === 'index' && <IndexPage cats={cats} thumbs={catThumbs} open={openCat} />}
              {cur.kind === 'category' && <CategoryPage cat={{ id: cur.id, name: cur.title }} prods={prodMap} pages={pages} onOpen={openProd} thumbsVersion={0} />}
              {cur.kind === 'product' && <ProductDetail />}
            </Sheet>)}
        </div>
      </div>
    </div>
  )
}
