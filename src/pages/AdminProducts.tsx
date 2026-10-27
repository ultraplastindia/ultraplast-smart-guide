import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { show } from '../lib/format'

const SIZE = 50
const EMPTY = { product_code: '', name: '', category_id: '', brand: '', description: '', material: '', pitch_mm: '', width_mm: '', thickness_mm: '',
  colour: '', application: '', status: 'draft', verification_status: 'unverified', catalogue_id: '', source_page: '', drawing_ref: '' }
type Form = typeof EMPTY
interface SpecRow { id?: string; origKey?: string; key: string; value: string; unit: string }
interface Img { id: string; storage_path: string; caption: string | null; sort_order: number; url: string }
type Msg = { ok: boolean; text: string } | null

const num = (s: string) => (s.trim() === '' ? null : /^\d+(\.\d+)?$/.test(s.trim()) ? Number(s) : NaN)
const nz = (s: string) => s.trim() || null
const friendly = (m: string) => (m.includes('products_code_catalogue_uq') ? 'Another product in this catalogue already has that code.' : m)

// Defined at module level so inputs keep focus while typing.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium">{label}<div className="font-normal mt-1">{children}</div></label>
}

export default function AdminProducts() {
  const { id } = useParams()
  return id ? <Editor id={id} /> : <List />
}

function List() {
  const [rows, setRows] = useState<{ id: string; product_code: string; name: string; status: string; verification_status: string; product_categories: { name: string } | null }[] | null>(null)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    let query = supabase.from('products').select('id,product_code,name,status,verification_status,product_categories(name)', { count: 'exact' })
      .order('created_at', { ascending: false }).range(page * SIZE, page * SIZE + SIZE - 1)
    const term = q.trim().replace(/[%_\\,()*]/g, '')
    if (term) query = query.or(`product_code.ilike.*${term}*,name.ilike.*${term}*`)
    if (status) query = query.eq('status', status)
    const { data, error, count } = await query
    if (error) return setErr(error.message)
    setErr(''); setRows(data as unknown as NonNullable<typeof rows>); setTotal(count ?? 0)
  }, [q, status, page])
  useEffect(() => { void load() }, [load])

  const f = 'border border-steel-300 px-3 py-2 bg-white'
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Products</h1><Link to="/admin/products/new" className="bg-belt-700 text-white px-4 py-2">New product</Link></div>
      <div className="flex flex-wrap gap-2">
        <label htmlFor="pq" className="sr-only">Search</label><input id="pq" className={f} placeholder="Code or name" value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} />
        <label htmlFor="ps" className="sr-only">Status</label>
        <select id="ps" className={f} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }}><option value="">All statuses</option><option value="draft">Draft</option><option value="active">Published</option><option value="archived">Archived</option></select>
      </div>
      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
      {rows === null && !err && <p role="status" className="text-steel-600">Loading…</p>}
      {rows?.length === 0 && <p className="text-steel-600">No products match.</p>}
      {rows && rows.length > 0 && (<>
        <p className="text-sm text-steel-600" aria-live="polite">{total} products</p>
        <div className="overflow-x-auto border border-steel-300 bg-white"><table className="w-full text-sm">
          <thead className="bg-steel-100 text-left"><tr>{['Code', 'Name', 'Category', 'Status', 'Data', ''].map((h, i) => <th key={i} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t border-steel-300">
              <td className="px-3 py-2 font-mono">{r.product_code}</td><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{show(r.product_categories?.name)}</td>
              <td className="px-3 py-2">{r.status === 'active' ? 'Published' : r.status === 'draft' ? 'Draft' : 'Archived'}</td>
              <td className="px-3 py-2">{r.verification_status === 'verified' ? 'Verified' : 'Not verified'}</td>
              <td className="px-3 py-2"><Link className="underline" to={`/admin/products/${r.id}`}>Edit</Link></td></tr>))}</tbody></table></div>
        <div className="flex gap-3 text-sm">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="border border-steel-300 px-3 py-1 disabled:opacity-40">Previous</button>
          <button disabled={(page + 1) * SIZE >= total} onClick={() => setPage(page + 1)} className="border border-steel-300 px-3 py-1 disabled:opacity-40">Next</button></div></>)}
    </div>
  )
}

function Editor({ id }: { id: string }) {
  const nav = useNavigate()
  const { session } = useAuth()
  const isNew = id === 'new'
  const [f, setF] = useState<Form>(EMPTY)
  const [specs, setSpecs] = useState<SpecRow[]>([])
  const [origIds, setOrigIds] = useState<string[]>([])
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [cats2, setCats2] = useState<{ id: string; name: string }[]>([])
  const [images, setImages] = useState<Img[]>([])
  const [caption, setCaption] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [c, k] = await Promise.all([supabase.from('product_categories').select('id,name').order('name'), supabase.from('catalogues').select('id,name').order('name')])
    setCats(c.data ?? []); setCats2(k.data ?? [])
    if (isNew) return
    const { data, error } = await supabase.from('products').select('*,product_specifications(id,spec_key,spec_value,unit),product_images(id,storage_path,caption,sort_order)').eq('id', id).maybeSingle()
    if (error || !data) return setMsg({ ok: false, text: error?.message ?? 'Product not found.' })
    const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
    setF({ product_code: s(data.product_code), name: s(data.name), category_id: s(data.category_id), brand: s(data.brand), description: s(data.description), material: s(data.material),
      pitch_mm: s(data.pitch_mm), width_mm: s(data.width_mm), thickness_mm: s(data.thickness_mm), colour: s(data.colour), application: s(data.application),
      status: s(data.status), verification_status: s(data.verification_status), catalogue_id: s(data.catalogue_id), source_page: s(data.source_page), drawing_ref: s(data.drawing_ref) })
    const rows = (data.product_specifications ?? []) as { id: string; spec_key: string; spec_value: string; unit: string | null }[]
    setSpecs(rows.map((r) => ({ id: r.id, origKey: r.spec_key, key: r.spec_key, value: r.spec_value, unit: r.unit ?? '' }))); setOrigIds(rows.map((r) => r.id))
    const imgs = ((data.product_images ?? []) as Omit<Img, 'url'>[]).sort((a, b) => a.sort_order - b.sort_order)
    const signed = imgs.length ? await supabase.storage.from('product-images').createSignedUrls(imgs.map((i) => i.storage_path), 300) : null
    setImages(imgs.map((i, n) => ({ ...i, url: signed?.data?.[n]?.signedUrl ?? '' })))
  }, [id, isNew])
  useEffect(() => { void load() }, [load])

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const fail = (text: string) => { setMsg({ ok: false, text: friendly(text) }); setBusy(false) }

  const save = async () => {
    setMsg(null)
    if (!f.product_code.trim() || !f.name.trim()) return fail('Product code and name are required.')
    const nums = { pitch_mm: num(f.pitch_mm), width_mm: num(f.width_mm), thickness_mm: num(f.thickness_mm) }
    if (Object.values(nums).some((v) => Number.isNaN(v))) return fail('Pitch, width and thickness must be plain numbers such as 25.4.')
    const sp = f.source_page.trim()
    if (sp && (!/^\d{1,6}$/.test(sp) || Number(sp) < 1)) return fail('Catalogue page must be a whole number of 1 or more.')
    const keep = specs.map((s) => ({ ...s, key: s.key.trim(), value: s.value.trim(), unit: s.unit.trim() })).filter((s) => s.key && s.value)
    if (new Set(keep.map((s) => s.key.toLowerCase())).size !== keep.length) return fail('Two specifications have the same name.')
    setBusy(true)
    const payload = { product_code: f.product_code.trim(), name: f.name.trim(), category_id: f.category_id || null, brand: nz(f.brand), description: nz(f.description), material: nz(f.material),
      ...nums, colour: nz(f.colour), application: nz(f.application), status: f.status, verification_status: f.verification_status, catalogue_id: f.catalogue_id || null,
      source_page: sp ? Number(sp) : null, drawing_ref: nz(f.drawing_ref) }
    let pid = id
    if (isNew) {
      const r = await supabase.from('products').insert({ ...payload, created_by: session?.user.id }).select('id').single()
      if (r.error) return fail(r.error.message)
      pid = r.data.id
    } else {
      const r = await supabase.from('products').update(payload).eq('id', id)
      if (r.error) return fail(r.error.message)
    }
    const stay = new Set(keep.filter((s) => s.id && s.origKey === s.key).map((s) => s.id as string))
    const removed = origIds.filter((x) => !stay.has(x))
    if (removed.length) { const r = await supabase.from('product_specifications').delete().in('id', removed); if (r.error) return fail(r.error.message) }
    if (keep.length) {
      const r = await supabase.from('product_specifications').upsert(keep.map((s) => ({ product_id: pid, spec_key: s.key, spec_value: s.value, unit: s.unit || null, source_page: sp ? Number(sp) : null })), { onConflict: 'product_id,spec_key' })
      if (r.error) return fail(r.error.message)
    }
    setBusy(false); setMsg({ ok: true, text: 'Saved.' })
    if (isNew) nav(`/admin/products/${pid}`, { replace: true }); else await load()
  }

  const upload = async (file: File | null) => {
    if (!file || isNew) return
    setMsg(null)
    if (!/\.(png|jpe?g|webp)$/i.test(file.name)) return fail('Images must be PNG, JPG or WEBP.')
    if (file.size > 5 * 1024 * 1024) return fail('Image is larger than 5 MB.')
    setBusy(true)
    const path = `${id}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`
    const up = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type, upsert: false })
    if (up.error) return fail(up.error.message)
    const ins = await supabase.from('product_images').insert({ product_id: id, storage_path: path, caption: nz(caption), sort_order: images.length, is_primary: images.length === 0 })
    if (ins.error) { await supabase.storage.from('product-images').remove([path]); return fail(ins.error.message) }
    setCaption(''); setBusy(false); setMsg({ ok: true, text: 'Image uploaded.' }); await load()
  }
  const removeImage = async (img: Img) => {
    if (!window.confirm('Delete this image?')) return
    const r = await supabase.from('product_images').delete().eq('id', img.id)
    if (r.error) return fail(r.error.message)
    await supabase.storage.from('product-images').remove([img.storage_path]); await load()
  }

  const inp = 'border border-steel-300 px-2 py-2 bg-white w-full'
  return (
    <div className="space-y-6 max-w-4xl">
      <p className="text-sm"><Link className="underline" to="/admin/products">Back to products</Link></p>
      <h1 className="text-2xl font-bold">{isNew ? 'New product' : 'Edit product'}</h1>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
      <section aria-labelledby="gd" className="grid gap-3 sm:grid-cols-2">
        <h2 id="gd" className="sm:col-span-2 font-semibold">Details</h2>
        <Field label="Product code *"><input className={inp} maxLength={120} value={f.product_code} onChange={set('product_code')} /></Field>
        <Field label="Name *"><input className={inp} maxLength={300} value={f.name} onChange={set('name')} /></Field>
        <Field label="Category"><select className={inp} value={f.category_id} onChange={set('category_id')}><option value="">No category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Brand"><input className={inp} maxLength={200} value={f.brand} onChange={set('brand')} /></Field>
        <Field label="Material"><input className={inp} maxLength={200} value={f.material} onChange={set('material')} /></Field>
        <Field label="Colour"><input className={inp} maxLength={100} value={f.colour} onChange={set('colour')} /></Field>
        <Field label="Pitch (mm)"><input className={inp} inputMode="decimal" value={f.pitch_mm} onChange={set('pitch_mm')} /></Field>
        <Field label="Width (mm)"><input className={inp} inputMode="decimal" value={f.width_mm} onChange={set('width_mm')} /></Field>
        <Field label="Thickness (mm)"><input className={inp} inputMode="decimal" value={f.thickness_mm} onChange={set('thickness_mm')} /></Field>
        <Field label="Application"><input className={inp} maxLength={500} value={f.application} onChange={set('application')} /></Field>
        <div className="sm:col-span-2"><Field label="Description"><textarea className={inp} rows={3} maxLength={4000} value={f.description} onChange={set('description')} /></Field></div>
        <Field label="Catalogue"><select className={inp} value={f.catalogue_id} onChange={set('catalogue_id')}><option value="">None</option>{cats2.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Catalogue page"><input className={inp} inputMode="numeric" value={f.source_page} onChange={set('source_page')} /></Field>
        <Field label="Drawing reference"><input className={inp} maxLength={200} value={f.drawing_ref} onChange={set('drawing_ref')} /></Field>
        <div />
        <Field label="Visibility"><select className={inp} value={f.status} onChange={set('status')}><option value="draft">Draft (hidden from users)</option><option value="active">Published</option><option value="archived">Archived</option></select></Field>
        <Field label="Data status"><select className={inp} value={f.verification_status} onChange={set('verification_status')}><option value="unverified">Not verified</option><option value="needs_review">Needs review</option><option value="verified">Verified against catalogue</option></select></Field>
      </section>

      <section aria-labelledby="sp" className="space-y-2">
        <h2 id="sp" className="font-semibold">Specifications</h2>
        {specs.length === 0 && <p className="text-sm text-steel-600">None yet.</p>}
        {specs.map((s, i) => (
          <div key={i} className="grid gap-2 grid-cols-[1fr_1fr_6rem_auto]">
            <input aria-label="Specification name" className={inp} placeholder="Name" value={s.key} onChange={(e) => setSpecs(specs.map((x, n) => (n === i ? { ...x, key: e.target.value } : x)))} />
            <input aria-label="Specification value" className={inp} placeholder="Value" value={s.value} onChange={(e) => setSpecs(specs.map((x, n) => (n === i ? { ...x, value: e.target.value } : x)))} />
            <input aria-label="Unit" className={inp} placeholder="Unit" value={s.unit} onChange={(e) => setSpecs(specs.map((x, n) => (n === i ? { ...x, unit: e.target.value } : x)))} />
            <button className="underline text-sm" onClick={() => setSpecs(specs.filter((_, n) => n !== i))}>Remove</button>
          </div>))}
        <button className="border border-steel-300 bg-white px-3 py-1 text-sm" onClick={() => setSpecs([...specs, { key: '', value: '', unit: '' }])}>Add specification</button>
      </section>

      <div><button disabled={busy} onClick={() => void save()} className="bg-belt-700 text-white px-5 py-2 disabled:opacity-60">{busy ? 'Saving…' : 'Save product'}</button></div>

      <section aria-labelledby="im" className="space-y-2">
        <h2 id="im" className="font-semibold">Images</h2>
        {isNew ? <p className="text-sm text-steel-600">Save the product first, then add images.</p> : (<>
          <div className="flex flex-wrap items-end gap-2">
            <div><label htmlFor="ic" className="block text-xs text-steel-600">Caption (optional)</label><input id="ic" className={inp} maxLength={200} value={caption} onChange={(e) => setCaption(e.target.value)} /></div>
            <div><label htmlFor="if" className="block text-xs text-steel-600">Image (PNG, JPG or WEBP, up to 5 MB)</label><input id="if" type="file" accept=".png,.jpg,.jpeg,.webp" onChange={(e) => { void upload(e.target.files?.[0] ?? null); e.target.value = '' }} /></div>
          </div>
          {images.length === 0 ? <p className="text-sm text-steel-600">No images yet.</p> : (
            <ul className="flex flex-wrap gap-3">{images.map((im) => (
              <li key={im.id} className="border border-steel-300 bg-white p-2 text-sm">
                {im.url ? <img src={im.url} alt={im.caption ?? 'Product'} className="h-32" /> : <p className="h-32 grid place-items-center">Not available</p>}
                <p className="mt-1">{im.caption ?? ''}</p><button className="underline text-red-700" onClick={() => void removeImage(im)}>Delete</button></li>))}</ul>)}
        </>)}
      </section>
    </div>
  )
}
