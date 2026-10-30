import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { openDocument } from '../lib/catalogue'
import ProductPicker, { type PickedProduct } from '../components/ProductPicker'

interface Doc {
  id: string; title: string; doc_type: string; storage_path: string; required_permission: string; created_at: string
  product_id: string | null; category_id: string | null
  products: { id: string; product_code: string; name: string } | null; product_categories: { id: string; name: string } | null
}
const TYPES = ['datasheet', 'drawing', 'cad', 'other'] as const
type DocType = (typeof TYPES)[number]
const TYPE_LABEL: Record<string, string> = { datasheet: 'Datasheet', drawing: 'Drawing', cad: 'CAD file', other: 'Other' }
const EXT = /\.(pdf|dwg|dxf|step|stp|zip|png|jpg|jpeg)$/i
const MAX = 50 * 1024 * 1024
type Kind = 'none' | 'product' | 'category'
type Msg = { ok: boolean; text: string } | null

/** Choose what a document belongs to: nothing (general), one product, or one category. */
function LinkField({ kind, setKind, product, setProduct, cat, setCat, cats }: {
  kind: Kind; setKind: (k: Kind) => void; product: PickedProduct | null; setProduct: (p: PickedProduct | null) => void
  cat: string; setCat: (c: string) => void; cats: { id: string; name: string }[]
}) {
  const f = 'border border-steel-300 px-2 py-2 bg-white text-sm'
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Belongs to
        <select className={`${f} block mt-1 w-full`} value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
          <option value="none">Nothing (general document)</option><option value="product">One product</option><option value="category">One category</option>
        </select></label>
      {kind === 'product' && <ProductPicker value={product} onChange={setProduct} />}
      {kind === 'category' && <select aria-label="Category" className={`${f} w-full`} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Choose a category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
    </div>
  )
}

export default function Documents() {
  const { can } = useAuth()
  const [sp] = useSearchParams()
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [cats, setCats] = useState<{ id: string; name: string }[]>([])
  const [msg, setMsg] = useState<Msg>(null)
  const [q, setQ] = useState(sp.get('q') ?? '')
  const [typeFilter, setTypeFilter] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  // upload form
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<DocType>('datasheet')
  const [kind, setKind] = useState<Kind>('none')
  const [product, setProduct] = useState<PickedProduct | null>(null)
  const [cat, setCat] = useState('')
  // edit form
  const [editId, setEditId] = useState<string | null>(null)
  const [eTitle, setETitle] = useState('')
  const [eType, setEType] = useState<DocType>('datasheet')
  const [eKind, setEKind] = useState<Kind>('none')
  const [eProduct, setEProduct] = useState<PickedProduct | null>(null)
  const [eCat, setECat] = useState('')
  const admin = can('upload_documents')

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('technical_documents')
      .select('id,title,doc_type,storage_path,required_permission,created_at,product_id,category_id,products(id,product_code,name),product_categories(id,name)').order('created_at', { ascending: false })
    if (error) setMsg({ ok: false, text: error.message }); else { setDocs(data as unknown as Doc[]); setPicked(new Set()) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { supabase.from('product_categories').select('id,name').order('name').then(({ data }) => setCats(data ?? [])) }, [])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (docs ?? []).filter((d) => (!typeFilter || d.doc_type === typeFilter)
      && (!needle || [d.title, d.products?.product_code, d.products?.name, d.product_categories?.name].some((v) => v?.toLowerCase().includes(needle))))
  }, [docs, q, typeFilter])

  const download = async (d: Doc) => { try { await openDocument('technical-documents', d.storage_path) } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } }

  const upload = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null)
    if (!file || !title.trim()) return setMsg({ ok: false, text: 'Choose a file and enter a title.' })
    if (!EXT.test(file.name)) return setMsg({ ok: false, text: 'Allowed types: PDF, DWG, DXF, STEP, ZIP, PNG, JPG.' })
    if (file.size > MAX) return setMsg({ ok: false, text: 'File is larger than 50 MB.' })
    if (kind === 'product' && !product) return setMsg({ ok: false, text: 'Choose the product, or change "Belongs to".' })
    if (kind === 'category' && !cat) return setMsg({ ok: false, text: 'Choose the category, or change "Belongs to".' })
    setBusy(true)
    try {
      const path = `${type}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`
      const up = await supabase.storage.from('technical-documents').upload(path, file, { upsert: false })
      if (up.error) throw new Error(up.error.message)
      const ins = await supabase.from('technical_documents').insert({
        title: title.trim(), doc_type: type, storage_path: path, product_id: kind === 'product' ? product?.id : null, category_id: kind === 'category' ? cat : null,
        required_permission: type === 'cad' ? 'download_cad' : 'download_documents' })
      if (ins.error) { await supabase.storage.from('technical-documents').remove([path]); throw new Error(ins.error.message) }
      setMsg({ ok: true, text: 'Document uploaded.' }); setFile(null); setTitle(''); setKind('none'); setProduct(null); setCat(''); await load()
    } catch (er) { setMsg({ ok: false, text: (er as Error).message }) } finally { setBusy(false) }
  }

  const startEdit = (d: Doc) => {
    setEditId(d.id); setETitle(d.title); setEType(d.doc_type as DocType)
    setEKind(d.product_id ? 'product' : d.category_id ? 'category' : 'none')
    setEProduct(d.products ? { id: d.products.id, code: d.products.product_code, name: d.products.name } : null); setECat(d.category_id ?? '')
  }
  const saveEdit = async () => {
    if (!eTitle.trim()) return setMsg({ ok: false, text: 'Enter a title.' })
    if ((eKind === 'product' && !eProduct) || (eKind === 'category' && !eCat)) return setMsg({ ok: false, text: 'Choose what the document belongs to.' })
    const { error } = await supabase.from('technical_documents').update({
      title: eTitle.trim(), doc_type: eType, required_permission: eType === 'cad' ? 'download_cad' : 'download_documents',
      product_id: eKind === 'product' ? eProduct?.id : null, category_id: eKind === 'category' ? eCat : null }).eq('id', editId ?? '')
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Document updated.' })
    if (!error) { setEditId(null); await load() }
  }

  const removeMany = async (list: Doc[]) => {
    if (list.length === 0) return setMsg({ ok: false, text: 'Select at least one document.' })
    if (!window.confirm(list.length === 1 ? `Delete "${list[0].title}" permanently?` : `Delete ${list.length} documents permanently?`)) return
    const r = await supabase.from('technical_documents').delete().in('id', list.map((d) => d.id))
    if (r.error) return setMsg({ ok: false, text: r.error.message })
    await supabase.storage.from('technical-documents').remove(list.map((d) => d.storage_path))
    setMsg({ ok: true, text: `${list.length} document(s) deleted.` }); await load()
  }
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const f = 'border border-steel-300 px-3 py-2 bg-white text-sm'
  const btn = 'border border-steel-300 bg-white px-3 py-1 text-sm hover:bg-steel-100'
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">CAD and technical documents</h1>
        <p className="text-sm text-steel-600">Datasheets, drawings and CAD files. A document can belong to one product or one category, and appears on that product's page (a category document appears on every product in the category). CAD files need the CAD download permission.</p></div>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}

      <div className="flex flex-wrap gap-2 items-center">
        <label htmlFor="dq" className="sr-only">Search documents</label><input id="dq" className={`${f} w-64`} placeholder="Search title, product or category" value={q} onChange={(e) => setQ(e.target.value)} />
        <label htmlFor="dt" className="sr-only">Type</label>
        <select id="dt" className={f} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}><option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
        {(q || typeFilter) && <button className="text-sm underline" onClick={() => { setQ(''); setTypeFilter('') }}>Clear</button>}
        {admin && shown.length > 0 && (<span className="ml-auto flex flex-wrap gap-2 items-center text-sm">
          <span aria-live="polite">{picked.size} selected</span>
          <button className={btn} onClick={() => setPicked(new Set(shown.map((d) => d.id)))}>Select all shown</button>
          <button className={btn} onClick={() => setPicked(new Set())}>Clear selection</button>
          <button className={`${btn} text-red-700`} onClick={() => void removeMany((docs ?? []).filter((d) => picked.has(d.id)))}>Delete selected</button>
        </span>)}
      </div>

      {docs === null && !msg && <p role="status" className="text-steel-600">Loading documents…</p>}
      {docs && shown.length === 0 && <p className="text-steel-600">{docs.length === 0 ? 'No documents available to you yet. CAD files need the CAD download permission.' : 'No documents match.'}</p>}
      {shown.length > 0 && (
        <div className="overflow-x-auto border border-steel-300 bg-white rounded-md"><table className="w-full text-sm">
          <thead className="bg-steel-100 text-left"><tr>{admin && <th className="px-3 py-2"><span className="sr-only">Select</span></th>}{['Document', 'Type', 'Belongs to', 'Added', ''].map((h, i) => <th key={i} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{shown.map((d) => editId === d.id ? (
            <tr key={d.id} className="border-t border-steel-300 bg-belt-100 align-top"><td colSpan={admin ? 6 : 5} className="p-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">Title<input className={`${f} block mt-1 w-full`} maxLength={200} value={eTitle} onChange={(e) => setETitle(e.target.value)} /></label>
                <label className="block text-sm font-medium">Type<select className={`${f} block mt-1 w-full`} value={eType} onChange={(e) => setEType(e.target.value as DocType)}>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
              </div>
              <LinkField kind={eKind} setKind={setEKind} product={eProduct} setProduct={setEProduct} cat={eCat} setCat={setECat} cats={cats} />
              <div className="space-x-2"><button className="bg-belt-700 text-white px-4 py-1.5 text-sm" onClick={() => void saveEdit()}>Save</button><button className={btn} onClick={() => setEditId(null)}>Cancel</button></div>
            </td></tr>
          ) : (
            <tr key={d.id} className="border-t border-steel-300 align-top">
              {admin && <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${d.title}`} checked={picked.has(d.id)} onChange={() => toggle(d.id)} /></td>}
              <td className="px-3 py-2 font-medium">{d.title}</td>
              <td className="px-3 py-2"><span className="bg-steel-100 px-2 py-0.5 rounded text-xs">{TYPE_LABEL[d.doc_type] ?? d.doc_type}</span></td>
              <td className="px-3 py-2">{d.products ? <Link className="underline" to={`/products/${d.products.id}`}><span className="font-mono">{d.products.product_code}</span> {d.products.name}</Link>
                : d.product_categories ? <Link className="underline" to={`/catalogue?category=${d.product_categories.id}`}>Category: {d.product_categories.name}</Link> : <span className="text-steel-600">General</span>}</td>
              <td className="px-3 py-2 whitespace-nowrap">{new Date(d.created_at).toLocaleDateString()}</td>
              <td className="px-3 py-2 space-x-2 whitespace-nowrap">
                <button className={btn} onClick={() => void download(d)}>Download</button>
                {admin && <><button className={btn} onClick={() => startEdit(d)}>Edit</button><button className={`${btn} text-red-700`} onClick={() => void removeMany([d])}>Delete</button></>}
              </td></tr>))}</tbody></table></div>)}

      {admin && (
        <form onSubmit={upload} className="space-y-3 max-w-xl border border-steel-300 bg-white rounded-md p-4">
          <h2 className="font-semibold">Upload a document</h2>
          <div><label htmlFor="df" className="block text-sm font-medium">File (PDF, DWG, DXF, STEP, ZIP, PNG or JPG, up to 50 MB)</label><input id="df" type="file" accept=".pdf,.dwg,.dxf,.step,.stp,.zip,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div><label htmlFor="dti" className="block text-sm font-medium">Title</label><input id="dti" className={`${f} w-full`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label htmlFor="dty" className="block text-sm font-medium">Type</label>
            <select id="dty" className={f} value={type} onChange={(e) => setType(e.target.value as DocType)}>{TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></div>
          <LinkField kind={kind} setKind={setKind} product={product} setProduct={setProduct} cat={cat} setCat={setCat} cats={cats} />
          <button disabled={busy} className="bg-belt-700 text-white px-4 py-2 disabled:opacity-60">{busy ? 'Uploading…' : 'Upload'}</button>
        </form>)}
    </div>
  )
}
