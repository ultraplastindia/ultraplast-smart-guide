import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface Obj { name: string; created_at: string | null; metadata: { size?: number } | null }
const mb = (n?: number) => (n ? `${(n / 1048576).toFixed(1)} MB` : 'Not available')

export default function AdminFiles() {
  const [files, setFiles] = useState<Obj[] | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const { data, error } = await supabase.storage.from('catalogues').list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } })
    if (error) setMsg({ ok: false, text: error.message }); else { setFiles(data as unknown as Obj[]); setPicked(new Set()) }
  }, [])
  useEffect(() => { void load() }, [load])

  const upload = async (file: File | null) => {
    if (!file) return
    setMsg(null)
    if (!/\.pdf$/i.test(file.name)) return setMsg({ ok: false, text: 'Choose a PDF file.' })
    setBusy(true)
    const path = `${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`
    const { error } = await supabase.storage.from('catalogues').upload(path, file, { contentType: 'application/pdf', upsert: false })
    setBusy(false)
    setMsg(error ? { ok: false, text: `${error.message}. Large files may exceed your Supabase plan limit (50 MB on the free plan).` } : { ok: true, text: 'Uploaded.' })
    if (!error) await load()
  }
  const open = async (name: string) => {
    const { data, error } = await supabase.storage.from('catalogues').createSignedUrl(name, 60)
    if (error || !data) return setMsg({ ok: false, text: error?.message ?? 'Could not create a link.' })
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  const remove = async (names: string[]) => {
    if (names.length === 0) return setMsg({ ok: false, text: 'Select at least one file.' })
    if (!window.confirm(names.length === 1 ? 'Delete this file permanently?' : `Delete ${names.length} files permanently?`)) return
    const { error } = await supabase.storage.from('catalogues').remove(names)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${names.length} file(s) deleted.` })
    if (!error) await load()
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <p className="text-sm"><Link className="underline" to="/admin">Back to admin</Link></p>
      <h1 className="text-2xl font-bold">Catalogue PDF files</h1>
      <p className="text-sm text-steel-600">Private storage for full catalogue PDFs. Only administrators with import permission can see or download them. Customers never get access.</p>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
      <div><label htmlFor="cf" className="block text-sm font-medium">Upload a PDF</label><input id="cf" type="file" accept=".pdf" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0] ?? null); e.target.value = '' }} /></div>
      {files === null && !msg && <p role="status" className="text-steel-600">Loading…</p>}
      {files?.length === 0 && <p className="text-steel-600">No files yet.</p>}
      {files && files.length > 0 && (<div className="flex flex-wrap items-center gap-2 text-sm">
        <span aria-live="polite">{picked.size} selected</span>
        <button className="border border-steel-300 bg-white px-3 py-1 hover:bg-steel-100" onClick={() => setPicked(new Set(files.map((f) => f.name)))}>Select all</button>
        <button className="border border-steel-300 bg-white px-3 py-1 hover:bg-steel-100" onClick={() => setPicked(new Set())}>Clear</button>
        <button className="border border-steel-300 bg-white px-3 py-1 text-red-700 hover:bg-steel-100" onClick={() => void remove([...picked])}>Delete selected</button>
      </div>)}
      {files && files.length > 0 && (
        <ul className="divide-y divide-steel-300 border border-steel-300 bg-white">
          {files.map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <input type="checkbox" aria-label={`Select ${f.name}`} checked={picked.has(f.name)} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(f.name)) n.delete(f.name); else n.add(f.name); return n })} />
              <span className="truncate flex-1">{f.name.replace(/^\d+-/, '')} <span className="text-steel-600">({mb(f.metadata?.size)})</span></span>
              <span className="space-x-3 whitespace-nowrap"><button className="underline" onClick={() => void open(f.name)}>Download</button><button className="underline text-red-700" onClick={() => void remove([f.name])}>Delete</button></span>
            </li>))}
        </ul>)}
    </div>
  )
}
