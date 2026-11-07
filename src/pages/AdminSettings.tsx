import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { isEmail, mailResult, parseEmailList, type MailLogRow } from '../lib/format'

type Provider = 'resend' | 'brevo'
interface Settings {
  provider: Provider; from_name: string; from_email: string | null; quote_from_email: string | null; quote_to_emails: string[]
  app_url: string | null; api_url: string | null; has_key: boolean; key_hint: string | null; updated_at: string | null
}

const PROVIDERS: Record<Provider, { label: string; getKey: string; sender: string }> = {
  resend: {
    label: 'Resend',
    getKey: 'In Resend: API Keys, Create API key (permission “Sending access”). The key starts with re_',
    sender: 'The sender address must be on a domain you verified in Resend (Domains). Until then Resend only delivers to your own Resend account email.',
  },
  brevo: {
    label: 'Brevo',
    getKey: 'In Brevo: your name (top right), SMTP & API, API keys, Generate a new API key. The key starts with xkeysib-',
    sender: 'The sender address must be added and verified in Brevo (Senders, Domains & Dedicated IPs, Senders).',
  },
}
const KIND: Record<string, string> = { verification: 'Sign-in / verification', quotation: 'Quotation', test: 'Test' }
const TONE = { ok: 'text-green-800', bad: 'text-red-700', wait: 'text-steel-600' }

export default function AdminSettings() {
  const { session } = useAuth()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [provider, setProvider] = useState<Provider>('resend')
  const [key, setKey] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [quoteTo, setQuoteTo] = useState('')
  const [quoteFrom, setQuoteFrom] = useState('')
  const [testTo, setTestTo] = useState(session?.user.email ?? '')
  const [log, setLog] = useState<MailLogRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_mail_settings')
    if (error) return setMsg({ ok: false, text: error.message })
    const d = data as Settings
    setSettings(d)
    setProvider(d.provider)
    setFromName(d.from_name)
    setFromEmail(d.from_email ?? '')
    setQuoteFrom(d.quote_from_email ?? '')
    setQuoteTo(d.quote_to_emails.join('\n'))
  }, [])
  const loadLog = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_mail_log')
    if (error) setMsg({ ok: false, text: error.message }); else setLog(data as MailLogRow[])
  }, [])
  useEffect(() => { void load(); void loadLog() }, [load, loadLog])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (!settings) return
    const to = parseEmailList(quoteTo)
    const badTo = to.find((x) => !isEmail(x))
    if (!settings.has_key && !key.trim()) return setMsg({ ok: false, text: 'Paste the mail service key.' })
    if (settings.has_key && provider !== settings.provider && !key.trim()) return setMsg({ ok: false, text: 'Paste the new key when you change the mail service.' })
    if (!fromName.trim()) return setMsg({ ok: false, text: 'Enter the sender name.' })
    if (!isEmail(fromEmail.trim().toLowerCase())) return setMsg({ ok: false, text: 'Enter a valid sender email address.' })
    if (quoteFrom.trim() && !isEmail(quoteFrom.trim().toLowerCase())) return setMsg({ ok: false, text: 'The quotation sender address is not valid.' })
    if (badTo) return setMsg({ ok: false, text: `Not a valid email address: ${badTo}` })
    if (to.length > 10) return setMsg({ ok: false, text: 'Add at most 10 quotation email addresses.' })
    setBusy(true)
    // The website address and the Supabase project address are filled in automatically, so nothing else needs configuring.
    const { error } = await supabase.rpc('admin_save_mail_settings', {
      p_provider: provider, p_api_key: key.trim() || null, p_from_name: fromName.trim(), p_from_email: fromEmail.trim(),
      p_quote_from_email: quoteFrom.trim() || null, p_quote_to: to, p_app_url: window.location.origin,
      p_api_url: ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim(),
    })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setKey('')
    setMsg({ ok: true, text: 'Saved. Now send yourself the two test emails below to check them.' })
    await load()
  }

  const sendTest = async (kind: 'verification' | 'quotation') => {
    setMsg(null)
    const addr = testTo.trim().toLowerCase()
    if (!isEmail(addr)) return setMsg({ ok: false, text: 'Enter a valid email address to send the test to.' })
    setBusy(true)
    const { error } = await supabase.rpc('admin_send_test_mail', { p_kind: kind, p_to: addr })
    setBusy(false)
    if (error) return setMsg({ ok: false, text: error.message })
    setMsg({ ok: true, text: `Test email queued for ${addr}. Its result appears in the list below in a few seconds.` })
    void loadLog()
    setTimeout(() => void loadLog(), 4000)
  }

  const f = 'w-full border border-steel-300 px-3 py-2 rounded-sm bg-white text-sm'
  const btn = 'bg-belt-700 hover:bg-belt-600 disabled:opacity-60 text-white px-4 py-2 rounded-sm text-sm'
  const info = PROVIDERS[provider]
  const step = (ok: boolean, text: string) => <li className={ok ? 'text-green-800' : 'text-steel-600'}>{ok ? '✓' : '○'} {text}</li>

  return (
    <div className="space-y-6 max-w-3xl">
      <p className="text-sm"><Link className="underline" to="/admin">Back to admin</Link></p>
      <h1 className="text-2xl font-bold">Email settings</h1>
      <p className="text-sm text-steel-600">
        Paste the key of your mail service once. Sign-in and verification codes are then emailed to your users, and every quotation request is emailed to the
        address(es) you choose below. The key is stored only in the database and is never shown again.
      </p>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
      {settings === null && !msg && <p role="status" className="text-steel-600">Loading…</p>}

      {settings && (<>
        <ul className="text-sm space-y-1 bg-white border border-steel-300 rounded-md p-4" aria-label="Setup progress">
          {step(settings.has_key, settings.has_key ? `Mail service key saved (ends with ${settings.key_hint ?? '…'})` : 'Mail service key not saved yet')}
          {step(Boolean(settings.from_email), settings.from_email ? `Sign-in emails are sent from ${settings.from_email}` : 'Sender address not set yet')}
          {step(settings.quote_to_emails.length > 0, settings.quote_to_emails.length > 0 ? `Quotation requests go to ${settings.quote_to_emails.join(', ')}` : 'No address receives quotation requests yet')}
        </ul>

        <form onSubmit={save} className="bg-white border border-steel-300 rounded-md p-5 space-y-4" noValidate>
          <h2 className="font-semibold">1. Mail service and key</h2>
          <div><label htmlFor="pv" className="text-sm font-medium">Mail service</label>
            <select id="pv" className={f} value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
              {(Object.keys(PROVIDERS) as Provider[]).map((p) => <option key={p} value={p}>{PROVIDERS[p].label}</option>)}
            </select></div>
          <div><label htmlFor="ky" className="text-sm font-medium">Secret key</label>
            <input id="ky" type="password" autoComplete="off" spellCheck={false} className={f} value={key} onChange={(e) => setKey(e.target.value)}
              placeholder={settings.has_key ? `Saved (ends with ${settings.key_hint ?? '…'}). Leave empty to keep it.` : 'Paste the key here'} />
            <p className="text-xs text-steel-600 mt-1">{info.getKey}</p></div>

          <h2 className="font-semibold pt-2">2. Sign-in and verification emails</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="fn" className="text-sm font-medium">Sender name</label>
              <input id="fn" className={f} value={fromName} onChange={(e) => setFromName(e.target.value)} maxLength={80} /></div>
            <div><label htmlFor="fe" className="text-sm font-medium">Sent from (email address)</label>
              <input id="fe" type="email" className={f} value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="verify@yourcompany.com" /></div>
          </div>
          <p className="text-xs text-steel-600">{info.sender}</p>

          <h2 className="font-semibold pt-2">3. Quotation request emails</h2>
          <div><label htmlFor="qt" className="text-sm font-medium">Quotation requests are emailed to</label>
            <textarea id="qt" rows={3} className={f} value={quoteTo} onChange={(e) => setQuoteTo(e.target.value)} placeholder={'sales@yourcompany.com\nquotes@yourcompany.com'} />
            <p className="text-xs text-steel-600 mt-1">One address per line (up to 10). This can be different from the sign-in sender above.</p></div>
          <div><label htmlFor="qf" className="text-sm font-medium">Quotation emails sent from (optional)</label>
            <input id="qf" type="email" className={f} value={quoteFrom} onChange={(e) => setQuoteFrom(e.target.value)} placeholder="Leave empty to use the sign-in sender" /></div>

          <button disabled={busy} className={btn}>{busy ? 'Saving…' : 'Save settings'}</button>
        </form>

        <section className="bg-white border border-steel-300 rounded-md p-5 space-y-3" aria-label="Send test emails">
          <h2 className="font-semibold">4. Send test emails</h2>
          <p className="text-sm text-steel-600">Sends a sample of each email, so you can check how they look and that delivery works. Save your settings first.</p>
          <div><label htmlFor="tt" className="text-sm font-medium">Send the tests to</label>
            <input id="tt" type="email" className={f} value={testTo} onChange={(e) => setTestTo(e.target.value)} /></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !settings.has_key} className={btn} onClick={() => void sendTest('verification')}>Send sample sign-in email</button>
            <button type="button" disabled={busy || !settings.has_key} className={btn} onClick={() => void sendTest('quotation')}>Send sample quotation email</button>
          </div>
        </section>

        <details className="bg-white border border-steel-300 rounded-md p-5" open={settings.has_key}>
          <summary className="font-semibold cursor-pointer">5. One-time step in Supabase: switch on sign-in emails</summary>
          <ol className="list-decimal pl-5 mt-3 space-y-1 text-sm">
            <li>Do this only after the test emails above arrive correctly.</li>
            <li>Open your project in the Supabase dashboard, then <b>Authentication</b>, then <b>Hooks</b>.</li>
            <li>Add a hook of type <b>Send Email</b> and choose <b>Postgres function</b>.</li>
            <li>Schema <code>public</code>, function <code>send_auth_email</code>. Save.</li>
          </ol>
          <p className="text-sm text-steel-600 mt-3">To undo it, delete that hook; Supabase then sends its own emails again. Quotation emails do not need this step: they start working as soon as the settings are saved.</p>
        </details>

        <section aria-label="Recent emails" className="space-y-2">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Recent emails</h2>
            <button type="button" className="text-sm underline" onClick={() => void loadLog()}>Refresh</button></div>
          {log === null ? <p role="status" className="text-steel-600 text-sm">Loading…</p> : log.length === 0 ? <p className="text-steel-600 text-sm">No emails sent yet.</p> : (
            <div className="overflow-x-auto border border-steel-300 bg-white rounded-md"><table className="w-full text-sm">
              <thead className="bg-steel-100 text-left"><tr>{['When', 'Type', 'To', 'Result'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
              <tbody>{log.map((r) => { const res = mailResult(r); return (
                <tr key={r.id} className="border-t border-steel-300 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{KIND[r.kind] ?? r.kind}{r.reference && <span className="block text-xs text-steel-600 font-mono">{r.reference}</span>}</td>
                  <td className="px-3 py-2 break-all">{r.to_email}</td>
                  <td className={`px-3 py-2 ${TONE[res.tone]}`}>{res.label}</td>
                </tr>) })}</tbody></table></div>)}
          <p className="text-xs text-steel-600">“Accepted by the mail service” means the service took the email for delivery. If an email does not arrive, check the spam folder and your mail service dashboard.</p>
        </section>
      </>)}
    </div>
  )
}
