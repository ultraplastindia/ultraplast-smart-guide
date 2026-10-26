import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { STATUS_LABEL, availableActions, type AccessStatus, type AdminAction, type AppRole } from '../lib/access'

type One<T> = T | T[] | null
interface Row {
  id: string; email: string; full_name: string | null; company: string | null
  access_status: AccessStatus; last_sign_in_at: string | null; created_at: string
  user_roles: One<{ role: AppRole }>; access_requests: One<{ requested_at: string }>
}
interface Invite { email: string; role: AppRole; added_at: string; claimed_at: string | null }
const first = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v)
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—')

const RPC: Record<AdminAction, string> = {
  approve: 'admin_approve_user', reject: 'admin_reject_user', suspend: 'admin_suspend_user', reactivate: 'admin_reactivate_user',
}
const LABEL: Record<AdminAction, string> = { approve: 'Approve', reject: 'Reject', suspend: 'Suspend', reactivate: 'Reactivate' }

export default function AdminAccess() {
  const { role: myRole, session } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<AccessStatus | ''>('')
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    let query = supabase.from('profiles')
      .select('id,email,full_name,company,access_status,last_sign_in_at,created_at,user_roles(role),access_requests(requested_at)')
      .order('created_at', { ascending: false }).limit(100)
    const term = q.trim().replace(/[%_\\,()]/g, '')
    if (term) query = query.ilike('email', `%${term}%`)
    if (filter) query = query.eq('access_status', filter)
    const [users, inv] = await Promise.all([
      query,
      supabase.from('email_allowlist').select('email,role,added_at,claimed_at').is('claimed_at', null).order('added_at', { ascending: false }),
    ])
    if (users.error) setMsg({ ok: false, text: users.error.message })
    else setRows(users.data as unknown as Row[])
    if (!inv.error) setInvites(inv.data as Invite[])
  }, [q, filter])

  useEffect(() => { void load() }, [load])

  const run = async (fn: string, args: Record<string, unknown>, done: string) => {
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: done })
    if (!error) await load()
  }

  const addInvite = async (e: FormEvent) => {
    e.preventDefault()
    await run('admin_add_allowlist', { p_email: email.trim() }, 'Email added. That person is approved once they verify this address.')
    setEmail('')
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">User access</h1>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}

      <section aria-labelledby="inv" className="space-y-3">
        <h2 id="inv" className="text-lg font-semibold">Approved email list</h2>
        <form onSubmit={addInvite} className="flex gap-2 max-w-xl">
          <label htmlFor="ie" className="sr-only">Email to approve</label>
          <input id="ie" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="flex-1 border border-steel-300 px-3 py-2 bg-white" />
          <button disabled={busy} className="bg-belt-700 text-white px-4 disabled:opacity-60">Add email</button>
        </form>
        {invites.length === 0 ? <p className="text-sm text-steel-600">No pending invitations. Add an email to pre-approve a person.</p> : (
          <ul className="text-sm divide-y divide-steel-300 border border-steel-300 bg-white">
            {invites.map((i) => (
              <li key={i.email} className="flex items-center justify-between px-3 py-2">
                <span>{i.email} <span className="text-steel-600">(Invited, {i.role})</span></span>
                <button className="underline" onClick={() => void run('admin_remove_allowlist', { p_email: i.email }, 'Invitation removed.')}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="usr" className="space-y-3">
        <h2 id="usr" className="text-lg font-semibold">Users</h2>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="sq" className="sr-only">Search by email</label>
          <input id="sq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email" className="border border-steel-300 px-3 py-2 bg-white" />
          <label htmlFor="sf" className="sr-only">Filter by status</label>
          <select id="sf" value={filter} onChange={(e) => setFilter(e.target.value as AccessStatus | '')} className="border border-steel-300 px-3 py-2 bg-white">
            <option value="">All statuses</option>
            {(Object.keys(STATUS_LABEL) as AccessStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        {rows.length === 0 ? <p className="text-sm text-steel-600">No users match. Clear the search or filter.</p> : (
          <div className="overflow-x-auto border border-steel-300 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-steel-100 text-left"><tr>
                {['Email', 'Name / company', 'Status', 'Role', 'Requested', 'Last sign-in', 'Actions'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const tRole = first(r.user_roles)?.role ?? null
                  const actions = r.id === session?.user.id ? [] : availableActions(r.access_status, myRole, tRole)
                  return (
                    <tr key={r.id} className="border-t border-steel-300 align-top">
                      <td className="px-3 py-2">{r.email}</td>
                      <td className="px-3 py-2">{r.full_name ?? 'Not available'}<br /><span className="text-steel-600">{r.company ?? ''}</span></td>
                      <td className="px-3 py-2">{STATUS_LABEL[r.access_status]}</td>
                      <td className="px-3 py-2">
                        {myRole === 'super_admin' && r.access_status === 'approved' && r.id !== session?.user.id ? (
                          <select aria-label={`Role for ${r.email}`} value={tRole ?? 'approved_user'} disabled={busy}
                            onChange={(e) => void run('admin_set_role', { p_target: r.id, p_role: e.target.value }, 'Role updated.')} className="border border-steel-300 px-1 py-1">
                            <option value="approved_user">Approved user</option><option value="admin">Admin</option><option value="super_admin">Super Admin</option>
                          </select>
                        ) : (tRole ?? '—')}
                      </td>
                      <td className="px-3 py-2">{fmt(first(r.access_requests)?.requested_at ?? r.created_at)}</td>
                      <td className="px-3 py-2">{fmt(r.last_sign_in_at)}</td>
                      <td className="px-3 py-2 space-x-2">
                        {actions.map((a) => (
                          <button key={a} disabled={busy} className="border border-steel-300 px-2 py-1 hover:bg-steel-100 disabled:opacity-60"
                            onClick={() => void run(RPC[a], { p_target: r.id }, `${LABEL[a]} done.`)}>{LABEL[a]}</button>
                        ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
