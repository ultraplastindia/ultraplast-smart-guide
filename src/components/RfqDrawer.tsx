import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Check, Copy, Loader2, Minus, Plus, Trash2, X } from 'lucide-react'
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

type Errors = Partial<Record<keyof RfqForm, string>>
interface Recent { reference: string; status: string; created_at: string }
const BADGE: Record<string, string> = { new: 'bg-blue-100 text-blue-900', in_progress: 'bg-amber-100 text-amber-900', quoted: 'bg-green-100 text-green-900', closed: 'bg-steel-100 text-steel-800' }
const FIELD = 'w-full rounded-sm border bg-white px-3 py-2 text-sm text-steel-950 placeholder:text-steel-600 focus:border-brand-green focus:outline-none focus:ring-2 focus:ring-brand-green/30'

function Field({ id, label, required, error, hint, children }: { id: string; label: string; required?: boolean; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-steel-800">{label}{required && <span className="text-red-700" aria-hidden="true"> *</span>}{required && <span className="sr-only"> (required)</span>}</label>
      {children}
      {error ? <p id={`${id}-e`} role="alert" className="mt-1 text-xs text-red-700">{error}</p> : hint ? <p id={`${id}-h`} className="mt-1 text-xs text-steel-600">{hint}</p> : null}
    </div>
  )
}
const Step = ({ n, title, id }: { n: number; title: string; id: string }) => (
  <h3 id={id} className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-steel-800">
    <span className="grid h-6 w-6 place-items-center rounded-full bg-[#1E2226] text-xs font-bold text-white" aria-hidden="true">{n}</span>{title}
  </h3>
)

/** Request-for-quotation panel: your products, your details, and a clear send button. */
export default function RfqDrawer() {
  const rfq = useRfq()
  const { session, can } = useAuth()
  const [f, setF] = useState<RfqForm>({ name: '', company: '', email: '', phone: '', message: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [msg, setMsg] = useState<string>('')
  const [done, setDone] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mine, setMine] = useState<Recent[]>([])
  const closeRef = useRef<HTMLButtonElement>(null)

  const loadMine = async () => {
    const r = await supabase.from('rfq_requests').select('reference,status,created_at').order('created_at', { ascending: false }).limit(5)
    if (r.data) setMine(r.data as Recent[])
  }
  useEffect(() => {
    if (!rfq.open || !session) return
    let live = true
    closeRef.current?.focus()
    ;(async () => {
      const p = await supabase.from('profiles').select('full_name,company').eq('id', session.user.id).maybeSingle()
      if (live) setF((cur) => ({ ...cur, name: cur.name || p.data?.full_name || '', company: cur.company || p.data?.company || '', email: cur.email || session.user.email || '' }))
      const r = await supabase.from('rfq_requests').select('reference,status,created_at').order('created_at', { ascending: false }).limit(5)
      if (live && r.data) setMine(r.data as Recent[])
    })()
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') rfq.setOpen(false) }
    window.addEventListener('keydown', key)
    return () => { live = false; window.removeEventListener('keydown', key) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfq.open, session])

  if (!rfq.open) return null
  const total = rfq.items.reduce((n, i) => n + i.qty, 0)
  const set = (k: keyof RfqForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setF({ ...f, [k]: e.target.value }); if (errors[k]) setErrors({ ...errors, [k]: undefined }) }
  const clampQty = (n: number) => Math.max(1, Math.min(100000, Math.floor(n) || 1))

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setMsg('')
    const er: Errors = {}
    if (!f.name.trim()) er.name = 'Enter your full name.'
    if (!EMAIL.test(f.email.trim())) er.email = 'Enter a valid email address, for example name@company.com.'
    if (f.phone.trim() && f.phone.replace(/\D/g, '').length < 6) er.phone = 'Enter a phone number with at least 6 digits, or leave it empty.'
    if (rfq.items.length === 0) setMsg('Add at least one product to your request first.')
    setErrors(er)
    const first = (['name', 'email', 'phone'] as const).find((k) => er[k])
    if (first) { document.getElementById({ name: 'rn', email: 're', phone: 'rp' }[first])?.focus(); return }
    if (rfq.items.length === 0) return
    setBusy(true)
    try { const ref = await submitRfq({ ...f, name: f.name.trim(), email: f.email.trim() }, rfq.items); setDone(ref); rfq.clear(); void loadMine() }
    catch (x) { setMsg((x as Error).message) } finally { setBusy(false) }
  }
  const copy = async () => { try { await navigator.clipboard.writeText(done); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard unavailable */ } }
  const aria = (id: string, k: keyof RfqForm) => ({ 'aria-invalid': Boolean(errors[k]), 'aria-describedby': errors[k] ? `${id}-e` : undefined })
  const qbtn = 'grid h-8 w-8 place-items-center border border-steel-300 bg-white text-steel-800 hover:bg-steel-100 disabled:opacity-40'

  return (
    <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-labelledby="rfq-title">
      <button className="absolute inset-0 bg-black/50" aria-label="Close quotation panel" tabIndex={-1} onClick={() => rfq.setOpen(false)} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-steel-50 shadow-2xl">
        <header className="flex items-start justify-between gap-3 bg-[#1E2226] px-5 py-4 text-white">
          <div>
            <h2 id="rfq-title" className="text-lg font-semibold">Request for quotation</h2>
            <p className="mt-0.5 text-xs text-white/70">{done ? 'Request sent' : rfq.items.length === 0 ? 'No products yet' : `${rfq.items.length} ${rfq.items.length === 1 ? 'product' : 'products'} · ${total} ${total === 1 ? 'unit' : 'units'}`}</p>
          </div>
          <button ref={closeRef} className="rounded p-1.5 hover:bg-white/15" onClick={() => rfq.setOpen(false)} aria-label="Close"><X size={20} /></button>
        </header>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-5">
          {done ? (
            <section aria-label="Request sent" className="rounded-md border border-green-300 bg-white p-5 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-green-100 text-green-800"><Check size={26} aria-hidden="true" /></span>
              <h3 className="mt-3 text-lg font-semibold">Thank you. Your request is in.</h3>
              <p className="mt-1 text-sm text-steel-800">Ultraplast will contact you with a quotation. Quote this reference if you get in touch:</p>
              <p className="mx-auto mt-3 flex w-fit items-center gap-2 rounded border border-steel-300 bg-steel-50 px-3 py-2 font-mono text-base font-bold">{done}
                <button type="button" onClick={() => void copy()} className="rounded p-1 text-steel-800 hover:bg-steel-100" aria-label="Copy reference">{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}</button></p>
              <p role="status" className="mt-1 h-4 text-xs text-green-800">{copied ? 'Reference copied.' : ''}</p>
              <button className="mt-3 rounded-sm bg-[#1E2226] px-5 py-2 text-sm font-semibold text-white hover:bg-black" onClick={() => { setDone(''); rfq.setOpen(false) }}>Continue browsing</button>
            </section>
          ) : (<>
            <section aria-labelledby="rfq-s1">
              <Step n={1} id="rfq-s1" title="Products" />
              {rfq.items.length === 0 ? (
                <p className="rounded-md border border-dashed border-steel-300 bg-white px-4 py-6 text-center text-sm text-steel-600">Your list is empty. Use <b>Add to quotation</b> on a product or an item code.</p>
              ) : (
                <ul className="space-y-2">{rfq.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 rounded-md border border-steel-300 bg-white p-3">
                    <div className="min-w-0 flex-1"><p className="font-mono text-sm font-bold">{i.code}</p><p className="line-clamp-2 text-sm text-steel-800">{i.name}</p></div>
                    <div className="flex items-center" role="group" aria-label={`Quantity for ${i.code}`}>
                      <button type="button" className={`${qbtn} rounded-l-sm`} aria-label={`Decrease quantity of ${i.code}`} disabled={i.qty <= 1} onClick={() => rfq.setQty(i.id, clampQty(i.qty - 1))}><Minus size={14} aria-hidden="true" /></button>
                      <input aria-label={`Quantity for ${i.code}`} type="number" min={1} max={100000} value={i.qty} onChange={(e) => rfq.setQty(i.id, clampQty(Number(e.target.value)))} className="h-8 w-14 border-y border-steel-300 bg-white text-center text-sm tabular-nums" />
                      <button type="button" className={`${qbtn} rounded-r-sm`} aria-label={`Increase quantity of ${i.code}`} onClick={() => rfq.setQty(i.id, clampQty(i.qty + 1))}><Plus size={14} aria-hidden="true" /></button>
                    </div>
                    <button type="button" className="rounded p-1.5 text-steel-600 hover:bg-red-50 hover:text-red-700" aria-label={`Remove ${i.code} from the request`} onClick={() => rfq.remove(i.id)}><Trash2 size={18} aria-hidden="true" /></button>
                  </li>))}
                </ul>)}
              {rfq.items.length > 1 && <button type="button" className="mt-2 text-xs text-steel-600 underline hover:text-red-700" onClick={() => rfq.clear()}>Clear the list</button>}
            </section>

            <form id="rfq-form" onSubmit={(e) => void submit(e)} noValidate aria-labelledby="rfq-s2">
              <Step n={2} id="rfq-s2" title="Your details" />
              <div className="space-y-4 rounded-md border border-steel-300 bg-white p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="rn" label="Full name" required error={errors.name}><input id="rn" className={`${FIELD} ${errors.name ? 'border-red-500' : 'border-steel-300'}`} maxLength={120} autoComplete="name" value={f.name} onChange={set('name')} {...aria('rn', 'name')} /></Field>
                  <Field id="rc" label="Company"><input id="rc" className={`${FIELD} border-steel-300`} maxLength={200} autoComplete="organization" value={f.company} onChange={set('company')} /></Field>
                  <Field id="re" label="Work email" required error={errors.email}><input id="re" type="email" className={`${FIELD} ${errors.email ? 'border-red-500' : 'border-steel-300'}`} maxLength={254} autoComplete="email" value={f.email} onChange={set('email')} {...aria('re', 'email')} /></Field>
                  <Field id="rp" label="Phone" error={errors.phone} hint="Optional. Include the country code."><input id="rp" type="tel" className={`${FIELD} ${errors.phone ? 'border-red-500' : 'border-steel-300'}`} maxLength={40} autoComplete="tel" value={f.phone} onChange={set('phone')} {...aria('rp', 'phone')} /></Field>
                </div>
                <Field id="rm" label="Message" hint={`${f.message.length} / 2000. Optional: delivery place, timeline, or special requirements.`}>
                  <textarea id="rm" rows={3} className={`${FIELD} border-steel-300`} maxLength={2000} value={f.message} onChange={set('message')} />
                </Field>
              </div>
            </form>
          </>)}

          {mine.length > 0 && (
            <section aria-label="Your recent requests">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-steel-800">Your recent requests</h3>
              <ul className="divide-y divide-steel-300 rounded-md border border-steel-300 bg-white text-sm">{mine.map((r) => (
                <li key={r.reference} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="font-mono font-semibold">{r.reference}</span>
                  <span className="text-xs text-steel-600">{new Date(r.created_at).toLocaleDateString()}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[r.status] ?? BADGE.closed}`}>{STATUS[r.status] ?? r.status}</span>
                </li>))}
              </ul>
            </section>)}
        </div>

        {!done && (
          <footer className="border-t border-steel-300 bg-white px-5 py-3">
            {msg && <p role="alert" className="mb-2 text-sm text-red-700">{msg}</p>}
            <button type="submit" form="rfq-form" disabled={busy || !can('browse_catalogue')} className="flex w-full items-center justify-center gap-2 rounded-sm bg-[#5A9216] py-2.5 text-sm font-semibold text-white hover:bg-[#65A30D] disabled:opacity-60">
              {busy ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> Sending…</> : `Send request${rfq.items.length ? ` (${rfq.items.length} ${rfq.items.length === 1 ? 'product' : 'products'})` : ''}`}
            </button>
            <p className="mt-1.5 text-center text-xs text-steel-600">Fields marked * are required. We use your details only to reply to this request.</p>
          </footer>)}
      </aside>
    </div>
  )
}
