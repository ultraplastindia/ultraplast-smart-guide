import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { show } from '../lib/format'
import { openDocument } from '../lib/catalogue'
import AddToBom, { CompareToggle } from '../components/AddToBom'

interface Detail {
  id: string; product_code: string; name: string; brand: string | null; description: string | null; material: string | null
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
  const [images, setImages] = useState<{ url: string; caption: string | null }[]>([])

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data, error } = await supabase.from('products')
        .select('*,product_categories(name),catalogues(name,edition),product_specifications(spec_key,spec_value,unit,source_page),technical_documents(id,title,doc_type,storage_path)')
        .eq('id', id ?? '').maybeSingle()
      if (!live) return
      if (error) return setErr(error.message)
      if (!data) return setErr('Product not found, or you do not have access to it.')
      setP(data as unknown as Detail)
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

  const fields: [string, string][] = [
    ['Product code', p.product_code], ['Category', show(p.product_categories?.name)], ['Brand', show(p.brand)],
    ['Material', show(p.material)], ['Pitch', p.pitch_mm == null ? show(null) : `${p.pitch_mm} mm`],
    ['Width', p.width_mm == null ? show(null) : `${p.width_mm} mm`], ['Thickness', p.thickness_mm == null ? show(null) : `${p.thickness_mm} mm`],
    ['Colour', show(p.colour)], ['Application', show(p.application)],
    ['Catalogue', p.catalogues ? `${p.catalogues.name}${p.catalogues.edition ? ` (${p.catalogues.edition})` : ''}` : show(null)],
    ['Catalogue page', show(p.source_page)], ['Drawing reference', show(p.drawing_ref)], ['Data status', STATUS[p.verification_status] ?? show(null)],
  ]
  return (
    <article className="space-y-6">
      <Link to="/catalogue" className="text-sm underline">Back to catalogue</Link>
      <header><h1 className="text-2xl font-bold">{p.name}</h1><p className="font-mono text-steel-600">{p.product_code}</p></header>
      <div className="flex flex-wrap gap-6 items-start"><AddToBom productId={p.id} /><CompareToggle id={p.id} /></div>
      {p.verification_status !== 'verified' && <p className="text-sm bg-amber-100 text-amber-950 px-3 py-2">This data has not been verified against the original catalogue. Check the source page before using it for engineering decisions.</p>}
      {images.length > 0 && <div className="flex flex-wrap gap-3">{images.map((i) => <img key={i.url} src={i.url} alt={i.caption ?? p.name} className="h-40 border border-steel-300 bg-white" />)}</div>}
      <p>{show(p.description)}</p>
      <dl className="grid sm:grid-cols-2 gap-px bg-steel-300 border border-steel-300">
        {fields.map(([k, v]) => <div key={k} className="bg-white px-3 py-2"><dt className="text-xs text-steel-600">{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <section aria-labelledby="sp"><h2 id="sp" className="font-semibold mb-2">Technical specifications</h2>
        {p.product_specifications.length === 0 ? <p className="text-steel-600">{show(null)}</p> : (
          <table className="w-full text-sm border border-steel-300 bg-white"><tbody>
            {p.product_specifications.map((s) => <tr key={s.spec_key} className="border-t border-steel-300"><th scope="row" className="text-left px-3 py-2 font-medium">{s.spec_key}</th><td className="px-3 py-2">{s.spec_value}{s.unit ? ` ${s.unit}` : ''}</td><td className="px-3 py-2 text-steel-600">{s.source_page ? `p. ${s.source_page}` : ''}</td></tr>)}
          </tbody></table>)}
      </section>
      <section aria-labelledby="dc"><h2 id="dc" className="font-semibold mb-2">Documents</h2>
        {p.technical_documents.length === 0 ? <p className="text-steel-600">{show(null)}</p> : <ul className="list-disc pl-5 text-sm">{p.technical_documents.map((d) => <li key={d.id}>{d.title} ({d.doc_type}) <button className="underline ml-2" onClick={() => void openDocument('technical-documents', d.storage_path).catch((e: Error) => setErr(e.message))}>Download</button></li>)}</ul>}
      </section>
      <section aria-labelledby="rl"><h2 id="rl" className="font-semibold mb-2">Related products</h2>
        {related.length === 0 ? <p className="text-steel-600">{show(null)}</p> : <ul className="text-sm">{related.map((r) => <li key={r.id}><Link className="underline" to={`/products/${r.id}`}>{r.product_code} — {r.name}</Link></li>)}</ul>}
      </section>
    </article>
  )
}
