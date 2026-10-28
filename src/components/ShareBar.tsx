import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { exportCategoryPdf, exportProductPdf } from '../lib/sharePdf'

interface Props { kind: 'category' | 'product'; id: string; name: string }

/** Copy a link or download a PDF of a category (with its products) or of one product. */
export default function ShareBar({ kind, id, name }: Props) {
  const { can } = useAuth()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const url = `${window.location.origin}${kind === 'category' ? `/catalogue?category=${id}` : `/products/${id}`}`

  const share = async () => {
    setMsg(null)
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { await navigator.share({ title: name, url }); return }
      await navigator.clipboard.writeText(url)
      setMsg({ ok: true, text: 'Link copied. People need an approved account to open it.' })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setMsg({ ok: false, text: `Copy this link: ${url}` })
    }
  }
  const pdf = async () => {
    setBusy(true); setMsg(null)
    try { await (kind === 'category' ? exportCategoryPdf(id, name) : exportProductPdf(id)) }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
    finally { setBusy(false) }
  }
  const b = 'border border-steel-300 bg-white px-3 py-1 hover:bg-steel-100 disabled:opacity-60'
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
      <button className={b} onClick={() => void share()}>Copy share link</button>
      {can('download_documents') && <button className={b} disabled={busy} onClick={() => void pdf()}>{busy ? 'Preparing PDF…' : 'Download PDF'}</button>}
      {msg && <span role="status" className={msg.ok ? 'text-green-800' : 'text-red-700'}>{msg.text}</span>}
    </div>
  )
}
