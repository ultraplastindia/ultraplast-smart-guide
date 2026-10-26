import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

async function count(table: string, filter?: [string, string]): Promise<number | null> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
  if (filter) q = q.eq(filter[0], filter[1])
  const { count: n, error } = await q
  return error ? null : n
}
interface Job { filename: string; status: string; imported: number; skipped: number; failed: number; created_at: string }
interface Log { id: number; action: string; target_type: string | null; target_id: string | null; created_at: string }

export default function AdminDashboard() {
  const { can } = useAuth()
  const [stats, setStats] = useState<[string, number | null][]>([])
  const [job, setJob] = useState<Job | null>(null)
  const [logs, setLogs] = useState<Log[]>([])

  useEffect(() => {
    let live = true
    ;(async () => {
      const users = can('manage_users')
      const list: [string, Promise<number | null>][] = [
        ['Products', count('products')], ['Drafts awaiting review', count('products', ['status', 'draft'])],
        ['Categories', count('product_categories')], ['Technical documents', count('technical_documents')],
      ]
      if (users) list.unshift(['Registered users', count('profiles')], ['Pending requests', count('profiles', ['access_status', 'pending_approval'])],
        ['Approved users', count('profiles', ['access_status', 'approved'])], ['Suspended users', count('profiles', ['access_status', 'suspended'])])
      const done = await Promise.all(list.map(async ([l, p]) => [l, await p] as [string, number | null]))
      if (live) setStats(done)
      if (can('manage_imports')) {
        const j = await supabase.from('import_jobs').select('filename,status,imported,skipped,failed,created_at').order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (live) setJob(j.data as Job | null)
      }
      if (can('view_audit_log')) {
        const l = await supabase.from('audit_logs').select('id,action,target_type,target_id,created_at').order('created_at', { ascending: false }).limit(10)
        if (live && l.data) setLogs(l.data as Log[])
      }
    })()
    return () => { live = false }
  }, [can])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin dashboard</h1>
      <ul className="grid gap-px bg-steel-300 border border-steel-300 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([l, n]) => <li key={l} className="bg-white px-4 py-3"><p className="text-sm text-steel-600">{l}</p><p className="text-2xl font-bold">{n ?? 'Not available'}</p></li>)}
      </ul>
      <p className="text-sm space-x-4">
        {can('manage_users') && <Link className="underline" to="/admin/access">User access</Link>}
        {can('manage_imports') && <Link className="underline" to="/admin/import">Import</Link>}
        <Link className="underline" to="/admin/review">Review queue</Link>
        {can('upload_documents') && <Link className="underline" to="/documents">Documents</Link>}
      </p>
      {can('manage_imports') && (
        <section aria-labelledby="ij"><h2 id="ij" className="font-semibold mb-1">Latest catalogue import</h2>
          {job ? <p className="text-sm">{job.filename}: {job.status}, {job.imported} imported, {job.skipped} skipped, {job.failed} failed ({new Date(job.created_at).toLocaleString()})</p> : <p className="text-sm text-steel-600">No imports yet.</p>}
        </section>)}
      {can('view_audit_log') && (
        <section aria-labelledby="al"><h2 id="al" className="font-semibold mb-1">Recent administrative activity</h2>
          {logs.length === 0 ? <p className="text-sm text-steel-600">No activity recorded yet.</p> : (
            <ul className="text-sm divide-y divide-steel-300 border border-steel-300 bg-white">
              {logs.map((l) => <li key={l.id} className="px-3 py-2">{new Date(l.created_at).toLocaleString()}: {l.action}{l.target_type ? ` (${l.target_type})` : ''}</li>)}
            </ul>)}
        </section>)}
    </div>
  )
}
