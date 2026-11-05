import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FileText, Info } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { show } from '../lib/format'
import { openDocument, pagePreviewUrl, thumbsFor } from '../lib/catalogue'
import AddToBom, { CompareToggle } from '../components/AddToBom'
import ShareBar from '../components/ShareBar'
import { CodeBoxes, Frame, Gallery } from '../components/ImageViewer'
import { AddToRfqButton } from '../components/RfqDrawer'

interface Detail {
  id: string; product_code: string; name: string; category_id: string | null; brand: string | null; description: string | null; material: string | null
  pitch_mm: number | null; width_mm: number | null; thickness_mm: number | null; colour: string | null; application: string | null
  verification_status: string; source_page: number | null; drawing_ref: string | null
  product_category_links: { category_id: string; product_categories: { name: string } | null }[]
  product_categories: { name: string } | null; catalogues: { name: string; edition: string | null } | null
  product_specifications: { spec_key: string; spec_value: string; unit: string | null; source_page: number | null }[]
  technical_documents: { id: string; title: string; doc_type: string; storage_path: string }[]
}
interface Sibling { id: string; product_code: string; name: string; material: string | null; pitch_mm: number | null; width_mm: number | null }

const STATUS: Record<string, string> = { verified: 'Verified', needs_review: 'Needs review', unverified: 'Not yet verified' }
interface Field { label: string; value: string; to?: string; hint?: string }
const LINK = 'underline decoration-dotted underline-offset-2 hover:text-brand-green'

/** A small clickable card with an icon, like the info boxes on a printed catalogue page. */
function InfoCard({ icon, to, children }: { icon: React.ReactNode; to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="flex gap-2 items-start border border-steel-300 rounded-md p-2 bg-white text-xs leading-snug hover:shadow-md hover:border-brand-green">
      <span className="text-brand-green shrink-0" aria-hidden="true">{icon}</span><span className="flex-1">{children}</span>
    </Link>
  )
}

/** `sheet` shows the product as a catalogue page: go-to column, centre, info cards, and a table of the catalogue below. */
export default function ProductDetail({ sheet = false }: { sheet?: boolean }) {
  const { id, kind } = useParams()
  const nav = useNavigate()
  const [p, setP] = useState<Detail | null>(null)
  const [related, setRelated] = useState<{ id: string; product_code: string; name: string }[]>([])
  const [relThumbs, setRelThumbs] = useState<Map<string, string>>(new Map())
  const [siblings, setSiblings] = useState<Sibling[]>([])
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [images, setImages] = useState<{ url: string; caption: string | null }[]>([])
  const [catDocs, setCatDocs] = useState<{ id: string; title: string; doc_type: string; storage_path: string }[]>([])

  useEffect(() => {
    let live = true
    setP(null); setPreview(null); setImages([]); setRelated([]); setRelThumbs(new Map()); setSiblings([]); setCatDocs([]); setErr('')
    ;(async () => {
      const { data, error } = await supabase.from('products')
        .select('*,product_categories!category_id(name),product_category_links(category_id,product_categories(name)),catalogues(name,edition),product_specifications(spec_key,spec_value,unit,source_page),technical_documents(id,title,doc_type,storage_path)')
        .eq('id', id ?? '').maybeSingle()
      if (!live) return
      if (error) return setErr(error.message)
      if (!data) return setErr('Product not found, or you do not have access to it.')
      setP(data as unknown as Detail)
      const catIds = ((data.product_category_links ?? []) as { category_id: string }[]).map((l) => l.category_id)
      if (catIds.length) {
        const cd = await supabase.from('technical_documents').select('id,title,doc_type,storage_path').in('category_id', catIds)
        if (live && cd.data) setCatDocs(cd.data as { id: string; title: string; doc_type: string; storage_path: string }[])
      }
      void pagePreviewUrl(data.source_page as number | null).then((u) => live && setPreview(u))
      const im = await supabase.from('product_images').select('storage_path,caption').eq('product_id', data.id).order('sort_order')
      if (im.data?.length) {
        const signed = await supabase.storage.from('product-images').createSignedUrls(im.data.map((i) => i.storage_path as string), 300)
        if (live && signed.data) setImages(signed.data.flatMap((u, n) => (u.signedUrl ? [{ url: u.signedUrl, caption: im.data[n].caption as string | null }] : [])))
      }
      const rel = await supabase.from('product_relations').select('related_product_id').eq('product_id', data.id)
      const ids = (rel.data ?? []).map((r) => r.related_product_id as string)
      if (ids.length) {
        const r2 = await supabase.from('products').select('id,product_code,name').in('id', ids)
        if (live && r2.data) setRelated(r2.data)
      }
    })()
    return () => { live = false }
  }, [id])

  useEffect(() => {
    if (!sheet || related.length === 0) return
    let live = true
    thumbsFor(related.map((r) => r.id)).then((m) => live && setRelThumbs(m)).catch(() => undefined)
    return () => { live = false }
  }, [sheet, related])

  const categoryId = p?.category_id ?? null
  useEffect(() => {
    if (!sheet || !categoryId) return
    let live = true
    ;(async () => {
      const l = await supabase.from('product_category_links').select('product_id').eq('category_id', categoryId).limit(80)
      const ids = ((l.data ?? []) as { product_id: string }[]).map((r) => r.product_id)
      if (ids.length === 0) return
      const d = await supabase.from('products').select('id,product_code,name,material,pitch_mm,width_mm').in('id', ids)
      const rows = ((d.data ?? []) as Sibling[]).sort((a, b) => a.product_code.localeCompare(b.product_code, undefined, { numeric: true }))
      if (live) setSiblings(rows)
    })()
    return () => { live = false }
  }, [sheet, categoryId, id])

  if (err) return <p role="alert" className="text-red-700">{err} <Link className="underline" to="/catalogue">Back to catalogue</Link></p>
  if (!p) return <p role="status" className="text-steel-600">Loading product…</p>

  const inGuide = Boolean(kind)
  const toProd = (pid: string) => (inGuide ? `/guide/p/${pid}` : `/products/${pid}`)
  const toCat = (cid: string) => (inGuide ? `/guide/c/${cid}` : `/catalogue?category=${cid}`)
  const find = (qs: string) => `/catalogue?${qs}`
  const enc = encodeURIComponent
  const mm = (v: number | null) => (v === null ? show(null) : `${v} mm`)
  const catNames = show((p.product_category_links ?? []).map((l) => l.product_categories?.name).filter(Boolean).join(', ') || p.product_categories?.name)
  const fields: Field[] = [
    { label: 'Product code', value: p.product_code }, { label: 'Categories', value: catNames },
    { label: 'Brand', value: show(p.brand), to: p.brand ? find(`brand=${enc(p.brand)}`) : undefined, hint: 'See all products of this brand' },
    { label: 'Material', value: show(p.material), to: p.material ? find(`material=${enc(p.material)}`) : undefined, hint: 'See all products in this material' },
    { label: 'Pitch', value: mm(p.pitch_mm), to: p.pitch_mm !== null ? find(`pitch=${p.pitch_mm}`) : undefined, hint: 'See all products with this pitch' },
    { label: 'Width', value: mm(p.width_mm), to: p.width_mm !== null ? find(`width=${p.width_mm}`) : undefined, hint: 'See all products with this width' },
    { label: 'Thickness', value: mm(p.thickness_mm), to: p.thickness_mm !== null ? find(`thickness=${p.thickness_mm}`) : undefined, hint: 'See all products with this thickness' },
    { label: 'Colour', value: show(p.colour), to: p.colour ? find(`q=${enc(p.colour)}`) : undefined, hint: 'Search for this colour' },
    { label: 'Application', value: show(p.application), to: p.application ? find(`q=${enc(p.application)}`) : undefined, hint: 'Search for this application' },
    { label: 'Catalogue', value: p.catalogues ? `${p.catalogues.name}${p.catalogues.edition ? ` (${p.catalogues.edition})` : ''}` : show(null) },
    { label: 'Catalogue page', value: show(p.source_page) }, { label: 'Drawing reference', value: show(p.drawing_ref) },
  ]
  const verified = p.verification_status === 'verified'
  const galleryImages = [...images.map((i) => ({ url: i.url, caption: i.caption })), ...(preview ? [{ url: preview, caption: `Catalogue page ${p.source_page}` }] : [])]
  const allDocs = [...p.technical_documents, ...catDocs.filter((c) => !p.technical_documents.some((d) => d.id === c.id))]

  const statusBox = (
    <div className={`px-3 py-2 text-sm ${verified ? 'bg-green-100 text-green-950' : 'bg-amber-100 text-amber-950'}`}>
      <strong>{STATUS[p.verification_status] ?? show(null)}</strong>
      {!verified && <p>Not checked against the original catalogue. Check page {show(p.source_page)} before relying on it.</p>}
    </div>
  )
  const selectionBox = <div className="print:hidden space-y-3 border border-steel-300 bg-white p-3"><h2 className="font-semibold">My selection</h2><AddToBom productId={p.id} /><AddToRfqButton id={p.id} code={p.product_code} name={p.name} /><CompareToggle id={p.id} /></div>
  const techBlock = (
    <section aria-labelledby="td"><h2 id="td" className="font-semibold mb-2">Technical data</h2>
      <dl className="grid sm:grid-cols-2 gap-px bg-steel-300 border border-steel-300">
        {fields.map((f) => (
          <div key={f.label} className="bg-white px-3 py-2"><dt className="text-xs text-steel-600">{f.label}</dt>
            <dd>{f.label === 'Categories' && p.product_category_links.length > 0
              ? p.product_category_links.map((l, i) => <span key={l.category_id}>{i > 0 ? ', ' : ''}<Link className={LINK} to={toCat(l.category_id)} title="Open this catalogue">{l.product_categories?.name ?? show(null)}</Link></span>)
              : f.to ? <Link className={LINK} to={f.to} title={f.hint}>{f.value}</Link> : f.value}</dd></div>))}
      </dl>
      <p className="mt-1 text-xs text-steel-600 print:hidden">Click an underlined value to see every product with it.</p>
    </section>
  )
  const specBlock = (
    <section aria-labelledby="sp"><h2 id="sp" className="font-semibold mb-2">Specifications</h2>
      {p.product_specifications.length === 0 ? <p className="text-steel-600">{show(null)}</p> : (
        <table className="w-full text-sm border border-steel-300 bg-white"><tbody>
          {p.product_specifications.map((s) => <tr key={s.spec_key} className="border-t border-steel-300"><th scope="row" className="text-left px-3 py-2 font-medium">{s.spec_key}</th><td className="px-3 py-2"><Link className={LINK} to={find(`q=${enc(s.spec_value)}`)} title="See all products with this value">{s.spec_value}{s.unit ? ` ${s.unit}` : ''}</Link></td><td className="px-3 py-2 text-steel-600">{s.source_page ? `p. ${s.source_page}` : ''}</td></tr>)}
        </tbody></table>)}
    </section>
  )
  const docsBlock = (
    <section aria-labelledby="dc"><h2 id="dc" className="font-semibold mb-1">Documents</h2>
      {allDocs.length === 0 ? <p className="text-sm text-steel-600">{show(null)}</p> : (
        <ul className="text-sm space-y-1">{allDocs.map((d) => <li key={d.id}>{d.title} <span className="text-steel-600">({d.doc_type})</span> <button className="underline ml-1" onClick={() => void openDocument('technical-documents', d.storage_path).catch((e: Error) => setErr(e.message))}>Download</button></li>)}</ul>)}
      <p className="mt-1 text-xs"><Link className="underline" to={`/documents?q=${encodeURIComponent(p.product_code)}`}>All documents for this product</Link></p>
    </section>
  )

  if (sheet) {
    const cell = (v: string | number | null, qs: (x: string) => string) => (v === null || v === '' ? <span className="text-steel-600">Not available</span>
      : <Link className={LINK} to={find(qs(String(v)))} title="See all products with this value" onClick={(e) => e.stopPropagation()}>{String(v)}</Link>)
    return (
      <article className="space-y-4">
        <ShareBar kind="product" id={p.id} name={p.name} />
        <div><h2 className="text-lg font-bold">{p.name}</h2>{p.description && <p className="text-sm text-steel-800 mt-1">{p.description}</p>}</div>
        <div className="grid gap-4 lg:grid-cols-[10.5rem_minmax(0,1fr)_12.5rem]">
          <aside aria-label="Go to related products" className="space-y-3 order-2 lg:order-1">
            <h3 className="text-xs font-bold uppercase tracking-wide">Related products · go to:</h3>
            {related.length === 0 ? <p className="text-xs text-steel-600">No related products linked yet.</p> : (
              <ul className="space-y-3">{related.map((r) => (
                <li key={r.id}><Link to={toProd(r.id)} className="block text-center border border-steel-300 rounded-md p-2 bg-white hover:shadow-md hover:border-brand-green">
                  <Frame src={relThumbs.get(r.id)} alt={r.name} /><span className="block mt-1 text-[11px] leading-tight font-semibold">{r.name}</span><span className="mt-1 inline-block"><CodeBoxes code={r.product_code} /></span></Link></li>))}</ul>)}
          </aside>
          <div className="space-y-5 min-w-0 order-1 lg:order-2">
            <section aria-label="Images"><Gallery name={p.name} images={galleryImages} />
              {galleryImages.length === 0 && <p className="mt-2 text-sm text-steel-600">No images yet. See page {show(p.source_page)} of the original catalogue.</p>}</section>
            {techBlock}{specBlock}{docsBlock}
          </div>
          <aside aria-label="Information" className="space-y-3 order-3">
            {statusBox}
            {p.product_category_links.slice(0, 4).map((l) => <InfoCard key={l.category_id} icon={<Info size={20} />} to={toCat(l.category_id)}>Introduction to <b>{l.product_categories?.name}</b>. Go to the catalogue.</InfoCard>)}
            <InfoCard icon={<FileText size={20} />} to={`/documents?q=${enc(p.product_code)}`}>Documents: <b>{allDocs.length}</b> file{allDocs.length === 1 ? '' : 's'}. Go to documents.</InfoCard>
            {selectionBox}
          </aside>
        </div>
        {siblings.length > 1 && (
          <section aria-labelledby="sib"><h3 id="sib" className="text-xs font-bold uppercase tracking-wide mb-1">More in {p.product_categories?.name ?? 'this catalogue'} · click to open</h3>
            <div className="overflow-x-auto border border-steel-300 rounded-md"><table className="w-full text-sm">
              <thead className="bg-steel-100 text-left"><tr>{['Code', 'Name', 'Material', 'Pitch (mm)', 'Width (mm)'].map((h) => <th key={h} className="px-3 py-1.5 whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>{siblings.map((r) => (
                <tr key={r.id} onClick={() => nav(toProd(r.id))} className={`border-t border-steel-300 cursor-pointer hover:bg-belt-100 ${r.id === p.id ? 'bg-belt-100 font-semibold' : ''}`}>
                  <td className="px-3 py-1.5 whitespace-nowrap"><Link to={toProd(r.id)} className="font-mono font-bold hover:text-brand-green" onClick={(e) => e.stopPropagation()}>{r.product_code}</Link></td>
                  <td className="px-3 py-1.5">{r.name}</td>
                  <td className="px-3 py-1.5">{cell(r.material, (v) => `material=${enc(v)}`)}</td>
                  <td className="px-3 py-1.5">{cell(r.pitch_mm, (v) => `pitch=${v}`)}</td>
                  <td className="px-3 py-1.5">{cell(r.width_mm, (v) => `width=${v}`)}</td></tr>))}</tbody></table></div>
          </section>)}
      </article>
    )
  }

  return (
    <article className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-sm text-steel-600">
        <Link className="underline" to={inGuide ? '/guide' : '/catalogue'}>{inGuide ? 'Guide index' : 'Catalogue'}</Link> / {p.category_id ? <Link className="underline" to={toCat(p.category_id)}>{show(p.product_categories?.name)}</Link> : 'Uncategorised'} / <span>{p.product_code}</span>
      </nav>
      <header className="border-b border-steel-300 pb-3"><h1 className="text-2xl font-bold">{p.name}</h1><p className="font-mono text-steel-600">{p.product_code}</p></header>

      <ShareBar kind="product" id={p.id} name={p.name} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <section aria-label="Images">
            <Gallery name={p.name} images={galleryImages} />
            {galleryImages.length === 0 && <p className="mt-2 text-sm text-steel-600">No images yet. See page {show(p.source_page)} of the original catalogue.</p>}
          </section>
          <p>{show(p.description)}</p>
          {techBlock}{specBlock}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          {statusBox}{selectionBox}{docsBlock}
          <section aria-labelledby="rl"><h2 id="rl" className="font-semibold mb-1">Related products (go to)</h2>
            {related.length === 0 ? <p className="text-sm text-steel-600">{show(null)}</p> : (
              <ul className="text-sm space-y-1">{related.map((r) => <li key={r.id}><Link className="flex items-center gap-2 hover:text-brand-green" to={toProd(r.id)}><span className="font-mono text-xs border-2 border-steel-950 bg-white px-1.5 py-0.5">{r.product_code}</span><span className="truncate">{r.name}</span></Link></li>)}</ul>)}
          </section>
          <section aria-labelledby="rc"><h2 id="rc" className="font-semibold mb-1">Related catalogues (go to)</h2>
            {p.product_category_links.length === 0 ? <p className="text-sm text-steel-600">{show(null)}</p> : (
              <ul className="text-sm space-y-1">{p.product_category_links.map((l) => <li key={l.category_id}><Link className="underline hover:text-brand-green" to={toCat(l.category_id)}>{l.product_categories?.name ?? show(null)}</Link></li>)}</ul>)}
          </section>
        </aside>
      </div>
    </article>
  )
}
