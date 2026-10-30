import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { exportCategoryPdf, exportProductPdf } from '../lib/sharePdf'
import { createCustomerLink, EXPIRY } from '../lib/share'

interface Props { kind: 'category' | 'product'; id: string; name: string }

/** Customer link (public, expiring), internal link (needs sign-in), PDF and print for a category or a product. */
export default function ShareBar({ kind, id, name }: Props) {
  const { can } = useAuth()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [days, setDays] = useState(30)
  const internal = `${window.location.origin}${kind === 'category' ? `/catalogue?category=${id}` : `/products/${id}`}`

  const send = async (url: string, okText: string) => {
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { await navigator.share({ title: name, url }); return }
      await navigator.clipboard.writeText(url)
      setMsg({ ok: true, text: okText })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setMsg({ ok: false, text: `Copy this link: ${url}` })
    }
  }
  const customer = async () => {
    setBusy(true); setMsg(null)
    try {
      const url = await createCustomerLink(kind, id, days)
      await send(url, `Customer link copied${days ? ` (valid ${days} days)` : ' (no expiry)'}. Anyone with it can view this ${kind} without signing in.`)
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }
  const make = async (mode: 'download' | 'print') => {
    const win = mode === 'print' ? window.open('', '_blank') : null
    win?.document.write('<p style="font-family:sans-serif;padding:24px">Preparing your document…</p>')
    setBusy(true); setMsg(null)
    try { await (kind === 'category' ? exportCategoryPdf(id, name, mode, win) : exportProductPdf(id, mode, win)) }
    catch (e) { win?.close(); setMsg({ ok: false, text: (e as Error).message }) }
    finally { setBusy(false) }
  }
  const b = 'border border-steel-300 bg-white px-3 py-1 hover:bg-steel-100 disabled:opacity-60'
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
      {can('create_share_links') && (<>
        <label htmlFor={`exp-${id}`} className="sr-only">Customer link valid for</label>
        <select id={`exp-${id}`} className="border border-steel-300 bg-white px-2 py-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>{EXPIRY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <button className={`${b} font-medium`} disabled={busy} onClick={() => void customer()}>Copy customer link</button>
      </>)}
      <button className={b} onClick={() => void send(internal, 'Internal link copied. It needs a sign-in to open.')}>Copy internal link</button>
      {can('download_documents') && <button className={b} disabled={busy} onClick={() => void make('download')}>{busy ? 'Preparing…' : 'Download PDF'}</button>}
      <button className={b} disabled={busy} onClick={() => (can('download_documents') ? void make('print') : window.print())}>Print</button>
      {msg && <span role="status" className={msg.ok ? 'text-green-800' : 'text-red-700'}>{msg.text}</span>}
    </div>
  )
}
