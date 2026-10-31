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
      if (can('manage_rfq')) list.unshift(['New quotation requests', count('rfq_requests', ['status', 'new'])])
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

  const TILES: { group: string; items: { to: string; title: string; text: string; perm: string }[] }[] = [
    { group: 'Catalogue', items: [
      { to: '/admin/products', title: 'Products', text: 'Add or edit products: details, several categories, specifications and images.', perm: 'manage_catalogue' },
      { to: '/admin/categories', title: 'Categories', text: 'Add, rename, reorder and hide categories.', perm: 'manage_catalogue' },
      { to: '/admin/images', title: 'Bulk product images', text: 'Upload many product images at once, matched by product code.', perm: 'manage_catalogue' },
      { to: '/admin/import', title: 'Import products', text: 'Upload an Excel or CSV file with many products.', perm: 'manage_imports' },
      { to: '/admin/review', title: 'Review queue', text: 'Publish, verify or archive imported products.', perm: 'manage_catalogue' }] },
    { group: 'Files', items: [
      { to: '/documents', title: 'Documents', text: 'CAD files, datasheets and drawings.', perm: 'upload_documents' },
      { to: '/admin/page-images', title: 'Catalogue page images', text: 'Upload page pictures (page-0001.jpg and so on) shown on product pages.', perm: 'manage_imports' },
      { to: '/admin/files', title: 'Catalogue PDF files', text: 'Store the full catalogue PDFs privately.', perm: 'manage_imports' }] },
    { group: 'Sharing', items: [
      { to: '/admin/share', title: 'Customer links', text: 'See, copy and withdraw links shared with customers.', perm: 'create_share_links' },
      { to: '/admin/rfq', title: 'Quotation requests', text: 'Requests sent from the Smart Guide quotation list.', perm: 'manage_rfq' }] },
    { group: 'People', items: [{ to: '/admin/access', title: 'User access', text: 'Approve people, set roles, suspend accounts.', perm: 'manage_users' }] },
  ]
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Admin panel</h1>
      <ul className="grid gap-px bg-steel-300 border border-steel-300 rounded-md overflow-hidden sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([l, n]) => <li key={l} className="bg-white px-4 py-3"><p className="text-sm text-steel-600">{l}</p><p className="text-2xl font-bold">{n ?? 'Not available'}</p></li>)}
      </ul>
      {TILES.map((g) => {
        const items = g.items.filter((t) => can(t.perm))
        if (items.length === 0) return null
        return (
          <section key={g.group} aria-label={g.group}>
            <h2 className="font-semibold mb-2">{g.group}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((t) => (
                <li key={t.to}><Link to={t.to} className="block h-full bg-white border border-steel-300 border-l-4 border-l-brand-navy rounded-md p-4 shadow-sm hover:shadow-md transition">
                  <span className="font-semibold">{t.title}</span><span className="block text-sm text-steel-600 mt-1">{t.text}</span></Link></li>))}
            </ul>
          </section>)
      })}
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
