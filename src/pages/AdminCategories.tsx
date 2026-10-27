import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

interface Cat { id: string; name: string; slug: string; description: string | null; explorer_zone: string | null; sort_order: number; is_active: boolean }
const ZONES = [['', 'No explorer area'], ['chain', 'Chain'], ['modular_belt', 'Modular belt'], ['sprocket', 'Sprockets'], ['guide_rail', 'Guide rail'], ['wearstrip', 'Wearstrip'], ['accessories', 'Accessories']]
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category'

export default function AdminCategories() {
  const [cats, setCats] = useState<Cat[] | null>(null)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [zone, setZone] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('product_categories').select('id,name,slug,description,explorer_zone,sort_order,is_active').order('sort_order').order('name')
    if (error) setMsg({ ok: false, text: error.message }); else setCats(data as Cat[])
  }, [])
  useEffect(() => { void load() }, [load])

  const done = async (error: { message: string } | null, text: string) => { setMsg(error ? { ok: false, text: error.message } : { ok: true, text }); if (!error) await load() }
  const update = (id: string, change: Partial<Cat>) => supabase.from('product_categories').update(change).eq('id', id).then(({ error }) => done(error, 'Saved.'))

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setMsg({ ok: false, text: 'Enter a category name.' })
    const next = (cats?.reduce((m, c) => Math.max(m, c.sort_order), 0) ?? 0) + 10
    const { error } = await supabase.from('product_categories').insert({
      name: name.trim(), slug: `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`, description: desc.trim() || null, explorer_zone: zone || null, sort_order: next })
    if (!error) { setName(''); setDesc(''); setZone('') }
    await done(error, 'Category added.')
  }

  const move = async (i: number, dir: -1 | 1) => {
    if (!cats) return
    const list = [...cats]; const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    const results = await Promise.all(list.map((c, n) => supabase.from('product_categories').update({ sort_order: (n + 1) * 10 }).eq('id', c.id)))
    await done(results.find((r) => r.error)?.error ?? null, 'Order saved.')
  }

  const f = 'border border-steel-300 px-2 py-1 bg-white w-full'
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Categories</h1>
      <p className="text-sm text-steel-600">Add, rename, reorder and hide categories. Hidden categories disappear for users but their products stay. Link a category to an explorer area so it opens from the conveyor illustration.</p>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_12rem_auto] items-end border border-steel-300 bg-white p-3">
        <div><label htmlFor="cn" className="block text-sm font-medium">New category name</label><input id="cn" className={f} maxLength={200} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor="cd" className="block text-sm font-medium">Description (optional)</label><input id="cd" className={f} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div><label htmlFor="cz" className="block text-sm font-medium">Explorer area</label><select id="cz" className={f} value={zone} onChange={(e) => setZone(e.target.value)}>{ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <button className="bg-belt-700 text-white px-4 py-2">Add</button>
      </form>
      {cats === null && <p role="status" className="text-steel-600">Loading…</p>}
      {cats?.length === 0 && <p className="text-steel-600">No categories yet.</p>}
      {cats && cats.length > 0 && (
        <div className="overflow-x-auto border border-steel-300 bg-white"><table className="w-full text-sm">
          <thead className="bg-steel-100 text-left"><tr>{['Order', 'Name', 'Description', 'Explorer area', 'Visible'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{cats.map((c, i) => (
            <tr key={c.id + c.name + c.description} className="border-t border-steel-300 align-top">
              <td className="px-3 py-2 whitespace-nowrap">
                <button aria-label={`Move ${c.name} up`} disabled={i === 0} onClick={() => void move(i, -1)} className="border border-steel-300 px-2 disabled:opacity-30">↑</button>{' '}
                <button aria-label={`Move ${c.name} down`} disabled={i === cats.length - 1} onClick={() => void move(i, 1)} className="border border-steel-300 px-2 disabled:opacity-30">↓</button></td>
              <td className="px-3 py-2"><input aria-label={`Name of ${c.name}`} className={f} defaultValue={c.name} maxLength={200} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.name && void update(c.id, { name: e.target.value.trim() })} /></td>
              <td className="px-3 py-2"><input aria-label={`Description of ${c.name}`} className={f} defaultValue={c.description ?? ''} maxLength={500} onBlur={(e) => e.target.value !== (c.description ?? '') && void update(c.id, { description: e.target.value.trim() || null })} /></td>
              <td className="px-3 py-2"><select aria-label={`Explorer area of ${c.name}`} className={f} value={c.explorer_zone ?? ''} onChange={(e) => void update(c.id, { explorer_zone: e.target.value || null })}>{ZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              <td className="px-3 py-2"><input type="checkbox" aria-label={`${c.name} visible to users`} checked={c.is_active} onChange={(e) => void update(c.id, { is_active: e.target.checked })} /></td>
            </tr>))}</tbody></table></div>)}
    </div>
  )
}
