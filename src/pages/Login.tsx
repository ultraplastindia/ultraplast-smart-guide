import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { isOtpCode } from '../lib/format'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FIELD = 'w-full border border-steel-300 px-3 py-2 rounded-sm bg-white'
const BTN = 'w-full bg-belt-700 hover:bg-belt-600 disabled:opacity-60 text-white py-2 rounded-sm'

/** Enter the one-time code from an email. A valid code signs the person in; the existing approval checks then apply as usual. */
function CodeEntry({ email, inline }: { email: string; inline?: boolean }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const verify = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (!isOtpCode(code)) return setMsg('Enter the code from the email (digits only).')
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setMsg('That code is not valid or has expired. Use the newest email, or request a new code.')
  }
  return (
    <form onSubmit={verify} noValidate className={inline ? 'bg-white border border-steel-300 p-6 space-y-3' : 'space-y-3'}>
      {inline && <h2 className="font-semibold">Have a code?</h2>}
      <p className="text-sm text-steel-600">Enter the code from the email sent to <b>{email}</b>{inline ? ', or click the button in that email.' : '.'}</p>
      <label htmlFor="otp" className="sr-only">Code from the email</label>
      <input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="123456" value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${FIELD} text-center text-xl font-mono tracking-[0.4em]`} />
      {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}
      <button disabled={busy} className={BTN}>{busy ? 'Checking…' : 'Verify and sign in'}</button>
    </form>
  )
}

/** Sign in with a one-time code sent by email, instead of a password. Only for people who already have an account. */
function CodeSignIn({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(wait - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    setMsg(null)
    const addr = email.trim().toLowerCase()
    if (!isConfigured) return setMsg({ ok: false, text: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' })
    if (!EMAIL_RE.test(addr)) return setMsg({ ok: false, text: 'Enter a valid work email address.' })
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: false } })
    setBusy(false)
    // An address without an account gets the same answer, so this page cannot be used to find out who has an account.
    if (error && !/signups? not allowed|user not found/i.test(error.message)) return setMsg({ ok: false, text: error.message })
    setSent(addr)
    setWait(60)
    setMsg({ ok: true, text: `If ${addr} has an account, a sign-in code is on its way. It can take a minute to arrive.` })
  }

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md bg-white border border-steel-300 p-6 space-y-4">
        <a href="https://www.ultraplastindia.com/" target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold text-belt-700 underline">Ultraplast Chainbelts Pvt. Ltd.</a>
        <h1 className="text-2xl font-bold">Sign in with a code</h1>
        <form onSubmit={send} className="space-y-3" noValidate>
          <div><label htmlFor="ce" className="text-sm font-medium">Work email</label>
            <input id="ce" type="email" className={FIELD} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={sent !== null} /></div>
          {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
          {sent === null
            ? <button disabled={busy} className={BTN}>{busy ? 'Please wait…' : 'Email me a code'}</button>
            : <button type="button" disabled={busy || wait > 0} onClick={() => void send()} className="text-sm underline disabled:no-underline disabled:text-steel-600">{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</button>}
        </form>
        {sent !== null && <CodeEntry email={sent} />}
        <p className="text-sm text-steel-600">
          <button type="button" onClick={onBack} className="underline">Use my password instead</button>
          {' · '}<Link className="underline" to="/request-access">Request access</Link>
        </p>
      </div>
    </div>
  )
}

export default function Login() {
  const { pathname } = useLocation()
  const request = pathname === '/request-access'
  const { session } = useAuth()
  const [f, setF] = useState({ name: '', company: '', email: '', password: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [codeMode, setCodeMode] = useState(false)
  const [verifyFor, setVerifyFor] = useState<string | null>(null)
  if (session) return <Navigate to="/" replace />
  if (!request && codeMode) return <CodeSignIn onBack={() => setCodeMode(false)} />

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    const email = f.email.trim().toLowerCase()
    if (!isConfigured) return setMsg({ ok: false, text: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.' })
    if (!EMAIL_RE.test(email)) return setMsg({ ok: false, text: 'Enter a valid work email address.' })
    if (f.password.length < 10) return setMsg({ ok: false, text: 'Use a password of at least 10 characters.' })
    if (request && (f.name.trim().length < 2 || f.company.trim().length < 2)) return setMsg({ ok: false, text: 'Enter your name and company.' })
    setBusy(true)
    const res = request
      ? await supabase.auth.signUp({ email, password: f.password, options: { data: { full_name: f.name.trim(), company: f.company.trim() }, emailRedirectTo: `${window.location.origin}/login` } })
      : await supabase.auth.signInWithPassword({ email, password: f.password })
    setBusy(false)
    if (res.error) return setMsg({ ok: false, text: res.error.message })
    if (request) {
      setMsg({ ok: true, text: 'Check your email to verify your address. An administrator then reviews your request.' })
      setVerifyFor(email)
    }
  }

  const field = 'w-full border border-steel-300 px-3 py-2 rounded-sm bg-white'
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md space-y-4">
      <form onSubmit={submit} className="w-full bg-white border border-steel-300 p-6 space-y-4" noValidate>
        <a href="https://www.ultraplastindia.com/" target="_blank" rel="noopener noreferrer" className="block text-sm font-semibold text-belt-700 underline">Ultraplast Chainbelts Pvt. Ltd.</a>
        <h1 className="text-2xl font-bold">{request ? 'Request access' : 'Sign in'}</h1>
        {request && (<>
          <div><label htmlFor="n" className="text-sm font-medium">Full name</label><input id="n" className={field} value={f.name} onChange={set('name')} autoComplete="name" /></div>
          <div><label htmlFor="c" className="text-sm font-medium">Company</label><input id="c" className={field} value={f.company} onChange={set('company')} autoComplete="organization" /></div>
        </>)}
        <div><label htmlFor="e" className="text-sm font-medium">Work email</label><input id="e" type="email" className={field} value={f.email} onChange={set('email')} autoComplete="email" /></div>
        <div><label htmlFor="p" className="text-sm font-medium">Password</label><input id="p" type="password" className={field} value={f.password} onChange={set('password')} autoComplete={request ? 'new-password' : 'current-password'} /></div>
        {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
        <button disabled={busy} className="w-full bg-belt-700 hover:bg-belt-600 disabled:opacity-60 text-white py-2 rounded-sm">{busy ? 'Please wait…' : request ? 'Request access' : 'Sign in'}</button>
        {!request && <button type="button" onClick={() => setCodeMode(true)} className="w-full border border-belt-700 text-belt-700 hover:bg-belt-100 py-2 rounded-sm">Email me a sign-in code instead</button>}
        <p className="text-sm text-steel-600">
          {request ? <>Already approved? <Link className="underline" to="/login">Sign in</Link></> : <>No account? <Link className="underline" to="/request-access">Request access</Link></>}
        </p>
      </form>
      {request && verifyFor && <CodeEntry email={verifyFor} inline />}
      </div>
    </div>
  )
}
