import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getShared, signImages, type Shared, type SharedProduct } from '../lib/share'
import { exportSharedPdf } from '../lib/sharePdf'
import { na } from '../lib/bom'

const COMPANY = 'Ultraplast Chainbelts Pvt. Ltd.'
const SITE = 'https://www.ultraplastindia.com/'

function Block({ p, urls, big }: { p: SharedProduct; urls: Map<string, string>; big?: boolean }) {
  const imgs = (big ? p.images : p.images.slice(0, 1)).map((i) => ({ url: urls.get(i.path), caption: i.caption })).filter((i) => i.url)
  const mm = (v: number | null) => (v === null ? na(null) : `${v} mm`)
  const rows: [string, string][] = [['Product code', p.product_code], ['Categories', na(p.categories.join(', '))], ['Brand', na(p.brand)], ['Material', na(p.material)],
    ['Pitch', mm(p.pitch_mm)], ['Width', mm(p.width_mm)], ['Thickness', mm(p.thickness_mm)], ['Colour', na(p.colour)], ['Application', na(p.application)]]
  return (
    <article className="break-inside-avoid border border-steel-300 bg-white p-4 space-y-3">
      <h2 className={`font-bold ${big ? 'text-2xl' : 'text-lg'}`}>{p.name}</h2>
      {imgs.length > 0 && <div className="flex flex-wrap gap-3">{imgs.map((i) => <img key={i.url} src={i.url} alt={i.caption ?? p.name} className={big ? 'max-h-72 max-w-full' : 'h-32'} />)}</div>}
      {p.description && <p className="text-sm">{p.description}</p>}
      <dl className="grid sm:grid-cols-2 gap-px bg-steel-300 border border-steel-300">
        {rows.map(([k, v]) => <div key={k} className="bg-white px-3 py-1.5"><dt className="text-xs text-steel-600">{k}</dt><dd className="text-sm">{v}</dd></div>)}
      </dl>
      {p.specs.length > 0 && (
        <table className="w-full text-sm border border-steel-300"><tbody>
          {p.specs.map((s) => <tr key={s.key} className="border-t border-steel-300"><th scope="row" className="text-left px-3 py-1.5 font-medium">{s.key}</th><td className="px-3 py-1.5">{s.value}{s.unit ? ` ${s.unit}` : ''}</td></tr>)}
        </tbody></table>)}
    </article>
  )
}

/** Public page opened from a customer link. No sign-in; shows only what the link covers. */
export default function SharePage() {
  const { token } = useParams()
  const [data, setData] = useState<Shared | null | undefined>(undefined)
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [logoOk, setLogoOk] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const d = await getShared(token ?? '')
        if (!live) return
        setData(d)
        if (d) {
          const paths = d.kind === 'product' ? d.product.images.map((i) => i.path) : d.products.flatMap((p) => p.images.slice(0, 1).map((i) => i.path))
          const m = await signImages(paths)
          if (live) setUrls(m)
        }
      } catch (e) { if (live) { setErr((e as Error).message); setData(null) } }
    })()
    return () => { live = false }
  }, [token])

  const pdf = async () => {
    if (!data) return
    setBusy(true); setErr('')
    try { await exportSharedPdf(data, urls) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const unverified = data ? (data.kind === 'product' ? !data.product.verified : data.products.some((p) => !p.verified)) : false

  return (
    <div className="min-h-screen bg-steel-50">
      <header className="bg-steel-950 print:bg-white print:border-b print:border-steel-300">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
          <a href={SITE} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-white print:text-steel-950 font-bold text-lg">
            {logoOk && <img src="/logo.png" alt="" className="h-8 w-auto bg-white px-2 py-1 rounded-sm" onError={() => setLogoOk(false)} />}
            <span>{COMPANY}</span>
          </a>
          {data && (<div className="flex gap-2 print:hidden">
            <button onClick={() => window.print()} className="border border-steel-300 bg-white px-3 py-1 text-sm">Print</button>
            <button onClick={() => void pdf()} disabled={busy} className="bg-amber-chain text-steel-950 px-3 py-1 text-sm font-medium disabled:opacity-60">{busy ? 'Preparing PDF…' : 'Download PDF'}</button>
          </div>)}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 space-y-5">
        {data === undefined && <p role="status" className="text-steel-600">Loading…</p>}
        {data === null && <div role="alert" className="bg-white border border-steel-300 p-6"><h1 className="text-xl font-bold">This link is no longer available</h1><p className="mt-2 text-sm">It may have expired or been withdrawn. Please contact {COMPANY} for a new link.</p>{err && <p className="mt-2 text-xs text-steel-600">{err}</p>}</div>}
        {err && data && <p role="alert" className="text-red-700 text-sm">{err}</p>}
        {data?.kind === 'product' && <Block p={data.product} urls={urls} big />}
        {data?.kind === 'category' && (<>
          <header><h1 className="text-2xl font-bold">{data.name}</h1>{data.description && <p className="text-steel-600">{data.description}</p>}<p className="text-sm text-steel-600">{data.products.length} products</p></header>
          <div className="space-y-4">{data.products.map((p) => <Block key={p.id} p={p} urls={urls} />)}</div>
        </>)}
        {unverified && <p className="text-sm bg-amber-100 text-amber-950 px-3 py-2">Some details on this page have not yet been verified. Please confirm them with {COMPANY} before ordering.</p>}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-6 text-xs text-steel-600">{COMPANY} · <a className="underline" href={SITE} target="_blank" rel="noopener noreferrer">www.ultraplastindia.com</a></footer>
    </div>
  )
}
