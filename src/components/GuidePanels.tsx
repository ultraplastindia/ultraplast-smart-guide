import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ExternalLink, Globe, ShoppingCart, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useRfq } from '../lib/rfq'
import { openDocument } from '../lib/catalogue'
import { CodeBoxes } from './ImageViewer'
import type { GuidePage } from '../lib/format'

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
