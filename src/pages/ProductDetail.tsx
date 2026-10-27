import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { show } from '../lib/format'
import { openDocument, pagePreviewUrl } from '../lib/catalogue'
import AddToBom, { CompareToggle } from '../components/AddToBom'

interface Detail {
  id: string; product_code: string; name: string; category_id: string | null; brand: string | null; description: string | null; material: string | null
  pitch_mm: number | null; width_mm: number | null; thickness_mm: number | null; colour: string | null; application: string | null
  verification_status: string; source_page: number | null; drawing_ref: string | null
  product_categories: { name: string } | null; catalogues: { name: string; edition: string | null } | null
  product_specifications: { spec_key: string; spec_value: string; unit: string | null; source_page: number | null }[]
  technical_documents: { id: string; title: string; doc_type: string; storage_path: string }[]
}

const STATUS: Record<string, string> = { verified: 'Verified', needs_review: 'Needs review', unverified: 'Not yet verified' }

export default function ProductDetail() {
  const { id } = useParams()
  const [p, setP] = useState<Detail | null>(null)
  const [related, setRelated] = useState<{ id: string; product_code: string; name: string }[]>([])
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [images, setImages] = useState<{ url: string; caption: string | null }[]>([])

  useEffect(() => {
    let live = true
    setP(null); setPreview(null); setImages([]); setRelated([]); setErr('')
    ;(async () => {
      const { data, error } = await supabase.from('products')
        .select('*,product_categories(name),catalogues(name,edition),product_specifications(spec_key,spec_value,unit,source_page),technical_documents(id,title,doc_type,storage_path)')
        .eq('id', id ?? '').maybeSingle()
      if (!live) return
      if (error) return setErr(error.message)
      if (!data) return setErr('Product not found, or you do not have access to it.')
      setP(data as unknown as Detail)
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

  if (err) return <p role="alert" className="text-red-700">{err} <Link className="underline" to="/catalogue">Back to catalogue</Link></p>
  if (!p) return <p role="status" className="text-steel-600">Loading product…</p>

  const mm = (v: number | null) => (v === null ? show(null) : `${v} mm`)
  const fields: [string, string][] = [
    ['Product code', p.product_code], ['Category', show(p.product_categories?.name)], ['Brand', show(p.brand)],
    ['Material', show(p.material)], ['Pitch', mm(p.pitch_mm)], ['Width', mm(p.width_mm)], ['Thickness', mm(p.thickness_mm)],
    ['Colour', show(p.colour)], ['Application', show(p.application)],
    ['Catalogue', p.catalogues ? `${p.catalogues.name}${p.catalogues.edition ? ` (${p.catalogues.edition})` : ''}` : show(null)],
    ['Catalogue page', show(p.source_page)], ['Drawing reference', show(p.drawing_ref)],
  ]
  const verified = p.verification_status === 'verified'
  return (
    <article className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-sm text-steel-600">
        <Link className="underline" to="/catalogue">Catalogue</Link> / {p.category_id ? <Link className="underline" to={`/catalogue?category=${p.category_id}`}>{show(p.product_categories?.name)}</Link> : 'Uncategorised'} / <span>{p.product_code}</span>
      </nav>
      <header className="border-b border-steel-300 pb-3"><h1 className="text-2xl font-bold">{p.name}</h1><p className="font-mono text-steel-600">{p.product_code}</p></header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-6">
          <section aria-label="Catalogue page" className="border border-steel-300 bg-white">
            {preview ? (
              <figure><img src={preview} alt={`Catalogue page ${p.source_page}`} className="w-full" /><figcaption className="px-3 py-2 text-xs text-steel-600">Catalogue page {p.source_page}</figcaption></figure>
            ) : (
              <p className="p-6 text-sm text-steel-600">No page image has been uploaded for this product. See page {show(p.source_page)} of the original catalogue.</p>)}
          </section>
          {images.length > 0 && <div className="flex flex-wrap gap-3">{images.map((i) => <img key={i.url} src={i.url} alt={i.caption ?? p.name} className="h-40 border border-steel-300 bg-white" />)}</div>}
          <p>{show(p.description)}</p>
          <section aria-labelledby="td"><h2 id="td" className="font-semibold mb-2">Technical data</h2>
            <dl className="grid sm:grid-cols-2 gap-px bg-steel-300 border border-steel-300">
              {fields.map(([k, v]) => <div key={k} className="bg-white px-3 py-2"><dt className="text-xs text-steel-600">{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </section>
          <section aria-labelledby="sp"><h2 id="sp" className="font-semibold mb-2">Specifications</h2>
            {p.product_specifications.length === 0 ? <p className="text-steel-600">{show(null)}</p> : (
              <table className="w-full text-sm border border-steel-300 bg-white"><tbody>
                {p.product_specifications.map((s) => <tr key={s.spec_key} className="border-t border-steel-300"><th scope="row" className="text-left px-3 py-2 font-medium">{s.spec_key}</th><td className="px-3 py-2">{s.spec_value}{s.unit ? ` ${s.unit}` : ''}</td><td className="px-3 py-2 text-steel-600">{s.source_page ? `p. ${s.source_page}` : ''}</td></tr>)}
              </tbody></table>)}
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-20 self-start lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <div className={`px-3 py-2 text-sm ${verified ? 'bg-green-100 text-green-950' : 'bg-amber-100 text-amber-950'}`}>
            <strong>{STATUS[p.verification_status] ?? show(null)}</strong>
            {!verified && <p>Not checked against the original catalogue. Check page {show(p.source_page)} before relying on it.</p>}
          </div>
          <div className="space-y-3 border border-steel-300 bg-white p-3"><h2 className="font-semibold">My selection</h2><AddToBom productId={p.id} /><CompareToggle id={p.id} /></div>
          <section aria-labelledby="dc"><h2 id="dc" className="font-semibold mb-1">Documents</h2>
            {p.technical_documents.length === 0 ? <p className="text-sm text-steel-600">{show(null)}</p> : <ul className="text-sm space-y-1">{p.technical_documents.map((d) => <li key={d.id}>{d.title} ({d.doc_type}) <button className="underline ml-1" onClick={() => void openDocument('technical-documents', d.storage_path).catch((e: Error) => setErr(e.message))}>Download</button></li>)}</ul>}
          </section>
          <section aria-labelledby="rl"><h2 id="rl" className="font-semibold mb-1">Related products</h2>
            {related.length === 0 ? <p className="text-sm text-steel-600">{show(null)}</p> : <ul className="text-sm">{related.map((r) => <li key={r.id}><Link className="underline" to={`/products/${r.id}`}>{r.product_code} — {r.name}</Link></li>)}</ul>}
          </section>
        </aside>
      </div>
    </article>
  )
}
