import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useCompare } from '../lib/compare'
import { STATUS_LABEL } from '../lib/access'

export function Dashboard() {
  const [boms, setBoms] = useState<number | null>(null)
  const { ids } = useCompare()
  useEffect(() => {
    supabase.from('boms').select('id', { count: 'exact', head: true }).then(({ count }) => setBoms(count))
  }, [])
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <ul className="grid gap-px bg-steel-300 border border-steel-300 sm:grid-cols-3">
        <li className="bg-white px-4 py-3"><p className="text-sm text-steel-600">My BOMs</p><p className="text-2xl font-bold">{boms ?? 'Not available'}</p></li>
        <li className="bg-white px-4 py-3"><p className="text-sm text-steel-600">Products to compare</p><p className="text-2xl font-bold">{ids.length}</p></li>
      </ul>
      <p className="text-sm space-x-4"><Link className="underline" to="/catalogue">Catalogue</Link><Link className="underline" to="/bom">My BOM</Link><Link className="underline" to="/documents">Documents</Link></p>
    </div>
  )
}

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

export function Help() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Help</h1>
      <section><h2 className="font-semibold">Searching</h2><p className="text-sm">Search by product code, name or specification. Codes match without spaces or dashes, so 1001FT finds 1001-FT.</p></section>
      <section><h2 className="font-semibold">Data status</h2><p className="text-sm">“Not verified” means a person has not yet checked the record against the original catalogue page. Always check the catalogue page before relying on a value. “Not available” means the catalogue data does not include it.</p></section>
      <section><h2 className="font-semibold">Bill of materials</h2><p className="text-sm">Open a product and choose Add to BOM. In My BOM you can change quantities, add notes, and export to Excel or PDF if your account has the export permission, or print.</p></section>
      <section><h2 className="font-semibold">Access problems</h2><p className="text-sm">Access is approved by an Ultraplast administrator. If you cannot open a page or file, ask your administrator to check your role and permissions.</p></section>
    </div>
  )
}
