import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { clampPct, pointToPct, type Callout } from '../lib/format'
import { toCallout } from '../components/GuideIllustration'
import ProductPicker, { type PickedProduct } from '../components/ProductPicker'

interface Cat { id: string; name: string }
type Kind = 'category' | 'product'
interface Ill { id: string; image_path: string }
interface Item extends Callout { code: string }
const EXT = /\.(png|jpe?g|webp)$/i
const f = 'border border-steel-300 px-2 py-1 bg-white'

/** Admin: put a picture on a category page or a product page and place clickable callouts on it. */
export default function AdminGuideIllustrations() {
  const [cats, setCats] = useState<Cat[]>([])
  const [kind, setKind] = useState<Kind>('category')
  const [catId, setCatId] = useState('')
  const [prod, setProd] = useState<PickedProduct | null>(null)
  const [ill, setIll] = useState<Ill | null>(null)
  const [url, setUrl] = useState('')
  const [items, setItems] = useState<Item[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // new callout form
  const [tKind, setTKind] = useState<Kind>('product')
  const [tProd, setTProd] = useState<PickedProduct | null>(null)
  const [tCat, setTCat] = useState('')
  const [tLabel, setTLabel] = useState('')
  const box = useRef<HTMLDivElement>(null)

  const pageId = kind === 'category' ? catId : prod?.id ?? ''
  const say = useCallback((ok: boolean, text: string) => setMsg({ ok, text }), [])

  useEffect(() => {
    void supabase.from('product_categories').select('id,name').order('sort_order').order('name').then(({ data }) => setCats((data ?? []) as Cat[]))
  }, [])

  const load = useCallback(async () => {
    setIll(null); setUrl(''); setItems([])
    if (!pageId) return
    const r = await supabase.from('guide_illustrations').select('id,image_path').eq('page_kind', kind).eq('page_id', pageId).maybeSingle()
    if (r.error) return say(false, /guide_illustrations/.test(r.error.message) ? 'Run the database script 0014_guide_illustrations.sql first (see DEPLOYMENT.md).' : r.error.message)
    if (!r.data) return
    const row = r.data as Ill
    const [signed, rows] = await Promise.all([
      supabase.storage.from('guide-illustrations').createSignedUrl(row.image_path, 3600),
      supabase.from('guide_callouts').select('id,label,target_kind,target_id,px,py,lx,ly').eq('illustration_id', row.id).order('sort_order').order('id'),
    ])
    const list = ((rows.data ?? []) as Parameters<typeof toCallout>[0][]).map(toCallout)
    const codes = new Map<string, string>()
    const pids = list.filter((c) => c.targetKind === 'product').map((c) => c.targetId)
    if (pids.length) {
      const p = await supabase.from('products').select('id,product_code').in('id', pids)
      for (const x of (p.data ?? []) as { id: string; product_code: string }[]) codes.set(x.id, x.product_code)
    }
    setIll(row); setUrl(signed.data?.signedUrl ?? '')
    setItems(list.map((c) => ({ ...c, code: c.targetKind === 'product' ? codes.get(c.targetId) ?? '(missing product)' : cats.find((k) => k.id === c.targetId)?.name ?? '(missing category)' })))
  }, [kind, pageId, cats, say])
  useEffect(() => { setMsg(null); void load() }, [load])

  const upload = async (file: File | undefined) => {
    if (!file || !pageId) return
    if (!EXT.test(file.name) || file.size > 5 * 1024 * 1024) return say(false, 'Choose a PNG, JPG or WEBP picture under 5 MB.')
    setBusy(true); setMsg(null)
    const path = `${crypto.randomUUID()}.${(file.name.split('.').pop() ?? 'jpg').toLowerCase().replace('jpeg', 'jpg')}`
    const up = await supabase.storage.from('guide-illustrations').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
    if (up.error) { setBusy(false); return say(false, up.error.message) }
    const res = ill
      ? await supabase.from('guide_illustrations').update({ image_path: path }).eq('id', ill.id)
      : await supabase.from('guide_illustrations').insert({ page_kind: kind, page_id: pageId, image_path: path })
    if (res.error) { await supabase.storage.from('guide-illustrations').remove([path]); setBusy(false); return say(false, res.error.message) }
    if (ill) await supabase.storage.from('guide-illustrations').remove([ill.image_path])
    setBusy(false); say(true, 'Picture saved.'); await load()
  }

  const removeAll = async () => {
    if (!ill || !window.confirm('Remove this picture and all its callouts?')) return
    const { error } = await supabase.from('guide_illustrations').delete().eq('id', ill.id)
    if (error) return say(false, error.message)
    await supabase.storage.from('guide-illustrations').remove([ill.image_path])
    say(true, 'Illustration removed.'); await load()
  }

  const addCallout = async () => {
    if (!ill) return
    const target = tKind === 'product' ? tProd?.id : tCat
    if (!target) return say(false, tKind === 'product' ? 'Pick the product this callout opens.' : 'Pick the category this callout opens.')
    const label = (tLabel.trim() || (tKind === 'product' ? tProd?.name : cats.find((c) => c.id === tCat)?.name) || '').slice(0, 80)
    const n = items.length
    const row = { illustration_id: ill.id, label, target_kind: tKind, target_id: target, px: 50, py: 50, lx: clampPct(15 + (n % 3) * 30), ly: clampPct(10 + Math.floor(n / 3) * 12), sort_order: n }
    const { data, error } = await supabase.from('guide_callouts').insert(row).select('id,label,target_kind,target_id,px,py,lx,ly').single()
    if (error) return say(false, error.message)
    const c = toCallout(data as Parameters<typeof toCallout>[0])
    setItems((cur) => [...cur, { ...c, code: tKind === 'product' ? tProd?.code ?? '' : cats.find((k) => k.id === c.targetId)?.name ?? '' }])
    setTLabel(''); setTProd(null); say(true, 'Callout added. Drag the dot onto the part and the label where you want it.')
  }

  const save = async (c: Item) => {
    const { error } = await supabase.from('guide_callouts').update({ px: c.px, py: c.py, lx: c.lx, ly: c.ly, label: c.label.slice(0, 80) }).eq('id', c.id)
    if (error) say(false, error.message)
  }
  const patch = (id: string, change: Partial<Item>) => setItems((cur) => cur.map((c) => (c.id === id ? { ...c, ...change } : c)))
  const del = async (id: string) => {
    const { error } = await supabase.from('guide_callouts').delete().eq('id', id)
    if (error) return say(false, error.message)
    setItems((cur) => cur.filter((c) => c.id !== id))
  }

  // drag a dot (p) or a label (l) with mouse or finger; arrow keys nudge it
  const down = (e: RPointerEvent<HTMLElement>) => { e.currentTarget.setPointerCapture(e.pointerId) }
  const move = (e: RPointerEvent<HTMLElement>, c: Item, part: 'p' | 'l') => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || !box.current) return
    const { x, y } = pointToPct(e.clientX, e.clientY, box.current.getBoundingClientRect())
    patch(c.id, part === 'p' ? { px: x, py: y } : { lx: x, ly: y })
  }
  const up = (e: RPointerEvent<HTMLElement>, id: string) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    const c = items.find((i) => i.id === id)
    if (c) void save(c)
  }
  const nudge = (e: React.KeyboardEvent, c: Item, part: 'p' | 'l') => {
    const d: Record<string, [number, number]> = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, -0.5], ArrowDown: [0, 0.5] }
    const v = d[e.key]; if (!v) return
    e.preventDefault()
    const n = part === 'p' ? { ...c, px: clampPct(c.px + v[0]), py: clampPct(c.py + v[1]) } : { ...c, lx: clampPct(c.lx + v[0]), ly: clampPct(c.ly + v[1]) }
    patch(c.id, n); void save(n)
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <p className="text-sm"><Link className="underline" to="/admin">Back to admin</Link></p>
      <h1 className="text-2xl font-bold">Guide illustrations</h1>
      <p className="text-sm text-steel-600">Put a picture on a category page or a product page of the Guide, then add callouts: a label and a page code joined by a line to a part of the picture. In the Guide, clicking a callout opens the page it points to, and its code turns red when you hover over it. Pages without a picture stay as they are.</p>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}

      <div className="grid gap-3 sm:grid-cols-[10rem_1fr] items-end border border-steel-300 bg-white p-3">
        <div><label htmlFor="ik" className="block text-sm font-medium">Page type</label>
          <select id="ik" className={`${f} w-full`} value={kind} onChange={(e) => { setKind(e.target.value as Kind); setProd(null) }}><option value="category">Category page</option><option value="product">Product page</option></select></div>
        <div>{kind === 'category'
          ? (<><label htmlFor="ic" className="block text-sm font-medium">Category</label>
            <select id="ic" className={`${f} w-full`} value={catId} onChange={(e) => setCatId(e.target.value)}><option value="">Choose a category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></>)
          : (<><label htmlFor="ip" className="block text-sm font-medium">Product</label><ProductPicker id="ip" value={prod} onChange={setProd} /></>)}</div>
      </div>

      {pageId && (
        <div className="space-y-2">
          <label htmlFor="if" className="block text-sm font-medium">{ill ? 'Replace the picture' : 'Choose the picture'} (PNG, JPG or WEBP, up to 5 MB)</label>
          <input id="if" type="file" accept=".png,.jpg,.jpeg,.webp" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} />
          {ill && <button className="ml-3 border border-steel-300 bg-white px-3 py-1 text-sm text-red-700 hover:bg-steel-100" onClick={() => void removeAll()}>Remove illustration</button>}
        </div>)}

      {ill && url && (<>
        <div ref={box} className="relative max-w-3xl border border-steel-300 bg-white select-none touch-none">
          <img src={url} alt="Illustration being edited" draggable={false} className="block w-full h-auto" />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none">
            {items.map((c) => <line key={c.id} x1={c.lx} y1={c.ly} x2={c.px} y2={c.py} stroke="#003080" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
          </svg>
          {items.map((c) => (
            <span key={c.id}>
              <button type="button" aria-label={`Move the dot of ${c.label || c.code}`} title="Drag onto the part (arrow keys nudge)" style={{ left: `${c.px}%`, top: `${c.py}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white bg-belt-700 cursor-grab touch-none"
                onPointerDown={down} onPointerMove={(e) => move(e, c, 'p')} onPointerUp={(e) => up(e, c.id)} onKeyDown={(e) => nudge(e, c, 'p')} />
              <button type="button" aria-label={`Move the label of ${c.label || c.code}`} title="Drag to place the label (arrow keys nudge)" style={{ left: `${c.lx}%`, top: `${c.ly}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 max-w-[34%] text-center bg-white/90 border border-dashed border-steel-600 px-1 text-[10px] font-bold uppercase leading-tight cursor-grab touch-none"
                onPointerDown={down} onPointerMove={(e) => move(e, c, 'l')} onPointerUp={(e) => up(e, c.id)} onKeyDown={(e) => nudge(e, c, 'l')}>
                {c.label}<span className="block font-mono">{c.code}</span></button>
            </span>))}
        </div>
        <p className="text-xs text-steel-600">Drag the round dot onto the part of the picture, and the label box to where the text and code should sit. Positions save when you let go.</p>

        <section aria-labelledby="nc" className="border border-steel-300 bg-white p-3 space-y-2">
          <h2 id="nc" className="font-semibold">Add a callout</h2>
          <div className="grid gap-2 sm:grid-cols-[9rem_1fr_1fr_auto] items-end">
            <div><label htmlFor="tk" className="block text-sm font-medium">Opens a</label><select id="tk" className={`${f} w-full`} value={tKind} onChange={(e) => setTKind(e.target.value as Kind)}><option value="product">Product page</option><option value="category">Category page</option></select></div>
            <div>{tKind === 'product'
              ? (<><label htmlFor="tp" className="block text-sm font-medium">Product</label><ProductPicker id="tp" value={tProd} onChange={setTProd} /></>)
              : (<><label htmlFor="tc" className="block text-sm font-medium">Category</label><select id="tc" className={`${f} w-full`} value={tCat} onChange={(e) => setTCat(e.target.value)}><option value="">Choose a category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></>)}</div>
            <div><label htmlFor="tl" className="block text-sm font-medium">Label (optional)</label><input id="tl" className={`${f} w-full`} maxLength={80} value={tLabel} onChange={(e) => setTLabel(e.target.value)} placeholder="Shown above the code" /></div>
            <button className="bg-belt-700 text-white px-4 py-2" onClick={() => void addCallout()}>Add</button>
          </div>
        </section>

        {items.length > 0 && (
          <div className="overflow-x-auto border border-steel-300 bg-white"><table className="w-full text-sm">
            <thead className="bg-steel-100 text-left"><tr><th className="px-3 py-2">Opens</th><th className="px-3 py-2">Label</th><th className="px-3 py-2"></th></tr></thead>
            <tbody>{items.map((c) => (
              <tr key={c.id} className="border-t border-steel-300">
                <td className="px-3 py-2 whitespace-nowrap"><span className="text-xs text-steel-600">{c.targetKind === 'product' ? 'Product' : 'Category'}</span> <span className="font-mono font-bold">{c.code}</span></td>
                <td className="px-3 py-2"><label className="sr-only" htmlFor={`l${c.id}`}>Label</label><input id={`l${c.id}`} className={`${f} w-full`} maxLength={80} value={c.label} onChange={(e) => patch(c.id, { label: e.target.value })} onBlur={() => void save(c)} /></td>
                <td className="px-3 py-2 text-right"><button className="text-red-700 underline" onClick={() => void del(c.id)}>Delete</button></td>
              </tr>))}</tbody></table></div>)}
      </>)}
    </div>
  )
}
