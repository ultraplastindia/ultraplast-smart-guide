import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listCategories, type Category } from '../lib/catalogue'

export default function Categories() {
  const [sp] = useSearchParams()
  const zone = sp.get('zone') ?? undefined
  const [cats, setCats] = useState<Category[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { listCategories(zone).then(setCats).catch((e: Error) => setErr(e.message)) }, [zone])
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Product categories</h1>
      {zone && <p className="text-sm text-steel-600">Filtered by explorer area. <Link className="underline" to="/categories">Show all categories</Link></p>}
      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
      {cats === null && !err && <p role="status" className="text-steel-600">Loading categories…</p>}
      {cats?.length === 0 && <p className="text-steel-600">No categories here yet. An administrator can add categories and link them to explorer areas.</p>}
      <ul className="grid gap-px bg-steel-300 border border-steel-300 sm:grid-cols-2 lg:grid-cols-3">
        {cats?.map((c) => (
          <li key={c.id} className="bg-white">
            <Link to={`/catalogue?category=${c.id}`} className="block px-4 py-4 hover:bg-belt-100">
              <span className="font-medium">{c.name}</span>
              {c.description && <span className="block text-sm text-steel-600 mt-1">{c.description}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
