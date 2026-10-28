import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { normaliseCode, parseImageName } from '../lib/importer'

type Status = 'ready' | 'nomatch' | 'ambiguous' | 'invalid' | 'done' | 'failed'
interface Item { file: File; index: number; status: Status; productId?: string; productCode?: string; note?: string }
const OK_EXT = /\.(png|jpe?g|webp)$/i
const MAX = 5 * 1024 * 1024
const LABEL: Record<Status, string> = { ready: 'Ready', nomatch: 'No product with this code', ambiguous: 'Several products share this code', invalid: 'Not usable', done: 'Uploaded', failed: 'Failed' }

export default function AdminImages() {
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [err, setErr] = useState('')

  const pick = async (list: FileList | null) => {
    setErr(''); setItems([])
    const files = [...(list ?? [])]
    if (files.length === 0) return
    if (files.length > 500) return setErr('Choose at most 500 images at a time.')
    const parsed = files.map((file) => {
      const name = parseImageName(file.name)
      const bad = !OK_EXT.test(file.name) ? 'Use PNG, JPG or WEBP.' : file.size > MAX ? 'Larger than 5 MB.' : !name ? 'The file name has no product code.' : ''
      return { file, name, bad }
    })
    const norms = [...new Set(parsed.filter((p) => !p.bad && p.name).map((p) => normaliseCode(p.name!.code)))]
    const found = new Map<string, { id: string; code: string }[]>()
    for (let i = 0; i < norms.length; i += 100) {
      const { data, error } = await supabase.from('products').select('id,product_code,code_normalised').in('code_normalised', norms.slice(i, i + 100))
      if (error) return setErr(error.message)
      for (const r of data as { id: string; product_code: string; code_normalised: string }[]) found.set(r.code_normalised, [...(found.get(r.code_normalised) ?? []), { id: r.id, code: r.product_code }])
    }
    setItems(parsed.map(({ file, name, bad }): Item => {
      if (bad || !name) return { file, index: 1, status: 'invalid', note: bad }
      const hits = found.get(normaliseCode(name.code)) ?? []
      if (hits.length === 0) return { file, index: name.index, status: 'nomatch' }
      if (hits.length > 1) return { file, index: name.index, status: 'ambiguous' }
      return { file, index: name.index, status: 'ready', productId: hits[0].id, productCode: hits[0].code }
    }))
  }

  const run = async () => {
    setBusy(true); setErr('')
    const todo = items.filter((i) => i.status === 'ready').sort((a, b) => (a.productId! + String(a.index).padStart(3, '0')).localeCompare(b.productId! + String(b.index).padStart(3, '0')))
    const ids = [...new Set(todo.map((i) => i.productId!))]
    const counts = new Map<string, number>()
    const existing = await supabase.from('product_images').select('product_id').in('product_id', ids)
    for (const r of (existing.data ?? []) as { product_id: string }[]) counts.set(r.product_id, (counts.get(r.product_id) ?? 0) + 1)
    const result = new Map<File, { status: Status; note?: string }>()
    let n = 0
    for (const it of todo) {
      n += 1; setProgress(`Uploading ${n} of ${todo.length}…`)
      const pid = it.productId!
      const order = counts.get(pid) ?? 0
      const path = `${pid}/${crypto.randomUUID()}-${it.file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`
      const up = await supabase.storage.from('product-images').upload(path, it.file, { contentType: it.file.type || 'image/jpeg', upsert: false })
      if (up.error) { result.set(it.file, { status: 'failed', note: up.error.message }); continue }
      const ins = await supabase.from('product_images').insert({ product_id: pid, storage_path: path, sort_order: order, is_primary: order === 0 })
      if (ins.error) { await supabase.storage.from('product-images').remove([path]); result.set(it.file, { status: 'failed', note: ins.error.message }); continue }
      counts.set(pid, order + 1); result.set(it.file, { status: 'done' })
    }
    setItems((cur) => cur.map((i) => (result.has(i.file) ? { ...i, ...result.get(i.file)! } : i)))
    setBusy(false); setProgress('')
  }

  const ready = items.filter((i) => i.status === 'ready').length
  const done = items.filter((i) => i.status === 'done').length
  return (
    <div className="space-y-5 max-w-4xl">
      <p className="text-sm"><Link className="underline" to="/admin">Back to admin</Link></p>
      <h1 className="text-2xl font-bold">Bulk image upload</h1>
      <p className="text-sm text-steel-600">Name each image after its product code: <code>CODE.jpg</code> for the first image, <code>CODE__2.jpg</code> for the second, and so on. Punctuation and spaces in the code do not matter when matching. The products must already exist (import them first). PNG, JPG or WEBP, up to 5 MB each, up to 500 files at a time.</p>
      <div><label htmlFor="bi" className="block text-sm font-medium">Choose images</label><input id="bi" type="file" multiple accept=".png,.jpg,.jpeg,.webp" onChange={(e) => void pick(e.target.files)} /></div>
      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}
      {items.length > 0 && (<>
        <p className="text-sm" aria-live="polite">{items.length} files: {ready} ready, {done} uploaded, {items.filter((i) => ['nomatch', 'ambiguous', 'invalid', 'failed'].includes(i.status)).length} need attention.</p>
        <button disabled={busy || ready === 0} onClick={() => void run()} className="bg-belt-700 text-white px-5 py-2 disabled:opacity-50">Upload {ready} images</button>
        {progress && <p role="status" className="text-sm text-steel-600">{progress}</p>}
        <div className="overflow-x-auto border border-steel-300 bg-white max-h-96 overflow-y-auto"><table className="w-full text-sm">
          <thead className="bg-steel-100 text-left sticky top-0"><tr>{['File', 'Product', 'Image no.', 'Result'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{items.map((i, n) => (
            <tr key={n} className="border-t border-steel-300"><td className="px-3 py-1">{i.file.name}</td><td className="px-3 py-1 font-mono">{i.productCode ?? 'Not available'}</td><td className="px-3 py-1">{i.index}</td>
              <td className={`px-3 py-1 ${i.status === 'done' ? 'text-green-800' : i.status === 'ready' ? '' : 'text-red-700'}`}>{LABEL[i.status]}{i.note ? `: ${i.note}` : ''}</td></tr>))}</tbody></table></div>
      </>)}
    </div>
  )
}
