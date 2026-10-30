import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { listCategories, recentProducts, type Category } from '../lib/catalogue'

export default function Home() {
  const [q, setQ] = useState('')
  const [cats, setCats] = useState<Category[]>([])
  const [recent, setRecent] = useState<{ id: string; product_code: string; name: string }[]>([])
  const nav = useNavigate()
  useEffect(() => {
    listCategories().then(setCats).catch(() => setCats([]))
    recentProducts().then(setRecent).catch(() => setRecent([]))
  }, [])
  const submit = (e: FormEvent) => { e.preventDefault(); nav(`/catalogue?q=${encodeURIComponent(q.trim())}`) }
  return (
    <div className="space-y-10">
      <section className="rounded-lg bg-gradient-to-br from-brand-navy via-steel-800 to-steel-950 text-white p-6 sm:p-10 shadow">
        <p className="text-sm uppercase tracking-wider text-amber-chain">Ultraplast Chainbelts Pvt. Ltd.</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold max-w-2xl">Find the right chain, belt or component by code, name or specification.</h1>
        <form onSubmit={submit} role="search" className="mt-6 flex max-w-2xl shadow-lg">
          <label htmlFor="q" className="sr-only">Search products</label>
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product code, name or specification" className="flex-1 px-4 py-3 rounded-l-md bg-white text-steel-950" />
          <button className="bg-brand-green hover:opacity-90 text-white px-5 rounded-r-md flex items-center gap-2"><Search size={18} aria-hidden /> Search</button>
        </form>
        <p className="mt-4 text-sm space-x-5"><Link className="underline" to="/catalogue">Browse the catalogue</Link><Link className="underline" to="/explorer">Conveyor explorer</Link><Link className="underline" to="/bom">My BOM</Link></p>
      </section>
      <section aria-labelledby="cats">
        <h2 id="cats" className="text-xl font-semibold mb-3">Product categories</h2>
        {cats.length === 0 ? <p className="text-steel-600">No categories yet. They appear here once an administrator adds them.</p> : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cats.map((c) => (
              <li key={c.id}><Link to={`/catalogue?category=${c.id}`} className="block h-full bg-white border border-steel-300 border-l-4 border-l-brand-green rounded-md px-4 py-4 shadow-sm hover:shadow-md transition">
                <span className="font-semibold">{c.name}</span>{c.description && <span className="block text-sm text-steel-600 mt-1">{c.description}</span>}</Link></li>))}
          </ul>)}
      </section>
      <section aria-labelledby="rec">
        <h2 id="rec" className="text-xl font-semibold mb-3">Recently added products</h2>
        {recent.length === 0 ? <p className="text-steel-600">No products yet.</p> : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{recent.map((p) => (
            <li key={p.id}><Link className="block bg-white border border-steel-300 rounded-md px-4 py-3 hover:shadow-md transition" to={`/products/${p.id}`}><span className="block font-mono text-xs text-steel-600">{p.product_code}</span><span className="font-medium">{p.name}</span></Link></li>))}
          </ul>)}
      </section>
    </div>
  )
}
