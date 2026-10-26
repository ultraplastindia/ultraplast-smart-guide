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
      <section>
        <h1 className="text-3xl font-bold max-w-2xl">Find the right chain, belt or component by code, name or specification.</h1>
        <form onSubmit={submit} role="search" className="mt-5 flex max-w-2xl">
          <label htmlFor="q" className="sr-only">Search products</label>
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product code, name or specification" className="flex-1 border border-steel-300 px-4 py-3 rounded-l-sm bg-white" />
          <button className="bg-belt-700 hover:bg-belt-600 text-white px-5 rounded-r-sm flex items-center gap-2"><Search size={18} aria-hidden /> Search</button>
        </form>
        <p className="mt-3 text-sm"><Link className="underline" to="/explorer">Open the conveyor explorer</Link> · <Link className="underline" to="/bom">My BOM</Link></p>
      </section>
      <section aria-labelledby="cats">
        <h2 id="cats" className="text-xl font-semibold mb-3">Product categories</h2>
        {cats.length === 0 ? <p className="text-steel-600">No categories yet. They appear here once an administrator adds them.</p> : (
          <ul className="grid gap-px bg-steel-300 border border-steel-300 sm:grid-cols-2 lg:grid-cols-3">
            {cats.map((c) => <li key={c.id} className="bg-white"><Link to={`/catalogue?category=${c.id}`} className="block px-4 py-4 hover:bg-belt-100">{c.name}</Link></li>)}
          </ul>)}
      </section>
      <section aria-labelledby="rec">
        <h2 id="rec" className="text-xl font-semibold mb-3">Recently added products</h2>
        {recent.length === 0 ? <p className="text-steel-600">No products yet.</p> : (
          <ul className="text-sm space-y-1">{recent.map((p) => <li key={p.id}><Link className="underline" to={`/products/${p.id}`}>{p.product_code} — {p.name}</Link></li>)}</ul>)}
      </section>
    </div>
  )
}
