import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { submitRfq, useRfq, type RfqForm } from '../lib/rfq'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const STATUS: Record<string, string> = { new: 'Received', in_progress: 'In progress', quoted: 'Quoted', closed: 'Closed' }

/** Small button for product pages and cards. */
export function AddToRfqButton({ id, code, name }: { id: string; code: string; name: string }) {
  const rfq = useRfq()
  const inList = rfq.items.find((i) => i.id === id)
  return (
    <div className="text-sm">
      <button type="button" onClick={() => rfq.add({ id, code, name })} className="border border-brand-green text-brand-green bg-white px-3 py-2 hover:bg-brand-green hover:text-white transition rounded-sm">
        {inList ? `Add one more to quotation (${inList.qty})` : 'Add to quotation'}
      </button>
      {rfq.items.length > 0 && <button type="button" className="ml-3 underline" onClick={() => rfq.setOpen(true)}>View quotation list ({rfq.items.length})</button>}
    </div>
  )
}

/** Request-for-quotation panel: the list, your details, and a submit button. */
export default function RfqDrawer() {
  const rfq = useRfq()
  const { session, can } = useAuth()
  const [f, setF] = useState<RfqForm>({ name: '', company: '', email: '', phone: '', message: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [done, setDone] = useState('')
  const [busy, setBusy] = useState(false)
  const [mine, setMine] = useState<{ reference: string; status: string; created_at: string }[]>([])

  useEffect(() => {
    if (!rfq.open || !session) return
    let live = true
    ;(async () => {
      const p = await supabase.from('profiles').select('full_name,company').eq('id', session.user.id).maybeSingle()
      if (live) setF((cur) => ({ ...cur, name: cur.name || p.data?.full_name || '', company: cur.company || p.data?.company || '', email: cur.email || session.user.email || '' }))
      const r = await supabase.from('rfq_requests').select('reference,status,created_at').order('created_at', { ascending: false }).limit(5)
      if (live && r.data) setMine(r.data as { reference: string; status: string; created_at: string }[])
    })()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') rfq.setOpen(false) }
    window.addEventListener('keydown', key)
    return () => { live = false; window.removeEventListener('keydown', key) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfq.open, session])

  if (!rfq.open) return null
  const set = (k: keyof RfqForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null)
    if (rfq.items.length === 0) return setMsg({ ok: false, text: 'Add at least one product first.' })
    if (!f.name.trim()) return setMsg({ ok: false, text: 'Enter your name.' })
    if (!EMAIL.test(f.email.trim())) return setMsg({ ok: false, text: 'Enter a valid email address.' })
    setBusy(true)
    try { const ref = await submitRfq({ ...f, name: f.name.trim(), email: f.email.trim() }, rfq.items); setDone(ref); rfq.clear() }
    catch (er) { setMsg({ ok: false, text: (er as Error).message }) } finally { setBusy(false) }
  }
  const inp = 'border border-steel-300 px-2 py-2 bg-white w-full text-sm rounded-sm'
  return (
    <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-label="Request for quotation">
      <button className="absolute inset-0 bg-black/50" aria-label="Close quotation panel" onClick={() => rfq.setOpen(false)} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between bg-brand-green text-white px-4 py-3"><h2 className="font-semibold">Request for quotation</h2><button className="px-2" onClick={() => rfq.setOpen(false)} aria-label="Close">✕</button></div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {done ? (
            <div className="space-y-2"><p className="bg-green-100 text-green-950 px-3 py-2 text-sm">Your request <b>{done}</b> has been received. Ultraplast will contact you with a quotation.</p>
              <button className="underline text-sm" onClick={() => { setDone(''); rfq.setOpen(false) }}>Close</button></div>
          ) : (<>
            <section aria-label="Products in your request">
              {rfq.items.length === 0 ? <p className="text-sm text-steel-600">Your list is empty. Use Add to quotation on a product.</p> : (
                <ul className="divide-y divide-steel-300 border border-steel-300 rounded-sm">{rfq.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="flex-1 min-w-0"><span className="block font-mono text-xs text-steel-600">{i.code}</span><span className="block truncate">{i.name}</span></span>
                    <input aria-label={`Quantity for ${i.code}`} type="number" min={1} max={100000} value={i.qty} onChange={(e) => rfq.setQty(i.id, Number(e.target.value))} className="w-20 border border-steel-300 px-1 py-1 rounded-sm" />
                    <button className="underline text-red-700" onClick={() => rfq.remove(i.id)}>Remove</button></li>))}</ul>)}
              {rfq.items.length > 0 && <button className="mt-2 text-xs underline" onClick={() => rfq.clear()}>Clear list</button>}
            </section>
            <form onSubmit={submit} className="space-y-3" noValidate>
              <h3 className="font-semibold">Your details</h3>
              <div><label htmlFor="rn" className="block text-xs font-medium">Name *</label><input id="rn" className={inp} maxLength={120} value={f.name} onChange={set('name')} /></div>
              <div><label htmlFor="rc" className="block text-xs font-medium">Company</label><input id="rc" className={inp} maxLength={200} value={f.company} onChange={set('company')} /></div>
              <div className="grid grid-cols-2 gap-2"><div><label htmlFor="re" className="block text-xs font-medium">Email *</label><input id="re" type="email" className={inp} maxLength={254} value={f.email} onChange={set('email')} /></div>
                <div><label htmlFor="rp" className="block text-xs font-medium">Phone</label><input id="rp" className={inp} maxLength={40} value={f.phone} onChange={set('phone')} /></div></div>
              <div><label htmlFor="rm" className="block text-xs font-medium">Message</label><textarea id="rm" rows={3} className={inp} maxLength={2000} value={f.message} onChange={set('message')} /></div>
              {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
              <button disabled={busy || !can('browse_catalogue')} className="w-full bg-brand-green text-white py-2 rounded-sm disabled:opacity-60">{busy ? 'Sending…' : 'Send request'}</button>
            </form>
          </>)}
          {mine.length > 0 && (<section aria-label="Your recent requests"><h3 className="font-semibold text-sm mb-1">Your recent requests</h3>
            <ul className="text-sm divide-y divide-steel-300 border border-steel-300 rounded-sm">{mine.map((r) => <li key={r.reference} className="flex justify-between px-3 py-1.5"><span className="font-mono">{r.reference}</span><span className="text-steel-600">{STATUS[r.status] ?? r.status} · {new Date(r.created_at).toLocaleDateString()}</span></li>)}</ul></section>)}
        </div>
      </aside>
    </div>
  )
}
