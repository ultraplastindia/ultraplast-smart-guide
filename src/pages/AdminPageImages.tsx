import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Status = 'ready' | 'invalid' | 'done' | 'exists' | 'failed'
interface Item { file: File; status: Status; note?: string }
const NAME = /^page-\d{4}\.jpg$/
const LABEL: Record<Status, string> = { ready: 'Ready', invalid: 'Not usable', done: 'Uploaded', exists: 'Already uploaded (skipped)', failed: 'Failed' }

export default function AdminPageImages() {
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')

  const pick = (list: FileList | null) => {
    const files = [...(list ?? [])].slice(0, 800)
    setItems(files.map((file): Item => NAME.test(file.name) && file.size <= 5 * 1024 * 1024 ? { file, status: 'ready' } : { file, status: 'invalid', note: 'Name must look like page-0300.jpg and the file must be under 5 MB.' }))
  }
  const run = async () => {
    setBusy(true)
    const todo = items.filter((i) => i.status === 'ready')
    const result = new Map<File, Item>()
    for (let i = 0; i < todo.length; i += 4) {
      setProgress(`Uploading ${Math.min(i + 4, todo.length)} of ${todo.length}…`)
      await Promise.all(todo.slice(i, i + 4).map(async (it) => {
        const { error } = await supabase.storage.from('page-previews').upload(it.file.name, it.file, { contentType: 'image/jpeg', upsert: false })
        result.set(it.file, error ? { ...it, status: /already exists|Duplicate/i.test(error.message) ? 'exists' : 'failed', note: error.message } : { ...it, status: 'done' })
      }))
    }
    setItems((cur) => cur.map((i) => result.get(i.file) ?? i)); setBusy(false); setProgress('')
  }
  const ready = items.filter((i) => i.status === 'ready').length
  return (
    <div className="space-y-5 max-w-4xl">
      <p className="text-sm"><Link className="underline" to="/admin">Back to admin</Link></p>
      <h1 className="text-2xl font-bold">Catalogue page images</h1>
      <p className="text-sm text-steel-600">Upload page pictures named by page number, such as <code>page-0300.jpg</code>. A product page then shows the picture of its catalogue page. JPG only, under 5 MB each. Upload only pages Ultraplast may republish. Files already uploaded are skipped.</p>
      <div><label htmlFor="pi" className="block text-sm font-medium">Choose images</label><input id="pi" type="file" multiple accept=".jpg" onChange={(e) => pick(e.target.files)} /></div>
      {items.length > 0 && (<>
        <p className="text-sm" aria-live="polite">{items.length} files, {ready} ready.</p>
        <button disabled={busy || ready === 0} onClick={() => void run()} className="bg-belt-700 text-white px-5 py-2 disabled:opacity-50">Upload {ready} images</button>
        {progress && <p role="status" className="text-sm text-steel-600">{progress}</p>}
        <div className="border border-steel-300 bg-white max-h-96 overflow-auto"><table className="w-full text-sm"><tbody>
          {items.map((i, n) => <tr key={n} className="border-t border-steel-300"><td className="px-3 py-1">{i.file.name}</td><td className={`px-3 py-1 ${i.status === 'done' ? 'text-green-800' : i.status === 'ready' || i.status === 'exists' ? '' : 'text-red-700'}`}>{LABEL[i.status]}{i.status !== 'done' && i.status !== 'ready' && i.note ? `: ${i.note}` : ''}</td></tr>)}
        </tbody></table></div></>)}
    </div>
  )
}
