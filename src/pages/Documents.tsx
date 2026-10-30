import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { openDocument } from '../lib/catalogue'

interface Doc { id: string; title: string; doc_type: string; storage_path: string; required_permission: string }
const TYPES = ['datasheet', 'drawing', 'cad', 'other'] as const
const EXT = /\.(pdf|dwg|dxf|step|stp|zip|png|jpg|jpeg)$/i
const MAX = 50 * 1024 * 1024

export default function Documents() {
  const { can } = useAuth()
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<(typeof TYPES)[number]>('datasheet')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('technical_documents').select('id,title,doc_type,storage_path,required_permission').order('created_at', { ascending: false })
    if (error) setMsg({ ok: false, text: error.message }); else setDocs(data as Doc[])
  }, [])
  useEffect(() => { void load() }, [load])

  const download = async (d: Doc) => {
    try { await openDocument('technical-documents', d.storage_path) } catch (e) { setMsg({ ok: false, text: (e as Error).message }) }
  }

  const remove = async (d: Doc) => {
    if (!window.confirm(`Delete "${d.title}" permanently?`)) return
    const r = await supabase.from('technical_documents').delete().eq('id', d.id)
    if (r.error) return setMsg({ ok: false, text: r.error.message })
    await supabase.storage.from('technical-documents').remove([d.storage_path])
    setMsg({ ok: true, text: 'Document deleted.' }); await load()
  }

  const upload = async (e: FormEvent) => {
    e.preventDefault(); setMsg(null)
    if (!file || !title.trim()) return setMsg({ ok: false, text: 'Choose a file and enter a title.' })
    if (!EXT.test(file.name)) return setMsg({ ok: false, text: 'Allowed types: PDF, DWG, DXF, STEP, ZIP, PNG, JPG.' })
    if (file.size > MAX) return setMsg({ ok: false, text: 'File is larger than 50 MB.' })
    setBusy(true)
    try {
      let productId: string | null = null
      if (code.trim()) {
        const p = await supabase.from('products').select('id').eq('product_code', code.trim()).limit(1).maybeSingle()
        if (!p.data) throw new Error('No product has that exact code. Leave it empty to upload without a link.')
        productId = p.data.id
      }
      const path = `${type}/${crypto.randomUUID()}-${file.name.replace(/[^A-Za-z0-9._-]/g, '_')}`
      const up = await supabase.storage.from('technical-documents').upload(path, file, { upsert: false })
      if (up.error) throw new Error(up.error.message)
      const ins = await supabase.from('technical_documents').insert({
        title: title.trim(), doc_type: type, storage_path: path, product_id: productId,
        required_permission: type === 'cad' ? 'download_cad' : 'download_documents',
      })
      if (ins.error) { await supabase.storage.from('technical-documents').remove([path]); throw new Error(ins.error.message) }
      setMsg({ ok: true, text: 'Document uploaded.' }); setFile(null); setTitle(''); setCode(''); await load()
    } catch (er) { setMsg({ ok: false, text: (er as Error).message }) } finally { setBusy(false) }
  }

  const field = 'border border-steel-300 px-3 py-2 bg-white'
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">CAD and technical documents</h1>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
      {docs === null && <p role="status" className="text-steel-600">Loading documents…</p>}
      {docs?.length === 0 && <p className="text-steel-600">No documents available to you yet. CAD files need the CAD download permission.</p>}
      {docs && docs.length > 0 && (
        <ul className="divide-y divide-steel-300 border border-steel-300 bg-white">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-3">
              <span>{d.title} <span className="text-sm text-steel-600">({d.doc_type})</span></span>
              <span className="space-x-2 whitespace-nowrap"><button onClick={() => void download(d)} className="border border-steel-300 px-3 py-1 hover:bg-steel-100">Download</button>{can('upload_documents') && <button onClick={() => void remove(d)} className="border border-steel-300 px-3 py-1 text-red-700 hover:bg-steel-100">Delete</button>}</span>
            </li>))}
        </ul>)}
      {can('upload_documents') && (
        <form onSubmit={upload} className="space-y-3 max-w-xl border border-steel-300 bg-white p-4">
          <h2 className="font-semibold">Upload a document</h2>
          <div><label htmlFor="df" className="block text-sm font-medium">File</label><input id="df" type="file" accept=".pdf,.dwg,.dxf,.step,.stp,.zip,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div><label htmlFor="dt" className="block text-sm font-medium">Title</label><input id="dt" className={`${field} w-full`} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label htmlFor="dy" className="block text-sm font-medium">Type</label>
            <select id="dy" className={field} value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label htmlFor="dc" className="block text-sm font-medium">Product code (optional)</label><input id="dc" className={`${field} w-full`} value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <button disabled={busy} className="bg-belt-700 text-white px-4 py-2 disabled:opacity-60">{busy ? 'Uploading…' : 'Upload'}</button>
        </form>)}
    </div>
  )
}
