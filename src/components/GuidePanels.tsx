import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as RKey, type MouseEvent as RMouse, type PointerEvent as RPointer, type ReactNode } from 'react'
import { ExternalLink, Globe, ShoppingCart, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useRfq } from '../lib/rfq'
import { openDocument } from '../lib/catalogue'
import { CodeBoxes } from './ImageViewer'
import { searchProducts, type ProductRow } from '../lib/catalogue'
import { linkVisible, type CatalogueParams, type GuidePage } from '../lib/format'

interface Spec { spec_key: string; spec_value: string; unit: string | null }
interface Doc { id: string; title: string; doc_type: string; storage_path: string }
interface Item { id: string; product_code: string; name: string; description: string | null; status: string; product_specifications: Spec[]; technical_documents: Doc[] }

const SITE = 'https://www.ultraplastindia.com/'
const UOM_KEY = /^(unit of measure(ment)?|uom|unit)$/i
const FORMATS = [
  { label: 'DWG', test: /\.(dwg|dxf)$/i },
  { label: 'STP', test: /\.(stp|step)$/i },
]

/** "Item details/downloads" popup, as in the printed Smart Guide: item number, description, unit, quotation, where to buy and CAD files. */
export default function ItemDetailsModal({ id, onClose, onOpenPage }: { id: string; onClose: () => void; onOpenPage: (id: string) => void }) {
  const { can } = useAuth()
  const rfq = useRfq()
  const [item, setItem] = useState<Item | null>(null)
  const [err, setErr] = useState('')
  const [buy, setBuy] = useState(false)
  const [added, setAdded] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let live = true
    setItem(null); setErr(''); setBuy(false); setAdded(false)
    void supabase.from('products').select('id,product_code,name,description,status,product_specifications(spec_key,spec_value,unit),technical_documents(id,title,doc_type,storage_path)').eq('id', id).maybeSingle()
      .then(({ data, error }) => {
        if (!live) return
        if (error || !data) setErr(error?.message ?? 'This item could not be found.')
        else setItem(data as unknown as Item)
      })
    return () => { live = false }
  }, [id])

  useEffect(() => {
    closeRef.current?.focus()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const uomSpec = item?.product_specifications.find((s) => UOM_KEY.test(s.spec_key.trim()))
  const uom = uomSpec ? `${uomSpec.spec_value}${uomSpec.unit ? ` ${uomSpec.unit}` : ''}` : ''
  const cad = (item?.technical_documents ?? []).filter((d) => d.doc_type === 'cad')
  const link = `${window.location.origin}/guide/p/${id}`
  const label = 'text-steel-600 font-medium'

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 bg-black/60 print:hidden" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="idm-title" className="w-full max-w-xl max-h-full overflow-auto bg-white border border-black shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-neutral-800 text-white px-5 py-3 sticky top-0">
          <h2 id="idm-title" className="text-lg font-medium">Item details/downloads</h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close" className="p-1 hover:bg-white/15 rounded"><X size={22} /></button>
        </div>
        {err && <p role="alert" className="p-6 text-red-700">{err}</p>}
        {!item && !err && <p role="status" className="p-6 text-steel-600">Loading…</p>}
        {item && (
          <div className="p-6 space-y-2 text-[17px]">
            <p><span className={label}>Item number </span><b className="font-mono">{item.product_code}</b></p>
            <p><span className={label}>Item description </span><b>{item.name}</b></p>
            {item.description && <p className="text-[15px] text-steel-800">{item.description}</p>}
            <p><span className={label}>Unit of measurement </span>{uom ? <b>{uom}</b> : <span className="text-steel-600">Not available</span>}</p>
            {item.status === 'archived' && <p className="text-sm font-bold">Please note: this product is archived and no longer offered for sale.</p>}

            <div className="pt-3 space-y-3">
              <button className="flex items-center gap-3 text-lg text-steel-600 underline hover:text-brand-green" aria-expanded={buy} onClick={() => setBuy(!buy)}><Globe size={22} aria-hidden /> Where to buy?</button>
              {buy && (
                <p className="text-sm pl-9">Ultraplast sells directly and through its dealers. Add this item to your quotation request and the team will reply with the nearest supplier, or visit <a className="underline" href={SITE} target="_blank" rel="noopener noreferrer">www.ultraplastindia.com</a>.</p>)}
              <button className="flex items-center gap-3 text-lg text-steel-600 underline hover:text-brand-green" onClick={() => { rfq.add({ id: item.id, code: item.product_code, name: item.name }); setAdded(true) }}>
                <ShoppingCart size={22} aria-hidden /> {added ? 'Added to "Request for quotation". Add one more' : 'Add to "Request for quotation"'}
              </button>
              {added && <p role="status" className="text-sm pl-9 text-green-800">{rfq.items.length} item{rfq.items.length === 1 ? '' : 's'} in your request. Use the green button in the toolbar to review and send it.</p>}
              <button className="flex items-center gap-3 text-lg text-steel-600 underline hover:text-brand-green" onClick={() => { onClose(); onOpenPage(item.id) }}><ExternalLink size={22} aria-hidden /> Open the full product page</button>
            </div>

            <h3 className="text-xl font-medium pt-4 text-steel-600">Download/email files:</h3>
            {FORMATS.map((f) => {
              const doc = cad.find((d) => f.test.test(d.storage_path))
              return (
                <p key={f.label} className="flex flex-wrap items-center gap-x-3">
                  <span className="w-12">{f.label}:</span>
                  {doc ? (<>
                    {can('download_cad')
                      ? <button className="text-steel-600 underline hover:text-brand-green" onClick={() => void openDocument('technical-documents', doc.storage_path).catch((e: Error) => setErr(e.message))}>Download</button>
                      : <span className="text-steel-600" title="Your account does not have CAD download permission">Needs CAD permission</span>}
                    <span aria-hidden>|</span>
                    <a className="text-steel-600 underline hover:text-brand-green" href={`mailto:?subject=${encodeURIComponent(`${f.label} file: ${item.product_code}`)}&body=${encodeURIComponent(`${item.product_code} ${item.name}\n${link}\n(Sign-in required.)`)}`}>Email link</a>
                  </>) : <span className="text-steel-600">Not available</span>}
                </p>)
            })}
            <p className="italic text-sm pt-2 text-steel-600">*CAD downloads need an approved account with CAD permission. Downloads are not showing full details, but are a reliable representation of the product. They are meant to be used in conveyor assembly drawings.</p>
          </div>)}
      </div>
    </div>
  )
}


interface GuideDoc { id: string; title: string; doc_type: string; storage_path: string }
const TYPE_LABEL: Record<string, string> = { datasheet: 'Datasheet', drawing: 'Drawing', other: 'Document' }
// Quick-link groups: a group lists the catalogue pages (and related products) whose category name matches.
const GROUPS: { title: string; re: RegExp }[] = [
  { title: 'Matching sprocket sizes', re: /sprocket/i },
  { title: 'Wear strips', re: /wear/i },
  { title: 'Transfer plates', re: /transfer/i },
]

const Group = ({ title, count, open, children }: { title: string; count: number; open?: boolean; children: ReactNode }) => (
  <details open={open} className="border-b border-steel-300 group/d">
    <summary className="cursor-pointer select-none px-3 py-2.5 font-semibold text-sm flex items-center justify-between hover:bg-steel-100">
      <span>{title}</span><span className="text-xs font-normal text-steel-600">{count}</span>
    </summary>
    <div className="px-3 pb-3 text-sm">{children}</div>
  </details>
)

/** Collapsible side drawer with quick links for the page you are on: guides, related products, matching sprockets, wear strips, transfer plates. */
export function ProductAssist({ cur, pages, onGo, onClose }: { cur: GuidePage | undefined; pages: GuidePage[]; onGo: (p: GuidePage) => void; onClose: () => void }) {
  const [docs, setDocs] = useState<GuideDoc[]>([])
  const [relIds, setRelIds] = useState<string[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    setDocs([]); setRelIds([]); setErr('')
    if (!cur || cur.kind === 'index') return
    ;(async () => {
      const filter = cur.kind === 'product'
        ? `product_id.eq.${cur.id}${cur.categoryId && cur.categoryId !== 'other' ? `,category_id.eq.${cur.categoryId}` : ''}`
        : cur.id !== 'other' ? `category_id.eq.${cur.id}` : ''
      const d = filter ? await supabase.from('technical_documents').select('id,title,doc_type,storage_path').or(filter) : { data: [] as GuideDoc[] }
      if (live) setDocs(((d.data ?? []) as GuideDoc[]).filter((x) => x.doc_type !== 'cad'))
      if (cur.kind === 'product') {
        const [a, b] = await Promise.all([
          supabase.from('product_relations').select('related_product_id').eq('product_id', cur.id),
          supabase.from('product_relations').select('product_id').eq('related_product_id', cur.id),
        ])
        const ids = new Set<string>([...((a.data ?? []) as { related_product_id: string }[]).map((r) => r.related_product_id), ...((b.data ?? []) as { product_id: string }[]).map((r) => r.product_id)])
        if (live) setRelIds([...ids])
      }
    })().catch((e: Error) => live && setErr(e.message))
    return () => { live = false }
  }, [cur?.id, cur?.kind, cur?.categoryId]) // eslint-disable-line react-hooks/exhaustive-deps

  const related = pages.filter((p) => p.kind === 'product' && relIds.includes(p.id))
  const catPages = pages.filter((p) => p.kind === 'category')
  const link = (p: GuidePage) => (
    <button key={`${p.kind}${p.id}`} className="group flex items-center gap-2 py-1 text-left hover:text-brand-green w-full" onClick={() => onGo(p)}>
      <CodeBoxes code={p.code} /><span className="font-medium leading-tight">{p.title}</span>
    </button>)

  return (
    <aside aria-label="Additional product assistance" className="absolute inset-y-0 right-0 z-30 w-80 max-w-[92%] bg-white border-l border-steel-300 shadow-2xl overflow-y-auto print:hidden">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-neutral-800 text-white px-3 py-2.5">
        <h2 className="font-medium">Additional product assistance</h2>
        <button aria-label="Close assistance" onClick={onClose} className="p-1 hover:bg-white/15 rounded"><X size={20} /></button>
      </div>
      {err && <p role="alert" className="p-3 text-sm text-red-700">{err}</p>}
      {cur && cur.kind !== 'index' && <p className="px-3 py-2 text-xs text-steel-600 border-b border-steel-300">For page <b className="font-mono">{cur.code}</b> {cur.title}</p>}
      <Group title="Construction guides and documents" count={docs.length} open>
        {docs.length === 0 ? <p className="text-steel-600">{cur && cur.kind !== 'index' ? 'No guides or documents are linked to this page yet.' : 'Open a category or product to see its guides.'}</p>
          : <ul className="space-y-1.5">{docs.map((d) => <li key={d.id}><button className="text-left underline hover:text-brand-green" onClick={() => void openDocument('technical-documents', d.storage_path).catch((e: Error) => setErr(e.message))}>{d.title}</button> <span className="text-xs text-steel-600">({TYPE_LABEL[d.doc_type] ?? d.doc_type})</span></li>)}</ul>}
      </Group>
      {cur?.kind === 'product' && (
        <Group title="Related products" count={related.length}>
          {related.length === 0 ? <p className="text-steel-600">No related products linked yet.</p> : <ul>{related.map((p) => <li key={p.id}>{link(p)}</li>)}</ul>}
        </Group>)}
      {GROUPS.map((g) => {
        const cats = catPages.filter((c) => g.re.test(c.title) && c.id !== cur?.id)
        const catIds = new Set(cats.map((c) => c.id))
        const prods = related.filter((p) => p.categoryId && catIds.has(p.categoryId))
        return (
          <Group key={g.title} title={g.title} count={prods.length + cats.length}>
            {prods.length + cats.length === 0 ? <p className="text-steel-600">No matching catalogue page found.</p> : (
              <ul>
                {prods.map((p) => <li key={p.id}>{link(p)}</li>)}
                {cats.map((c) => <li key={c.id}>{link(c)}</li>)}
              </ul>)}
          </Group>)
      })}
    </aside>
  )
}

/** Products matching a clicked value (brand, material, pitch, width, thickness, colour) shown inside the Guide, so nobody is sent to another panel. */
export function GuideResults({ params, onOpen, onClear }: { params: CatalogueParams; onOpen: (id: string) => void; onClear: () => void }) {
  const rfq = useRfq()
  const key = JSON.stringify({ ...params, page: 1 })
  const [pg, setPg] = useState({ key, page: 1 })
  const page = pg.key === key ? pg.page : 1
  const [rows, setRows] = useState<ProductRow[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    setBusy(true); setErr('')
    searchProducts({ ...params, page }).then((d) => { if (!live) return; setRows((cur) => (page === 1 ? d.items : [...cur, ...d.items])); setTotal(d.total); setBusy(false) })
      .catch((e: Error) => { if (live) { setErr(e.message); setBusy(false) } })
    return () => { live = false }
  }, [key, page]) // eslint-disable-line react-hooks/exhaustive-deps
  const chips = ([['Search', params.q], ['Brand', params.brand], ['Material', params.material], ['Pitch', params.pitch && `${params.pitch} mm`], ['Width', params.width && `${params.width} mm`], ['Thickness', params.thickness && `${params.thickness} mm`]] as [string, string][]).filter(([, v]) => v)
  return (
    <section aria-label="Matching products" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold uppercase tracking-wide text-sm">Products with</h2>
        {chips.map(([k, v]) => <span key={k} className="bg-steel-100 border border-steel-300 rounded px-2 py-0.5 text-sm">{k}: <b>{v}</b></span>)}
        <button className="ml-auto border border-steel-300 px-3 py-1 text-sm hover:bg-steel-100" onClick={onClear}>Back to the index</button>
      </div>
      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
      {!err && !busy && rows.length === 0 && <p className="text-steel-600">No products match.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto border border-steel-300 rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-steel-100 text-left"><tr>{['Code', 'Name', 'Category', 'Brand', 'Material', ''].map((h, i) => <th key={i} className="px-3 py-2 whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-t border-steel-300 hover:bg-belt-100 cursor-pointer" onClick={() => onOpen(r.id)}>
                <td className="px-3 py-2 whitespace-nowrap hover:outline hover:outline-2 hover:-outline-offset-2 hover:outline-[#F59E0B]"><SkuCode id={r.id} code={r.product_code} name={r.name} onOpen={() => onOpen(r.id)} /></td><td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.category_name ?? 'Not available'}</td><td className="px-3 py-2">{r.brand ?? 'Not available'}</td><td className="px-3 py-2">{r.material ?? 'Not available'}</td>
                <td className="px-3 py-2 whitespace-nowrap"><button className="border border-brand-green text-brand-green px-2 py-1 text-xs hover:bg-brand-green hover:text-white" onClick={(e) => { e.stopPropagation(); rfq.add({ id: r.id, code: r.product_code, name: r.name }) }}>Add to quotation</button></td>
              </tr>))}</tbody>
          </table>
        </div>)}
      <div className="flex items-center gap-3 text-sm">
        <span className="text-steel-600" role="status">{busy ? 'Loading…' : `${rows.length} of ${total}`}</span>
        {!busy && rows.length < total && <button className="border border-steel-300 px-3 py-1 hover:bg-steel-100" onClick={() => setPg({ key, page: page + 1 })}>Show more</button>}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------------------------------------
 * Technical-catalogue viewer pieces: the page stage (click to zoom, mouse-follow pan, top-edge drawer,
 * page-change spinner), the category wheel, quick-add item codes and the legend overlay.
 * ---------------------------------------------------------------------------------------------- */
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
export const MAX_LEVEL = 3

// Things a click must reach untouched: links, buttons, hotspots, table rows that open pages, form fields.
const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[role="dialog"],[data-nozoom],.cursor-pointer'

/**
 * The grey stage with the white page, as in a printed-catalogue viewer. The page is blank with a spinner while it loads.
 * Click the page to zoom 1x, 2x, 3x and back, exactly where you click; while zoomed the page follows the mouse, so there are no scroll bars.
 * Move to the top edge for the section menu.
 */
export function PageStage({ level, onLevel, resetKey, drawer, children }: { level: number; onLevel: (n: number) => void; resetKey: string; drawer?: ReactNode; children: ReactNode }) {
  const stage = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const mouse = useRef<{ x: number; y: number } | null>(null)
  const hold = useRef(false)
  const raf = useRef(0)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const levelNow = useRef(level)
  levelNow.current = level
  const [size, setSize] = useState({ w: 1000, h: 700 })
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [fast, setFast] = useState(false)
  const [edge, setEdge] = useState(false)
  const [busy, setBusy] = useState(true)

  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const small = size.w < 760
  const W = small ? Math.max(320, size.w - 16) : 1000
  const s0 = Math.min(1, (size.w - (small ? 16 : 96)) / W)
  const fitW = W * s0, fitH = Math.max(200, size.h - 24)
  const fitLeft = (size.w - fitW) / 2, fitTop = (size.h - fitH) / 2

  // The page point under the cursor is the same share of the page as the cursor is of the fitted page, so a click zooms exactly where it points.
  const place = (mx: number, my: number, lv: number) => {
    const cw = fitW * lv, ch = fitH * lv
    const ux = clamp((mx - fitLeft) / fitW, 0, 1), uy = clamp((my - fitTop) / fitH, 0, 1)
    return {
      x: cw <= size.w ? (size.w - cw) / 2 : clamp(mx - ux * cw, size.w - cw, 0),
      y: ch <= size.h ? (size.h - ch) / 2 : clamp(my - uy * ch, size.h - ch, 0),
    }
  }

  useEffect(() => {
    cancelAnimationFrame(raf.current)
    const m = mouse.current ?? { x: size.w / 2, y: size.h / 2 }
    setFast(false)
    setPos(place(m.x, m.y, level))
    if (level > 1) setEdge(false)
  }, [level, size.w, size.h]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onLevel(1)
    frame.current?.scrollTo({ top: 0 })
    setBusy(true)
    const t = setTimeout(() => setBusy(false), 380)
    return () => clearTimeout(t)
  }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e: RMouse) => {
    const r = stage.current?.getBoundingClientRect()
    if (!r) return
    const mx = e.clientX - r.left, my = e.clientY - r.top
    mouse.current = { x: mx, y: my }
    if (level > 1) {
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(() => { if (levelNow.current <= 1) return; setFast(true); setPos(place(mx, my, levelNow.current)) })
    } else if (!hold.current) setEdge(mx >= fitLeft && mx <= fitLeft + fitW && my >= fitTop && my <= fitTop + 36)
  }
  const onClick = (e: RMouse) => {
    const t = e.target as HTMLElement
    if (!frame.current?.contains(t) || t.closest(INTERACTIVE) || (window.getSelection()?.toString().length ?? 0) > 0) return
    const r = stage.current?.getBoundingClientRect()
    if (r) mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top }
    onLevel(level >= MAX_LEVEL ? 1 : level + 1)
  }
  // Touch: drag to move the zoomed page.
  const down = (e: RPointer) => { if (e.pointerType !== 'mouse' && level > 1) drag.current = { x: e.clientX, y: e.clientY } }
  const dragMove = (e: RPointer) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    drag.current = { x: e.clientX, y: e.clientY }
    setFast(true)
    setPos((p) => ({ x: clamp(p.x + dx, Math.min(0, size.w - fitW * level), 0), y: clamp(p.y + dy, Math.min(0, size.h - fitH * level), 0) }))
  }

  return (
    <div ref={stage} className="relative flex-1 min-w-0 overflow-hidden bg-[#737373] print:overflow-visible print:bg-white" onMouseMove={onMove} onClick={onClick}
      onMouseLeave={() => { if (!hold.current) setEdge(false) }} onPointerDown={down} onPointerMove={dragMove} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      <div ref={frame} data-page-frame
        className={`absolute left-0 top-0 bg-white overflow-y-auto overflow-x-hidden shadow-[0_2px_18px_rgba(0,0,0,0.55)] ${level > 1 ? '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : ''} print:!static print:!transform-none print:!w-auto print:!h-auto print:overflow-visible print:shadow-none`}
        style={{ width: W, height: fitH / s0, transform: `translate(${pos.x}px, ${pos.y}px) scale(${s0 * level})`, transformOrigin: '0 0', transition: `${fast ? 'transform 0.12s ease-out' : 'transform 0.4s cubic-bezier(.22,.8,.3,1)'}`, cursor: level >= MAX_LEVEL ? 'zoom-out' : 'zoom-in', touchAction: level > 1 ? 'none' : 'pan-y' }}>
        <div style={{ visibility: busy ? 'hidden' : 'visible' }}>{children}</div>
      </div>
      {busy && <div className="absolute inset-0 grid place-items-center pointer-events-none z-10 print:hidden"><div role="status" aria-label="Loading page" className="h-11 w-11 rounded-full border-4 border-steel-300 border-t-steel-600 animate-spin" /></div>}
      {drawer && (
        <div aria-hidden={!edge} onMouseEnter={() => { hold.current = true }} onMouseLeave={() => { hold.current = false; setEdge(false) }}
          className="absolute z-20 print:hidden" style={{ left: fitLeft, width: fitW, top: fitTop, transform: edge ? 'translateY(0)' : 'translateY(-115%)', visibility: edge ? 'visible' : 'hidden', transition: `transform .3s ease, visibility 0s linear ${edge ? '0s' : '.3s'}` }}>
          {drawer}
        </div>)}
    </div>
  )
}

/** What each zoomable catalogue picture tells the toolbar. Each picture keeps its own zoom level. */
export interface ZoomApi { report: (id: string, level: number, set: (n: number) => void) => void; release: (id: string) => void; claim: (id: string) => void; /** The whole page zooms (the Guide), so a picture does not zoom on its own. */ pageZoom?: boolean }
export const ZoomCtx = createContext<ZoomApi | null>(null)

/** Keeps track of the zoomable pictures on the page. The toolbar zoom buttons act on the picture you last pointed at. */
export function useZoomRegistry() {
  const [areas, setAreas] = useState<Record<string, { level: number; set: (n: number) => void }>>({})
  const [activeId, setActiveId] = useState('')
  const value = useMemo<ZoomApi>(() => ({
    report: (id, level, set) => setAreas((a) => (a[id] && a[id].level === level && a[id].set === set ? a : { ...a, [id]: { level, set } })),
    release: (id) => setAreas((a) => { if (!(id in a)) return a; const rest = { ...a }; delete rest[id]; return rest }),
    claim: (id) => setActiveId(id),
  }), [])
  const ids = Object.keys(areas)
  const active = areas[activeId] ?? (ids.length > 0 ? areas[ids[ids.length - 1]] : null)
  return { value, active, hasZoom: ids.length > 0 }
}

/**
 * A catalogue picture you can zoom. Click it to zoom to 2x, then 3x, then back to fit, exactly where you click.
 * While zoomed the picture follows the mouse, so there are no scroll bars. Links and buttons inside it (callouts) keep working and zoom with it.
 */
export function ZoomArea({ label, hint, fill, boxStyle, resetKey, onFullScreen, children }: { label: string; hint: string; fill?: boolean; boxStyle?: CSSProperties; resetKey?: string; onFullScreen?: () => void; children: ReactNode }) {
  const ctx = useContext(ZoomCtx)
  const id = useId()
  const [level, setLevel] = useState(1)
  const box = useRef<HTMLDivElement>(null)
  const mouse = useRef<{ x: number; y: number } | null>(null)
  const raf = useRef(0)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [size, setSize] = useState({ w: 600, h: 500 })
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [fast, setFast] = useState(false)
  const levelNow = useRef(level)
  levelNow.current = level

  useEffect(() => { if (!ctx?.pageZoom) ctx?.report(id, level, setLevel) }, [level]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => ctx?.release(id), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setLevel(1) }, [resetKey])
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The picture point under the cursor stays under the cursor, so a click zooms exactly where it points.
  const place = (mx: number, my: number, lv: number) => ({ x: mx * (1 - lv), y: my * (1 - lv) })
  useEffect(() => {
    cancelAnimationFrame(raf.current)
    const m = mouse.current ?? { x: size.w / 2, y: size.h / 2 }
    setFast(false)
    setPos(place(m.x, m.y, level))
  }, [level, size.w, size.h]) // eslint-disable-line react-hooks/exhaustive-deps

  const rel = (cx: number, cy: number) => { const r = box.current?.getBoundingClientRect(); return r ? { x: cx - r.left, y: cy - r.top } : { x: size.w / 2, y: size.h / 2 } }
  const next = () => setLevel(level >= MAX_LEVEL ? 1 : level + 1)
  const claim = () => ctx?.claim(id)
  const onMove = (e: RMouse) => {
    const m = rel(e.clientX, e.clientY)
    mouse.current = m
    if (level > 1) { cancelAnimationFrame(raf.current); raf.current = requestAnimationFrame(() => { if (levelNow.current <= 1) return; setFast(true); setPos(place(m.x, m.y, levelNow.current)) }) }
  }
  const lim = (v: number, len: number) => clamp(v, len * (1 - level), 0)
  const onKey = (e: RKey) => {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next() }
    else if (e.key === 'Escape' && level > 1) { e.preventDefault(); setLevel(1) }
    else if (level > 1 && e.key.startsWith('Arrow')) {
      e.preventDefault()
      const d = 60
      setFast(true)
      setPos((p) => ({ x: lim(p.x + (e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0), size.w), y: lim(p.y + (e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0), size.h) }))
    }
  }
  const down = (e: RPointer) => { if (e.pointerType !== 'mouse' && level > 1) drag.current = { x: e.clientX, y: e.clientY } }
  const dragMove = (e: RPointer) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    drag.current = { x: e.clientX, y: e.clientY }
    setFast(true)
    setPos((p) => ({ x: lim(p.x + dx, size.w), y: lim(p.y + dy, size.h) }))
  }
  const btn = 'border border-steel-300 bg-white px-2 py-1 text-xs hover:bg-steel-100 disabled:opacity-40'
  if (ctx?.pageZoom) {
    return (
      <div className="space-y-1.5">
        <div className="relative w-full overflow-hidden" style={boxStyle}><div style={{ width: '100%', height: fill ? '100%' : undefined }}>{children}</div></div>
        {onFullScreen && <div className="flex justify-end print:hidden"><button type="button" className={btn} onClick={onFullScreen}>Full screen</button></div>}
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <div ref={box} role="group" tabIndex={0} aria-label={`${label} Now ${level}x.`} data-zoom-area
        onClick={(e) => { claim(); if ((e.target as HTMLElement).closest('button,a,input,select,textarea,[data-nozoom]')) return; mouse.current = rel(e.clientX, e.clientY); next() }}
        onMouseEnter={claim} onFocus={claim} onMouseMove={onMove} onKeyDown={onKey}
        onPointerDown={down} onPointerMove={dragMove} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
        className="relative w-full overflow-hidden select-none outline-none focus-visible:ring-2 focus-visible:ring-amber-500" style={{ ...boxStyle, cursor: level >= MAX_LEVEL ? 'zoom-out' : 'zoom-in', touchAction: level > 1 ? 'none' : 'pan-y' }}>
        <div style={{ width: '100%', height: fill ? '100%' : undefined, transform: `translate(${pos.x}px, ${pos.y}px) scale(${level})`, transformOrigin: '0 0', transition: fast ? 'transform 0.12s ease-out' : 'transform 0.4s cubic-bezier(.22,.8,.3,1)' }}>
          {children}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-steel-800 print:hidden">
        <span aria-live="polite" className="mr-auto">{level === 1 ? hint : `${level}x. Move the mouse to look around. Click to ${level >= MAX_LEVEL ? 'return to fit' : 'zoom more'}.`}</span>
        <button type="button" className={btn} disabled={level <= 1} onClick={() => { claim(); setLevel(level - 1) }}>Zoom out</button>
        <button type="button" className={btn} disabled={level >= MAX_LEVEL} onClick={() => { claim(); mouse.current = null; setLevel(level + 1) }}>Zoom in</button>
        <button type="button" className={btn} disabled={level === 1} onClick={() => setLevel(1)}>Fit</button>
        {onFullScreen && <button type="button" className={btn} onClick={onFullScreen}>Full screen</button>}
      </div>
    </div>
  )
}

/** The catalogue page picture of a product, zoomable. */
export function ZoomImage({ src, alt, onFullScreen }: { src: string; alt: string; onFullScreen?: () => void }) {
  const [ratio, setRatio] = useState(1.3)
  return (
    <ZoomArea label={`${alt}. Click to zoom.`} hint="Click the catalogue page to zoom in." fill resetKey={src} onFullScreen={onFullScreen} boxStyle={{ aspectRatio: `${1 / ratio}`, maxHeight: '78vh', background: '#fff', border: '1px solid #cfd6dc' }}>
      <img src={src} alt={alt} draggable={false} onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth > 0) setRatio(clamp(i.naturalHeight / i.naturalWidth, 0.5, 2)) }} className="h-full w-full object-contain" />
    </ZoomArea>
  )
}

/** The circular category badge: hover a coloured wedge for its name, click it to open that category. */
export function CategoryWheel({ cats, currentCatId, colors, onOpenCat }: { cats: { id: string; name: string }[]; currentCatId?: string; colors: (i: number) => string; onOpenCat: (id: string) => void }) {
  const [hover, setHover] = useState(-1)
  if (cats.length === 0) return null
  const n = cats.length, C = 40, R0 = 17, R1 = 38, gap = n > 1 ? 0.04 : 0
  const pt = (r: number, a: number) => `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`
  const wedge = (i: number) => {
    const span = (Math.PI * 2) / n
    const a0 = -Math.PI / 2 + i * span + gap / 2, a1 = -Math.PI / 2 + (i + 1) * span - gap / 2 - (n === 1 ? 0.001 : 0)
    const big = a1 - a0 > Math.PI ? 1 : 0
    return `M${pt(R1, a0)} A${R1},${R1} 0 ${big} 1 ${pt(R1, a1)} L${pt(R0, a1)} A${R0},${R0} 0 ${big} 0 ${pt(R0, a0)} Z`
  }
  return (
    <div className="relative shrink-0 print:hidden" onMouseLeave={() => setHover(-1)}>
      <svg viewBox="0 0 80 80" className="h-16 w-16" role="group" aria-label="Category wheel">
        {cats.map((c, i) => (
          <path key={c.id} d={wedge(i)} role="button" tabIndex={0} aria-label={`Open ${c.name}`} fill={colors(i)} stroke="#fff" strokeWidth={hover === i || c.id === currentCatId ? 2 : 0.5}
            opacity={hover === -1 || hover === i ? 1 : 0.55} className="cursor-pointer outline-none"
            style={{ transformOrigin: '40px 40px', transform: hover === i ? 'scale(1.07)' : undefined, transition: 'transform .12s, opacity .12s' }}
            onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(-1)}
            onClick={() => onOpenCat(c.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCat(c.id) } }} />))}
        <circle cx={C} cy={C} r={R0 - 3} fill="#fff" stroke="#d8dee3" pointerEvents="none" />
        <text x={C} y={C + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#1b1b19" pointerEvents="none">{n}</text>
      </svg>
      {hover >= 0 && <span role="tooltip" className="absolute right-0 top-full mt-1 z-30 whitespace-nowrap rounded bg-black/85 px-2 py-1 text-xs text-white">{cats[hover].name}</span>}
    </div>
  )
}

/** An item code in a table: bright orange outline on hover, click to add it to the quotation with a quantity. */
export function SkuCode({ id, code, name, onOpen }: { id: string; code: string; name: string; onOpen?: () => void }) {
  const rfq = useRfq()
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState(1)
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])
  return (
    <span className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} title="Click to add to quotation" onClick={() => { setOpen(!open); setDone(false) }}
        className="font-mono font-bold border-2 border-transparent rounded-sm px-1 -mx-1 hover:border-[#F59E0B] focus-visible:border-[#F59E0B] outline-none">{code}</button>
      {open && (
        <div role="dialog" aria-label={`Add ${code} to quotation`} className="absolute left-0 top-full z-30 mt-1 w-52 border border-steel-300 bg-white p-2 text-left text-xs font-normal shadow-lg print:hidden">
          <p className="font-semibold truncate" title={name}>{code}</p>
          {done ? <p role="status" className="mt-1 text-green-800">Added to your quotation list.</p> : (
            <div className="mt-1 flex items-center gap-1">
              <label htmlFor={`q-${id}`} className="sr-only">Quantity</label>
              <input id={`q-${id}`} type="number" min={1} max={100000} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100000, Math.floor(Number(e.target.value)) || 1)))} className="w-16 border border-steel-300 px-1 py-1" />
              <button className="flex-1 bg-brand-green text-white px-2 py-1 hover:opacity-90" onClick={() => { rfq.add({ id, code, name }, qty); setDone(true) }}>Add to quotation</button>
            </div>)}
          <div className="mt-1.5 flex justify-between">
            {onOpen && <button className="underline" onClick={() => { setOpen(false); onOpen() }}>Open page</button>}
            <button className="underline" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>)}
    </span>
  )
}

/** Dark translucent legend over the lower half of the viewer. Shown on first visit and from the ? button. */
export function LegendOverlay({ onClose, onFullHelp }: { onClose: () => void; onFullHelp: () => void }) {
  const box = 'inline-grid place-items-center w-[15px] h-[19px] border-[1.5px] border-white bg-white/10 font-mono text-xs font-bold'
  const Row = ({ glyph, children }: { glyph: ReactNode; children: ReactNode }) => <li className="flex items-center gap-3"><span className="w-28 shrink-0 flex justify-end">{glyph}</span><span>{children}</span></li>
  return (
    <div role="region" aria-label="Guide legend" className="absolute inset-x-0 bottom-0 z-30 flex h-1/2 min-h-[210px] flex-col bg-black/80 text-white print:hidden">
      <button aria-label="Close legend" onClick={onClose} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border-2 border-white text-lg leading-none hover:bg-white/20"><X size={18} /></button>
      <div className="mx-auto w-full max-w-3xl overflow-y-auto px-4 py-4 text-sm">
        <h2 className="mb-2 font-semibold">How to read this guide</h2>
        <ul className="space-y-2">
          <Row glyph={<span className="inline-flex gap-px">{[...'C01'].map((c, i) => <span key={i} className={box}>{c}</span>)}</span>}>Page code in boxes. Click it to open that page.</Row>
          <Row glyph={<span className="border-2 border-[#F59E0B] px-1 font-mono font-bold">S815-K450</span>}>Item code in a table. Click it to add the item to your quotation.</Row>
          <Row glyph={<span className="font-bold">Click page</span>}>Click the page to zoom to 2x, then 3x, then back to fit. Codes and buttons on it still work. While zoomed, move the mouse to look around.</Row>
          <Row glyph={<span className="font-bold">Top edge</span>}>Move the mouse to the top edge of the page to open the section menu.</Row>
          <Row glyph={<span className="inline-block h-6 w-6 rounded-full" style={{ background: 'conic-gradient(#2f9e44 0 25%, #1d5a78 0 50%, #e3a008 0 75%, #8e44ad 0)' }} />}>Colour wheel: point at a wedge for its name, click to open the category.</Row>
          <Row glyph={<span className="rounded bg-green-200 px-1.5 text-xs font-semibold text-green-900">Verified</span>}>Data was checked against the original catalogue. Not available means the data is not in the system.</Row>
        </ul>
        <button className="mt-3 underline" onClick={onFullHelp}>Full help</button>
      </div>
    </div>
  )
}

/* ---- Link sections: shown to the people an administrator chooses (Admin, Guide illustrations and links) ---- */
let linkCache: { at: number; value: Record<string, string> } | null = null
export function clearLinkSectionsCache() { linkCache = null }

/** show(key) is true when the section may be seen by this account. Before the settings load it is false; with no setting (or before script 0016) it is true. */
export function useLinkSections(enabled = true) {
  const { role } = useAuth()
  const [vals, setVals] = useState<Record<string, string> | null>(enabled && linkCache && Date.now() - linkCache.at < 60000 ? linkCache.value : null)
  useEffect(() => {
    if (!enabled) return
    if (linkCache && Date.now() - linkCache.at < 60000) { setVals(linkCache.value); return }
    let live = true
    void supabase.from('guide_settings').select('key,value').then(({ data, error }) => {
      const v: Record<string, string> = {}
      if (!error) for (const r of (data ?? []) as { key: string; value: string }[]) v[r.key] = r.value
      linkCache = { at: Date.now(), value: v }
      if (live) setVals(v)
    })
    return () => { live = false }
  }, [enabled])
  const isAdmin = role === 'admin' || role === 'super_admin'
  return { show: (key: string) => !enabled || (vals !== null && linkVisible(vals[key], isAdmin)) }
}
