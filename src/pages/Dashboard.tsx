import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useCompare } from '../lib/compare'
import { getFacets, recentProducts, type Facets } from '../lib/catalogue'

const ROLE: Record<string, string> = { super_admin: 'Super Admin', admin: 'Administrator', approved_user: 'Approved user' }
interface BomRow { id: string; reference: string; name: string; updated_at: string; bom_items: { count: number }[] }

async function count(table: string, filter?: [string, string]): Promise<number | null> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
  if (filter) q = q.eq(filter[0], filter[1])
  const { count: n, error } = await q
  return error ? null : n
}

export default function Dashboard() {
  const { session, role, can } = useAuth()
  const { ids } = useCompare()
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [q, setQ] = useState('')
  const [stats, setStats] = useState<{ products: number | null; categories: number | null; boms: number | null; docs: number | null } | null>(null)
  const [boms, setBoms] = useState<BomRow[]>([])
  const [recent, setRecent] = useState<{ id: string; product_code: string; name: string }[]>([])
  const [facets, setFacets] = useState<Facets | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      if (session) {
        const p = await supabase.from('profiles').select('full_name').eq('id', session.user.id).maybeSingle()
        if (live) setName(p.data?.full_name ?? '')
      }
      const [products, categories, bomCount, docs] = await Promise.all([count('products', ['status', 'active']), count('product_categories', ['is_active', 'true']), count('boms'), count('technical_documents')])
      if (live) setStats({ products, categories, boms: bomCount, docs })
      const b = await supabase.from('boms').select('id,reference,name,updated_at,bom_items(count)').order('updated_at', { ascending: false }).limit(5)
      if (live && b.data) setBoms(b.data as unknown as BomRow[])
      recentProducts(6).then((r) => live && setRecent(r)).catch(() => undefined)
      getFacets().then((f) => live && setFacets(f)).catch(() => undefined)
    })()
    return () => { live = false }
  }, [session])

  const submit = (e: FormEvent) => { e.preventDefault(); nav(`/catalogue?q=${encodeURIComponent(q.trim())}`) }
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const who = name || session?.user.email || ''

  const STATS: { label: string; value: number | null | undefined; to: string }[] = [
    { label: 'Products available', value: stats?.products, to: '/catalogue' }, { label: 'Categories', value: stats?.categories, to: '/categories' },
    { label: 'My BOMs', value: stats?.boms, to: '/bom' }, { label: 'Documents', value: stats?.docs, to: '/documents' },
  ]
  const ACTIONS: { to: string; title: string; text: string }[] = [
    { to: '/catalogue', title: 'Browse the catalogue', text: 'Search by code, name or specification.' },
    { to: '/explorer', title: 'Conveyor explorer', text: 'Pick a part of the conveyor to see its categories.' },
    { to: '/bom', title: 'My BOM', text: 'Build and export a parts list.' },
    { to: '/compare', title: `Compare products${ids.length ? ` (${ids.length})` : ''}`, text: 'Put up to four products side by side.' },
    { to: '/documents', title: 'Documents', text: 'Datasheets, drawings and CAD files.' },
    can('manage_catalogue') ? { to: '/admin', title: 'Admin panel', text: 'Manage products, categories, files and users.' } : { to: '/help', title: 'Help', text: 'How to use the guide.' },
  ]

  return (
    <div className="space-y-8">
      <section className="rounded-lg bg-gradient-to-br from-brand-navy via-steel-800 to-steel-950 text-white p-6 sm:p-8 shadow">
        <p className="text-sm text-amber-chain uppercase tracking-wider">{role ? ROLE[role] ?? role : 'Dashboard'} · {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold">{greeting}{who ? `, ${who}` : ''}</h1>
        <p className="mt-1 text-steel-100 text-sm">Your overview of the Ultraplast Chainbelts product guide.</p>
        <form onSubmit={submit} role="search" className="mt-5 flex max-w-xl shadow-lg">
          <label htmlFor="dq" className="sr-only">Search products</label>
          <input id="dq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products by code, name or specification" className="flex-1 px-4 py-2.5 rounded-l-md bg-white text-steel-950 text-sm" />
          <button className="bg-brand-green hover:opacity-90 text-white px-4 rounded-r-md flex items-center gap-2 text-sm"><Search size={16} aria-hidden /> Search</button>
        </form>
      </section>

      <section aria-label="Overview"><ul className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {STATS.map((s) => (
          <li key={s.label}><Link to={s.to} className="block bg-white border border-steel-300 rounded-md p-4 shadow-sm hover:shadow-md transition">
            <span className="block text-sm text-steel-600">{s.label}</span>
            <span className="block text-3xl font-bold text-brand-navy">{stats === null ? '…' : s.value ?? 'Not available'}</span></Link></li>))}
      </ul></section>

      <section aria-labelledby="qa"><h2 id="qa" className="text-lg font-semibold mb-3">Quick actions</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map((a) => (
            <li key={a.to}><Link to={a.to} className="block h-full bg-white border border-steel-300 border-l-4 border-l-brand-green rounded-md p-4 shadow-sm hover:shadow-md transition">
              <span className="font-semibold">{a.title}</span><span className="block text-sm text-steel-600 mt-1">{a.text}</span></Link></li>))}
        </ul></section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="rb" className="bg-white border border-steel-300 rounded-md p-4">
          <div className="flex items-center justify-between mb-2"><h2 id="rb" className="font-semibold">Recent BOMs</h2><Link className="text-sm underline" to="/bom">All BOMs</Link></div>
          {boms.length === 0 ? <p className="text-sm text-steel-600">No BOMs yet. Open a product and choose Add to BOM.</p> : (
            <ul className="divide-y divide-steel-300 text-sm">{boms.map((b) => (
              <li key={b.id} className="py-2"><Link className="flex items-center justify-between gap-3 hover:text-brand-green" to={`/bom?open=${b.id}`}>
                <span><span className="font-medium">{b.name}</span><span className="block text-xs text-steel-600">{b.reference}</span></span>
                <span className="text-right text-xs text-steel-600 whitespace-nowrap">{b.bom_items?.[0]?.count ?? 0} lines<br />{new Date(b.updated_at).toLocaleDateString()}</span></Link></li>))}</ul>)}
        </section>
        <section aria-labelledby="rp" className="bg-white border border-steel-300 rounded-md p-4">
          <div className="flex items-center justify-between mb-2"><h2 id="rp" className="font-semibold">Recently added products</h2><Link className="text-sm underline" to="/catalogue">Catalogue</Link></div>
          {recent.length === 0 ? <p className="text-sm text-steel-600">No products yet.</p> : (
            <ul className="divide-y divide-steel-300 text-sm">{recent.map((p) => (
              <li key={p.id} className="py-2"><Link className="block hover:text-brand-green" to={`/products/${p.id}`}><span className="font-mono text-xs text-steel-600">{p.product_code}</span><span className="block font-medium">{p.name}</span></Link></li>))}</ul>)}
        </section>
      </div>

      {facets && facets.categories.length > 0 && (
        <section aria-labelledby="bc"><h2 id="bc" className="text-lg font-semibold mb-3">Browse by category</h2>
          <ul className="flex flex-wrap gap-2">{facets.categories.slice(0, 16).map((c) => (
            <li key={c.value}><Link to={`/catalogue?category=${c.value}`} className="inline-block bg-white border border-steel-300 rounded-full px-3 py-1 text-sm hover:border-brand-green hover:text-brand-green">{c.name} <span className="text-steel-600">({c.count})</span></Link></li>))}</ul>
        </section>)}
    </div>
  )
}
