import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { STATUS_LABEL } from '../lib/access'

export function Profile() {
  const { session, status, role } = useAuth()
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    if (!session) return
    supabase.from('profiles').select('full_name,company').eq('id', session.user.id).maybeSingle().then(({ data }) => {
      setName(data?.full_name ?? ''); setCompany(data?.company ?? '')
    })
  }, [session])
  const save = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.rpc('update_my_profile', { p_name: name, p_company: company })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Profile saved.' })
  }
  const f = 'border border-steel-300 px-3 py-2 bg-white w-full'
  return (
    <form onSubmit={save} className="max-w-md space-y-3">
      <h1 className="text-2xl font-bold">Profile</h1>
      <p className="text-sm">Email: {session?.user.email}<br />Access: {STATUS_LABEL[status]}<br />Role: {role ?? 'Not available'}</p>
      <div><label htmlFor="pn" className="block text-sm font-medium">Full name</label><input id="pn" className={f} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><label htmlFor="pc" className="block text-sm font-medium">Company</label><input id="pc" className={f} maxLength={120} value={company} onChange={(e) => setCompany(e.target.value)} /></div>
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
      <button className="bg-belt-700 text-white px-4 py-2">Save</button>
      <p className="text-xs text-steel-600">Your email, role and access status can only be changed by an administrator.</p>
    </form>
  )
}
