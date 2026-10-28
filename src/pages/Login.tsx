import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase, isConfigured } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  const { pathname } = useLocation()
  const request = pathname === '/request-access'
  const { session } = useAuth()
  const [f, setF] = useState({ name: '', company: '', email: '', password: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  if (session) return <Navigate to="/" replace />

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
    if (request) setMsg({ ok: true, text: 'Check your email to verify your address. An administrator then reviews your request.' })
  }

  const field = 'w-full border border-steel-300 px-3 py-2 rounded-sm bg-white'
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <form onSubmit={submit} className="w-full max-w-md bg-white border border-steel-300 p-6 space-y-4" noValidate>
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
        <p className="text-sm text-steel-600">
          {request ? <>Already approved? <Link className="underline" to="/login">Sign in</Link></> : <>No account? <Link className="underline" to="/request-access">Request access</Link></>}
        </p>
      </form>
    </div>
  )
}
