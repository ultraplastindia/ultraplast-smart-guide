import { useState } from 'react'
import Papa from 'papaparse'
import readXlsxFile from 'read-excel-file'
import { supabase } from '../lib/supabase'
import { BATCH_SIZE, MAX_ROWS, chunk, issuesToCsv, validateRows, type ImportRow, type Issue } from '../lib/importer'

interface Summary { imported: number; skipped: number; failed: number; issues: Issue[] }

async function readRows(file: File): Promise<Record<string, unknown>[]> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const res = Papa.parse<Record<string, string>>(await file.text(), { header: true, skipEmptyLines: true })
    return res.data
  }
  const [head, ...rest] = await readXlsxFile(file)
  const keys = (head ?? []).map((c) => String(c ?? '').trim())
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])))
}

export default function AdminImport() {
  const [file, setFile] = useState<File | null>(null)
  const [valid, setValid] = useState<ImportRow[]>([])
  const [issues, setIssues] = useState<Issue[]>([])
  const [catalogue, setCatalogue] = useState('')
  const [createCats, setCreateCats] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [progress, setProgress] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const pick = async (f: File | null) => {
    setSummary(null); setErr(''); setValid([]); setIssues([]); setConfirm(false); setFile(f)
    if (!f) return
    if (!/\.(csv|xlsx)$/i.test(f.name)) return setErr('Choose a .csv or .xlsx file.')
    if (f.size > 20 * 1024 * 1024) return setErr('File is larger than 20 MB. Split it into smaller files.')
    try {
      const rows = await readRows(f)
      if (rows.length === 0) return setErr('The file has no data rows.')
      if (rows.length > MAX_ROWS) return setErr(`The file has more than ${MAX_ROWS} rows. Split it first.`)
      const r = validateRows(rows)
      setValid(r.valid); setIssues(r.issues)
    } catch (e) { setErr(`Could not read the file: ${(e as Error).message}`) }
  }

  const run = async () => {
    setBusy(true); setErr(''); setSummary(null)
    const total = { imported: 0, skipped: 0, failed: 0 }
    const serverIssues: Issue[] = []
    try {
      const job = await supabase.rpc('start_import_job', { p_filename: file!.name, p_catalogue_name: catalogue.trim(), p_total: valid.length })
      if (job.error) throw new Error(job.error.message)
      const batches = chunk(valid, BATCH_SIZE)
      for (let i = 0; i < batches.length; i++) {
        setProgress(`Importing batch ${i + 1} of ${batches.length}…`)
        const res = await supabase.rpc('import_products_batch', { p_job: job.data, p_rows: batches[i], p_create_categories: createCats })
        if (res.error) throw new Error(res.error.message)
        const d = res.data as { imported: number; skipped: number; failed: number; errors: { line: number; code: string; message: string }[] }
        total.imported += d.imported; total.skipped += d.skipped; total.failed += d.failed
        serverIssues.push(...d.errors)
      }
      const fin = await supabase.rpc('finish_import_job', { p_job: job.data })
      if (fin.error) throw new Error(fin.error.message)
      setSummary({ ...total, issues: [...issues, ...serverIssues] })
    } catch (e) {
      setErr(`${(e as Error).message}. Batches already sent stay imported; re-running skips them as duplicates.`)
    } finally { setBusy(false); setProgress('') }
  }

  const download = (list: Issue[]) => {
    const url = URL.createObjectURL(new Blob([issuesToCsv(list)], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'import-errors.csv'; a.click(); URL.revokeObjectURL(url)
  }
  const field = 'border border-steel-300 px-3 py-2 bg-white'
  const ready = valid.length > 0 && catalogue.trim().length > 0 && confirm && !busy

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Import products</h1>
      <p className="text-sm text-steel-600">Upload a CSV or Excel file. Columns: product_code, name, category, brand, description, material, pitch_mm, width_mm, thickness_mm, colour, application, source_page, drawing_ref, and any number of <code>spec:Name</code> columns. Existing products are never overwritten.</p>
      <div><label htmlFor="f" className="block text-sm font-medium">File</label>
        <input id="f" type="file" accept=".csv,.xlsx" onChange={(e) => void pick(e.target.files?.[0] ?? null)} /></div>
      {err && <p role="alert" className="text-red-700 text-sm">{err}</p>}

      {file && !err && (<>
        <section aria-labelledby="pv" className="space-y-2">
          <h2 id="pv" className="font-semibold">Preview</h2>
          <p className="text-sm" aria-live="polite">{valid.length} valid rows, {issues.length} with problems.</p>
          {valid.length > 0 && (
            <div className="overflow-x-auto border border-steel-300 bg-white"><table className="w-full text-sm"><thead className="bg-steel-100 text-left"><tr>
              {['Line', 'Code', 'Name', 'Category', 'Page', 'Specs'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead><tbody>
              {valid.slice(0, 15).map((r) => <tr key={r.line} className="border-t border-steel-300"><td className="px-3 py-1">{r.line}</td><td className="px-3 py-1 font-mono">{r.product_code}</td><td className="px-3 py-1">{r.name}</td><td className="px-3 py-1">{r.category || 'Not available'}</td><td className="px-3 py-1">{r.source_page || 'Not available'}</td><td className="px-3 py-1">{Object.keys(r.specs).length}</td></tr>)}
            </tbody></table></div>)}
          {issues.length > 0 && (<>
            <h3 className="font-medium text-red-800">Problems (these rows will not be imported)</h3>
            <ul className="text-sm max-h-48 overflow-auto border border-steel-300 bg-white divide-y divide-steel-300">
              {issues.slice(0, 100).map((i, n) => <li key={n} className="px-3 py-1">Line {i.line}{i.code ? ` (${i.code})` : ''}: {i.message}</li>)}
            </ul>
            <button className="underline text-sm" onClick={() => download(issues)}>Download problem list</button></>)}
        </section>

        <section aria-labelledby="cf" className="space-y-3">
          <h2 id="cf" className="font-semibold">Confirm</h2>
          <div><label htmlFor="cn" className="block text-sm font-medium">Catalogue name and edition</label>
            <input id="cn" className={`${field} w-full max-w-md`} value={catalogue} onChange={(e) => setCatalogue(e.target.value)} maxLength={200} /></div>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={createCats} onChange={(e) => setCreateCats(e.target.checked)} /> Create categories that do not exist yet</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> I understand every imported record is saved as an unverified draft and must be reviewed against its source page.</label>
          <button disabled={!ready} onClick={() => void run()} className="bg-belt-700 text-white px-5 py-2 disabled:opacity-50">Import {valid.length} products</button>
          {progress && <p role="status" className="text-sm text-steel-600">{progress}</p>}
        </section>
      </>)}

      {summary && (
        <section aria-labelledby="sm" className="border border-steel-300 bg-white p-4 space-y-2">
          <h2 id="sm" className="font-semibold">Import finished</h2>
          <p className="text-sm">{summary.imported} imported as drafts, {summary.skipped} skipped as duplicates, {summary.failed} failed on the server, {issues.length} rejected before sending.</p>
          {summary.issues.length > 0 && <button className="underline text-sm" onClick={() => download(summary.issues)}>Download error report</button>}
          <p className="text-sm">Next: open the review queue to verify and publish products.</p>
        </section>)}
    </div>
  )
}
