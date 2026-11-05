import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CircleHelp, FileDown, LayoutGrid, Link2, List, Printer, Search, ShoppingCart, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { listCategories, thumbsFor } from '../lib/catalogue'
import { buildPages, categoryCode, findPage, guideUrl, pageIndexByCode, type GuideCat, type GuidePage, type GuideProd } from '../lib/format'
import { LOGO_DATA_URL } from '../lib/logo'
import { exportCategoryPdf, exportProductPdf } from '../lib/sharePdf'
import { useRfq } from '../lib/rfq'
import { CodeBoxes, Frame } from '../components/ImageViewer'
import { AddToRfqButton } from '../components/RfqDrawer'
import ShareBar from '../components/ShareBar'
import ProductDetail from './ProductDetail'

const PALETTE = ['#2f9e44', '#1d5a78', '#e3a008', '#8e44ad', '#c0392b', '#16a085', '#2c3e50', '#d35400']
const color = (i: number) => PALETTE[i % PALETTE.length]

/** The white "page": a grid of clickable tabs, the page code, a title bar and the logo. */
function Sheet({ code, title, cats, currentCatId, accent, onOpenCat, onOpenIndex, narrow, children }: {
  code: string; title: string; cats: GuideCat[]; currentCatId?: string; accent: string; onOpenCat: (id: string) => void; onOpenIndex: () => void; narrow?: boolean; children: ReactNode
}) {
  return (
    <div className={`mx-auto w-full ${narrow ? 'max-w-3xl' : 'max-w-5xl'} bg-white shadow-xl border border-steel-300 print:shadow-none`} style={{ borderLeft: `6px solid ${accent}`, borderRight: `6px solid ${accent}` }}>
      <div className="px-3 pt-3">
        <div role="navigation" aria-label="Sections" className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-px bg-steel-300 border border-steel-300 print:hidden">
          <div className="bg-white"><button onClick={onOpenIndex} className={`w-full h-9 text-left px-2 border-l-4 border-steel-950 text-[10px] sm:text-[11px] leading-tight font-bold ${code === 'INDEX' ? 'bg-steel-950 text-white' : 'bg-steel-100 text-steel-950 hover:brightness-95'}`}>INDEX</button></div>
          {cats.map((c, i) => {
            const active = c.id === currentCatId
            return (
              <div key={c.id} className="bg-white">
                <button title={c.name} onClick={() => onOpenCat(c.id)} aria-current={active} style={{ borderLeftColor: color(i), background: active ? color(i) : `${color(i)}22` }}
                  className={`w-full h-9 text-left px-2 border-l-4 text-[10px] sm:text-[11px] leading-tight font-semibold overflow-hidden ${active ? 'text-white' : 'text-steel-950 hover:brightness-95'}`}>{c.name}</button>
              </div>)
          })}
        </div>
      </div>
      <div className="flex items-end gap-3 px-3 py-3 border-b border-steel-300">
        <div className="shrink-0"><CodeBoxes code={code} big /><a href="https://www.ultraplastindia.com/" target="_blank" rel="noopener noreferrer" className="block text-[10px] text-brand-green underline mt-0.5 print:hidden">www.ultraplastindia.com</a></div>
        <div className="flex-1 min-w-0 border-y-2 px-3 py-1" style={{ background: `${accent}33`, borderColor: accent }}><h1 className="text-right text-base sm:text-xl font-bold uppercase tracking-wide truncate">{title}</h1></div>
        <img src={LOGO_DATA_URL} alt="Ultraplast" className="h-8 w-auto hidden sm:block shrink-0" />
      </div>
      {code !== 'INDEX' && (
        <div className="px-3 pt-2 text-[11px] text-steel-600 flex items-center gap-2 print:hidden">
          <span>For general index, go to:</span>
          <button onClick={onOpenIndex} aria-label="Go to the general index" className="inline-flex"><CodeBoxes code="INDEX" /></button>
        </div>)}
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  )
}

// Original isometric conveyor (an arch: one belt rising to the right, then turning down to the right).
const KS = 0.95, CK = 0.866 * KS, SK = 0.5 * KS
const LA = 300, LB = 250, WD = 66, ZT = 74, ZB = 58
const raw = (x: number, y: number, z: number): [number, number] => [(x + y) * CK, (y - x) * SK - z]
const BOX = (() => {
  const p = [0, LA].flatMap((x) => [0, LB].flatMap((y) => [0, ZT + 14].map((z) => raw(x, y, z))))
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1])
  return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 }
})()
const P3 = (x: number, y: number, z: number): [number, number] => { const [a, b] = raw(x, y, z); return [350 - BOX.cx + a, 495 - BOX.cy + b] }
const poly = (list: [number, number, number][]) => list.map(([x, y, z]) => P3(x, y, z).map((v) => v.toFixed(1)).join(',')).join(' ')
const wrapName = (name: string, n = 14): string[] => {
  const lines: string[] = ['']
  for (const w of name.split(/\s+/)) {
    const cand = `${lines[lines.length - 1]} ${w}`.trim()
    if (cand.length > n && lines[lines.length - 1]) lines.push(w); else lines[lines.length - 1] = cand
  }
  const out = lines.slice(0, 2)
  if (lines.length > 2 || (out[1] && out[1].length > n)) out[1] = `${out[1].slice(0, n - 1)}…`
  if (out[0].length > n + 4) out[0] = `${out[0].slice(0, n + 3)}…`
  return out
}
function CodeSvg({ code, x, y }: { code: string; x: number; y: number }) {
  const w = 12, gap = 2, total = code.length * (w + gap) - gap
  return (
    <g aria-hidden="true">{[...code].map((ch, i) => (
      <g key={i}><rect x={x - total / 2 + i * (w + gap)} y={y} width={w} height={16} fill="#f4f6f7" stroke="#4a5b69" strokeWidth="1.2" />
        <text x={x - total / 2 + i * (w + gap) + w / 2} y={y + 12} textAnchor="middle" fontSize="10" fontWeight="700" fontFamily="monospace" className="fill-steel-950">{ch}</text></g>))}</g>
  )
}

/** General index: bubbles around an original conveyor. Bubble, name, code box, line and dot all open the category. */
function IndexPage({ cats, thumbs, open }: { cats: GuideCat[]; thumbs: Map<string, string>; open: (id: string) => void }) {
  if (cats.length === 0) return <p className="text-steel-600">No categories yet. An administrator can add them under Admin, Categories.</p>
  const nT = Math.ceil(cats.length / 2)
  const top = cats.slice(0, nT)
  const bottom = cats.slice(nT)
  const rOf = (n: number) => Math.max(22, Math.min(44, 560 / Math.max(n, 1) / 2 - 10))
  const arcTop = (x: number) => 170 + 90 * ((x - 350) / 280) ** 2
  const arcBot = (x: number) => 780 - 70 * (1 - ((x - 350) / 280) ** 2)
  const topAnchor = (t: number): [number, number] => { const l1 = LA - WD / 2, l2 = LB - WD / 2; const u = t * (l1 + l2); return u <= l1 ? [u, WD / 2] : [LA - WD / 2, WD / 2 + (u - l1)] }
  const frontAnchor = (t: number): [number, number] => { const l1 = LA - WD, l2 = LB - WD; const u = t * (l1 + l2); return u <= l1 ? [u, WD] : [LA - WD, WD + (u - l1)] }

  const bubble = (c: GuideCat, x: number, y: number, r: number, isTop: boolean, anchorT: number) => {
    const gi = cats.indexOf(c); const col = color(gi); const img = thumbs.get(c.id)
    const lines = wrapName(c.name); const labelY = y + r + 14; const codeY = labelY + lines.length * 12 + 2
    const [ax, ay] = isTop ? P3(...topAnchor(anchorT), ZT) : P3(...frontAnchor(anchorT), 30)
    const lineFrom = isTop ? codeY + 18 : y - r
    return (
      <g key={c.id} role="link" tabIndex={0} aria-label={`Open ${c.name}, page ${categoryCode(gi)}`} className="cursor-pointer outline-none group" onClick={() => open(c.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(c.id) } }}>
        <title>{c.name}</title>
        <line x1={x} y1={lineFrom} x2={ax} y2={ay} stroke={col} strokeWidth="2" />
        <circle cx={ax} cy={ay} r="4" fill={col} />
        <clipPath id={`cp-${c.id}`}><circle cx={x} cy={y} r={r - 3} /></clipPath>
        <circle cx={x} cy={y} r={r} fill="#fff" stroke={col} strokeWidth="4" className="group-hover:stroke-[7px] group-focus-visible:stroke-[7px]" />
        {img ? <image href={img} x={x - r} y={y - r} width={r * 2} height={r * 2} clipPath={`url(#cp-${c.id})`} preserveAspectRatio="xMidYMid slice" />
          : <text x={x} y={y + r * 0.25} textAnchor="middle" fontSize={r * 0.8} fontWeight="700" fill={col}>{c.name.slice(0, 1).toUpperCase()}</text>}
        {lines.map((l, i) => <text key={i} x={x} y={labelY + i * 12} textAnchor="middle" fontSize="11" fontWeight="700" className="fill-steel-950 group-hover:fill-brand-green">{l}</text>)}
        <CodeSvg code={categoryCode(gi)} x={x} y={codeY} />
      </g>
    )
  }

  const legs: [number, number][] = [[40, WD], [160, WD], [LA - WD, WD + 60], [LA - WD, WD + 150], [LA - WD, LB - 20]]
  return (
    <svg viewBox="0 0 700 900" role="group" aria-label="General index: choose a category" className="w-full h-auto">
      <rect x="24" y="20" width="230" height="64" rx="8" fill="none" stroke="#b9c3cb" />
      <text x="38" y="44" fontSize="12" fontWeight="600" className="fill-steel-600">Select a bubble, a tab or a page</text>
      <text x="38" y="62" fontSize="12" fontWeight="600" className="fill-steel-600">code to open that category.</text>
      {legs.map(([x, y], i) => { const a = P3(x, y, 0), b = P3(x, y, ZB); return (<g key={i}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#8a98a5" strokeWidth="7" /><ellipse cx={a[0]} cy={a[1]} rx="14" ry="4" fill="#27343f" /></g>) })}
      <polygon points={poly([[0, WD, ZB], [LA - WD, WD, ZB], [LA - WD, WD, ZT], [0, WD, ZT]])} fill="#27343f" />
      <polygon points={poly([[0, 0, ZB], [0, WD, ZB], [0, WD, ZT], [0, 0, ZT]])} fill="#1b2530" />
      <polygon points={poly([[LA - WD, WD, ZB], [LA - WD, LB, ZB], [LA - WD, LB, ZT], [LA - WD, WD, ZT]])} fill="#27343f" />
      <polygon points={poly([[LA - WD, LB, ZB], [LA, LB, ZB], [LA, LB, ZT], [LA - WD, LB, ZT]])} fill="#1b2530" />
      <polygon points={poly([[0, 0, ZT], [LA, 0, ZT], [LA, WD, ZT], [0, WD, ZT]])} fill="#1d5a78" />
      <polygon points={poly([[LA - WD, 0, ZT], [LA, 0, ZT], [LA, LB, ZT], [LA - WD, LB, ZT]])} fill="#1d5a78" />
      {Array.from({ length: 23 }, (_, i) => { const x = ((i + 1) * (LA - WD)) / 24; const a = P3(x, 0, ZT), b = P3(x, WD, ZT); return <line key={`a${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#2f7da3" strokeWidth="1" /> })}
      {Array.from({ length: 17 }, (_, i) => { const y = WD + ((i + 1) * (LB - WD)) / 18; const a = P3(LA - WD, y, ZT), b = P3(LA, y, ZT); return <line key={`b${i}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#2f7da3" strokeWidth="1" /> })}
      <polygon points={poly([[0, 0, ZT], [LA, 0, ZT], [LA, 0, ZT + 14], [0, 0, ZT + 14]])} fill="#b9c3cb" stroke="#8a98a5" />
      <polygon points={poly([[LA, 0, ZT], [LA, LB, ZT], [LA, LB, ZT + 14], [LA, 0, ZT + 14]])} fill="#b9c3cb" stroke="#8a98a5" />
      <polygon points={poly([[0, WD, ZT], [LA - WD, WD, ZT], [LA - WD, WD, ZT + 14], [0, WD, ZT + 14]])} fill="#e8ecef" stroke="#8a98a5" />
      <polygon points={poly([[LA - WD, WD, ZT], [LA - WD, LB, ZT], [LA - WD, LB, ZT + 14], [LA - WD, WD, ZT + 14]])} fill="#e8ecef" stroke="#8a98a5" />
      {top.map((c, i) => { const step = 560 / top.length; const x = 70 + step * (i + 0.5); return bubble(c, x, arcTop(x), rOf(top.length), true, (i + 0.5) / top.length) })}
      {bottom.map((c, i) => { const step = 560 / bottom.length; const x = 70 + step * (i + 0.5); return bubble(c, x, arcBot(x), rOf(bottom.length), false, (i + 0.5) / bottom.length) })}
    </svg>
  )
}

interface GuideDetail { id: string; brand: string | null; material: string | null; pitch_mm: number | null; width_mm: number | null; thickness_mm: number | null }
const CELL_LINK = 'underline decoration-dotted underline-offset-2 hover:text-brand-green'

function CategoryPage({ cat, prods, pages, onOpen, thumbsVersion }: { cat: GuideCat; prods: Map<string, GuideProd>; pages: GuidePage[]; onOpen: (id: string) => void; thumbsVersion: number }) {
  const rfq = useRfq()
  const [ids, setIds] = useState<string[] | null>(null)
  const [shown, setShown] = useState(60)
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map())
  const [view, setView] = useState<'cards' | 'table'>('cards')
  const [details, setDetails] = useState<Map<string, GuideDetail>>(new Map())
  const [related, setRelated] = useState<{ id: string; name: string; code: string; n: number }[]>([])

  useEffect(() => {
    let live = true
    setIds(null); setShown(60); setDetails(new Map()); setRelated([])
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

  // values for the table view (material, pitch, width, thickness)
  useEffect(() => {
    if (view !== 'table' || !ids) return
    let live = true
    ;(async () => {
      const m = new Map<string, GuideDetail>()
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('products').select('id,brand,material,pitch_mm,width_mm,thickness_mm').in('id', ids.slice(i, i + 100))
        for (const r of (data ?? []) as GuideDetail[]) m.set(r.id, r)
      }
      if (live) setDetails(m)
    })()
    return () => { live = false }
  }, [view, ids])

  // related catalogues: other categories that share products with this one
  useEffect(() => {
    if (!ids || ids.length === 0 || cat.id === 'other') return
    let live = true
    ;(async () => {
      const counts = new Map<string, number>()
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('product_category_links').select('category_id').in('product_id', ids.slice(i, i + 100)).neq('category_id', cat.id)
        for (const r of (data ?? []) as { category_id: string }[]) counts.set(r.category_id, (counts.get(r.category_id) ?? 0) + 1)
      }
      const list = [...counts.entries()].flatMap(([cid, n]) => { const pg = pages.find((p) => p.kind === 'category' && p.id === cid); return pg ? [{ id: cid, name: pg.title, code: pg.code, n }] : [] })
      if (live) setRelated(list.sort((a, b) => b.n - a.n).slice(0, 12))
    })()
    return () => { live = false }
  }, [ids, cat.id, pages])

  if (ids === null) return <p role="status" className="text-steel-600">Loading…</p>
  if (ids.length === 0) return <p className="text-steel-600">No published products in this category yet.</p>
  const tab = (v: 'cards' | 'table', label: string) => <button aria-pressed={view === v} onClick={() => setView(v)} className={`px-3 py-1 text-sm border border-steel-300 ${view === v ? 'bg-steel-950 text-white' : 'bg-white hover:bg-steel-100'}`}>{label}</button>
  const filterCell = (v: string | number | null | undefined, qs: (x: string) => string) => (v === null || v === undefined || v === ''
    ? <span className="text-steel-600">{details.size === 0 ? '…' : 'Not available'}</span>
    : <Link className={CELL_LINK} to={`/catalogue?${qs(String(v))}`} title="See all products with this value" onClick={(e) => e.stopPropagation()}>{String(v)}</Link>)
  const enc = encodeURIComponent
  return (
    <div className="space-y-4">
      {cat.id !== 'other' && <ShareBar kind="category" id={cat.id} name={cat.name} />}

      <section aria-label={`Index of ${cat.name}`} className="border border-steel-300 rounded-md overflow-hidden">
        <h2 className="bg-steel-100 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-center">Index {cat.name} · go to:</h2>
        <ul className="max-h-40 overflow-auto p-2 flex flex-wrap gap-1.5">
          {ids.map((id) => { const p = prods.get(id)!; return <li key={id}><button onClick={() => onOpen(id)} title={p.name} className="border border-steel-300 bg-white hover:border-brand-green hover:text-brand-green rounded px-1.5 py-0.5 text-xs font-mono font-bold">{p.code}</button></li> })}
        </ul>
      </section>

      {related.length > 0 && (
        <section aria-label="Related catalogues" className="border border-steel-300 rounded-md overflow-hidden">
          <h2 className="bg-steel-100 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-center">Related catalogues · go to:</h2>
          <ul className="p-2 grid gap-2 sm:grid-cols-2">
            {related.map((r) => <li key={r.id}><Link to={`/guide/c/${r.id}`} className="flex items-center gap-2 hover:text-brand-green text-sm"><CodeBoxes code={r.code} /><span className="font-medium">{r.name}</span><span className="text-xs text-steel-600">({r.n} shared)</span></Link></li>)}
          </ul>
        </section>)}

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-steel-600 mr-auto">{ids.length} product{ids.length === 1 ? '' : 's'}</p>
        <div className="flex" role="group" aria-label="View">{tab('cards', 'Cards')}{tab('table', 'Table')}</div>
      </div>

      {view === 'cards' ? (
        <ul className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {ids.slice(0, shown).map((id) => { const p = prods.get(id)!; return (
            <li key={id} className="flex flex-col border border-steel-300 rounded-md overflow-hidden bg-white hover:shadow-md transition">
              <button onClick={() => onOpen(id)} className="text-left p-2 space-y-1 flex-1"><Frame src={thumbs.get(id)} alt={p.name} /><span className="block text-sm font-semibold leading-snug">{p.name}</span><span className="block text-xs font-mono text-steel-600">{p.code}</span></button>
              <div className="px-2 pb-2"><AddToRfqButton id={id} code={p.code} name={p.name} /></div>
            </li>) })}
        </ul>
      ) : (
        <div className="overflow-x-auto border border-steel-300 rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-steel-100 text-left"><tr>{['Code', 'Name', 'Brand', 'Material', 'Pitch (mm)', 'Width (mm)', 'Thickness (mm)', ''].map((h, i) => <th key={i} className="px-3 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {ids.slice(0, shown).map((id) => { const p = prods.get(id)!; const d = details.get(id); return (
                <tr key={id} className="border-t border-steel-300 hover:bg-belt-100 cursor-pointer" onClick={() => onOpen(id)}>
                  <td className="px-3 py-2 whitespace-nowrap"><Link to={`/guide/p/${id}`} className="font-mono font-bold hover:text-brand-green" onClick={(e) => e.stopPropagation()}>{p.code}</Link></td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2">{filterCell(d?.brand, (v) => `brand=${enc(v)}`)}</td>
                  <td className="px-3 py-2">{filterCell(d?.material, (v) => `material=${enc(v)}`)}</td>
                  <td className="px-3 py-2">{filterCell(d?.pitch_mm, (v) => `pitch=${v}`)}</td>
                  <td className="px-3 py-2">{filterCell(d?.width_mm, (v) => `width=${v}`)}</td>
                  <td className="px-3 py-2">{filterCell(d?.thickness_mm, (v) => `thickness=${v}`)}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><button className="border border-brand-green text-brand-green px-2 py-1 text-xs hover:bg-brand-green hover:text-white" onClick={(e) => { e.stopPropagation(); rfq.add({ id, code: p.code, name: p.name }) }}>Add to quotation</button></td>
                </tr>) })}
            </tbody>
          </table>
        </div>)}
      {view === 'table' && <p className="text-xs text-steel-600">Click a row to open the product. Click an underlined value to see every product with it.</p>}
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
  const accent = (() => { const i = catList.findIndex((c) => c.id === currentCatId); return i >= 0 ? color(i) : '#003080' })()

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
                <li><b>Page order and codes:</b> the book runs INDEX, then each category (C01, C02 ...) followed by its products. Codes follow the category order set by an administrator.</li><li><b>Search tips:</b> type part of a code (punctuation is ignored) or a few words from the name or specification.</li>
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
            <Sheet code={cur.code} title={cur.title} cats={catList} currentCatId={currentCatId} accent={accent} onOpenCat={openCat} onOpenIndex={() => go(0)} narrow={cur.kind === 'index'}>
              {cur.kind === 'index' && <IndexPage cats={cats} thumbs={catThumbs} open={openCat} />}
              {cur.kind === 'category' && <CategoryPage cat={{ id: cur.id, name: cur.title }} prods={prodMap} pages={pages} onOpen={openProd} thumbsVersion={0} />}
              {cur.kind === 'product' && <ProductDetail sheet />}
            </Sheet>)}
        </div>
      </div>
    </div>
  )
}
