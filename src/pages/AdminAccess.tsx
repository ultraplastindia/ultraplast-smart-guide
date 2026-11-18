import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PANELS, STATUS_LABEL, availableActions, type AccessStatus, type AdminAction, type AppRole } from '../lib/access'

type One<T> = T | T[] | null
interface Row {
  id: string; email: string; full_name: string | null; company: string | null
  access_status: AccessStatus; last_sign_in_at: string | null; created_at: string
  user_roles: One<{ role: AppRole }>; access_requests: One<{ requested_at: string }>
}
interface PanelRole { id: string; name: string; description: string; panels: string[] }
interface RoleForm { id: string | null; name: string; description: string; panels: string[] }
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
  const [params] = useSearchParams()
  const [filter, setFilter] = useState<AccessStatus | ''>(() => {
    const s = params.get('status') ?? ''
    return (Object.keys(STATUS_LABEL) as string[]).includes(s) ? (s as AccessStatus) : ''
  })
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [roles, setRoles] = useState<PanelRole[]>([])
  const [assigned, setAssigned] = useState<Map<string, string>>(new Map())
  const [rolesReady, setRolesReady] = useState(true)
  const [form, setForm] = useState<RoleForm | null>(null)

  const load = useCallback(async () => {
    let query = supabase.from('profiles')
      .select('id,email,full_name,company,access_status,last_sign_in_at,created_at,user_roles!user_id(role),access_requests!user_id(requested_at)')
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
    const [pr, up] = await Promise.all([supabase.from('panel_roles').select('id,name,description,panels').order('name'), supabase.from('user_panel_roles').select('user_id,role_id')])
    setRolesReady(!pr.error && !up.error)
    if (!pr.error) setRoles((pr.data ?? []) as PanelRole[])
    if (!up.error) setAssigned(new Map(((up.data ?? []) as { user_id: string; role_id: string }[]).map((r) => [r.user_id, r.role_id])))
  }, [q, filter])

  useEffect(() => { void load() }, [load])

  const run = async (fn: string, args: Record<string, unknown>, done: string) => {
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc(fn, args)
    setBusy(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: done })
    if (!error) await load()
    return !error
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
                {['Email', 'Name / company', 'Status', 'Role', ...(rolesReady ? ['Panels'] : []), 'Requested', 'Last sign-in', 'Actions'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
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
                      {rolesReady && (
                        <td className="px-3 py-2">
                          {r.access_status === 'approved' && r.id !== session?.user.id && tRole !== 'super_admin' ? (
                            <select aria-label={`Panel role for ${r.email}`} value={assigned.get(r.id) ?? ''} disabled={busy}
                              onChange={(e) => void run('admin_assign_panel_role', { p_target: r.id, p_role: e.target.value || null }, 'Panels updated.')} className="border border-steel-300 px-1 py-1 max-w-[11rem]">
                              <option value="">All panels</option>
                              {roles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                          ) : (tRole === 'super_admin' ? 'All panels' : '—')}
                        </td>)}
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

      {rolesReady && (
        <section aria-labelledby="rol" className="space-y-3">
          <h2 id="rol" className="text-lg font-semibold">Roles and panels</h2>
          <p className="text-sm text-steel-600">A role decides which panels (menu sections) a person sees. Choose a role for each person in the Users table above. People with no role see every panel. Only a Super Admin can create or change roles. Panels control what is shown; what a person may read or change is still decided by their permissions.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {roles.map((r) => (
              <li key={r.id} className="border border-steel-300 bg-white p-3 text-sm">
                <p className="font-semibold">{r.name} <span className="font-normal text-steel-600">({[...assigned.values()].filter((v) => v === r.id).length} people)</span></p>
                {r.description && <p className="text-steel-600">{r.description}</p>}
                <p className="mt-1">{PANELS.filter(([k]) => r.panels.includes(k)).map(([, l]) => l).join(', ') || 'No panels'}</p>
                {myRole === 'super_admin' && (
                  <p className="mt-2 space-x-3">
                    <button className="underline" onClick={() => setForm({ id: r.id, name: r.name, description: r.description, panels: r.panels })}>Edit</button>
                    <button className="underline text-red-700" onClick={() => { if (window.confirm(`Delete the role "${r.name}"? People who have it will see every panel.`)) void run('admin_delete_panel_role', { p_id: r.id }, 'Role deleted.') }}>Delete</button>
                  </p>)}
              </li>))}
          </ul>
          {myRole === 'super_admin' && !form && <button className="bg-belt-700 text-white px-4 py-2" onClick={() => setForm({ id: null, name: '', description: '', panels: ['guide'] })}>New role</button>}
          {form && (
            <form className="border border-steel-300 bg-white p-4 space-y-3 max-w-2xl" onSubmit={(e) => {
              e.preventDefault()
              void run('admin_save_panel_role', { p_id: form.id, p_name: form.name, p_description: form.description, p_panels: form.panels }, 'Role saved.').then((ok) => { if (ok) setForm(null) })
            }}>
              <h3 className="font-semibold">{form.id ? 'Edit role' : 'New role'}</h3>
              <div><label htmlFor="rn" className="block text-sm font-medium">Role name</label><input id="rn" required maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border border-steel-300 px-3 py-2 w-full bg-white" /></div>
              <div><label htmlFor="rd" className="block text-sm font-medium">Description (optional)</label><input id="rd" maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border border-steel-300 px-3 py-2 w-full bg-white" /></div>
              <fieldset><legend className="text-sm font-medium">Panels this role can see</legend>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                  {PANELS.map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.panels.includes(k)} onChange={(e) => setForm({ ...form, panels: e.target.checked ? [...form.panels, k] : form.panels.filter((x) => x !== k) })} />{label}</label>))}
                </div>
                <p className="text-xs text-steel-600 mt-1">The Guide is fully usable on its own: nothing inside it sends a person to another panel.</p>
              </fieldset>
              <div className="flex gap-2"><button disabled={busy} className="bg-belt-700 text-white px-4 py-2 disabled:opacity-60">Save role</button><button type="button" className="border border-steel-300 px-4 py-2" onClick={() => setForm(null)}>Cancel</button></div>
            </form>)}
        </section>)}
    </div>
  )
}
