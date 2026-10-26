export const MAX_ROWS = 20000
export const BATCH_SIZE = 200

export interface ImportRow {
  line: number; product_code: string; name: string; category: string; brand: string; description: string
  material: string; pitch_mm: string; width_mm: string; thickness_mm: string; colour: string; application: string
  source_page: string; drawing_ref: string; specs: Record<string, string>
}
export interface Issue { line: number; code: string; message: string }

export const normaliseCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
const ALIAS: Record<string, string> = { code: 'product_code', 'part number': 'product_code', part_number: 'product_code', category_name: 'category' }
const TEXT = ['category', 'brand', 'description', 'material', 'colour', 'application', 'drawing_ref'] as const
const NUMERIC = ['pitch_mm', 'width_mm', 'thickness_mm'] as const

function normaliseHeaders(raw: Record<string, unknown>): { fields: Record<string, string>; specs: Record<string, string> } {
  const fields: Record<string, string> = {}
  const specs: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) {
    const val = v === null || v === undefined ? '' : String(v).trim()
    const key = k.trim()
    if (key.toLowerCase().startsWith('spec:')) { const sk = key.slice(5).trim(); if (sk && val) specs[sk] = val; continue }
    const lower = key.toLowerCase()
    fields[ALIAS[lower] ?? lower] = val
  }
  return { fields, specs }
}

/** Validates rows in the browser for a fast preview. The database validates again on import. */
export function validateRows(rows: Record<string, unknown>[]): { valid: ImportRow[]; issues: Issue[] } {
  const valid: ImportRow[] = []
  const issues: Issue[] = []
  const seen = new Map<string, number>()
  rows.forEach((raw, i) => {
    const line = i + 2 // line 1 is the header
    const { fields: f, specs } = normaliseHeaders(raw)
    const bad = (message: string) => { issues.push({ line, code: f.product_code ?? '', message }) }
    if (!f.product_code) return bad('Product code is missing')
    if (f.product_code.length > 120) return bad('Product code is longer than 120 characters')
    if (!f.name) return bad('Name is missing')
    if (f.name.length > 300) return bad('Name is longer than 300 characters')
    for (const n of NUMERIC) if (f[n] && !/^\d+(\.\d+)?$/.test(f[n])) return bad(`${n} must be a plain number (for example 25.4)`)
    if (f.source_page && !/^\d{1,6}$/.test(f.source_page)) return bad('source_page must be a whole number')
    if (f.source_page && Number(f.source_page) < 1) return bad('source_page must be 1 or higher')
    for (const [k, v] of Object.entries(specs)) if (k.length > 100 || v.length > 500) return bad(`Specification "${k.slice(0, 20)}" is too long`)
    const norm = normaliseCode(f.product_code)
    if (!norm) return bad('Product code has no letters or digits')
    const first = seen.get(norm)
    if (first !== undefined) return bad(`Duplicate of line ${first} in this file; skipped`)
    seen.set(norm, line)
    const row = { line, product_code: f.product_code, name: f.name, specs } as ImportRow
    for (const t of TEXT) row[t] = f[t] ?? ''
    for (const n of NUMERIC) row[n] = f[n] ?? ''
    row.source_page = f.source_page ?? ''
    valid.push(row)
  })
  return { valid, issues }
}

export function chunk<T>(items: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function issuesToCsv(issues: Issue[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  return ['line,product_code,message', ...issues.map((i) => [i.line, esc(i.code), esc(i.message)].join(','))].join('\n')
}
