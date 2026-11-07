export const NA = 'Not available'
export const PAGE_SIZE = 24
export type Sort = 'name' | 'code' | 'category'

export function show(v: string | number | null | undefined): string {
  return v === null || v === undefined || String(v).trim() === '' ? NA : String(v)
}

const NUM = /^\d+(\.\d+)?$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export interface CatalogueParams { q: string; category: string; brand: string; material: string; sort: Sort; page: number; pitch: string; width: string; thickness: string }

export function parseParams(sp: URLSearchParams): CatalogueParams {
  const sort = sp.get('sort')
  const page = Number.parseInt(sp.get('page') ?? '1', 10)
  const cat = sp.get('category') ?? ''
  return {
    q: (sp.get('q') ?? '').slice(0, 100),
    category: UUID.test(cat) ? cat : '',
    brand: sp.get('brand') ?? '',
    material: sp.get('material') ?? '',
    sort: sort === 'code' || sort === 'category' ? sort : 'name',
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pitch: NUM.test(sp.get('pitch') ?? '') ? (sp.get('pitch') as string) : '',
    width: NUM.test(sp.get('width') ?? '') ? (sp.get('width') as string) : '',
    thickness: NUM.test(sp.get('thickness') ?? '') ? (sp.get('thickness') as string) : '',
  }
}

export function toRpcArgs(p: CatalogueParams) {
  return {
    p_q: p.q.trim() || null, p_category: p.category || null, p_brand: p.brand || null,
    p_material: p.material || null, p_sort: p.sort, p_limit: PAGE_SIZE, p_offset: (p.page - 1) * PAGE_SIZE,
    // sent only when set, so searching still works before the 0011 database script is applied
    ...(p.pitch ? { p_pitch: Number(p.pitch) } : {}), ...(p.width ? { p_width: Number(p.width) } : {}), ...(p.thickness ? { p_thickness: Number(p.thickness) } : {}),
  }
}

export const pageCount = (total: number) => Math.max(1, Math.ceil(total / PAGE_SIZE))

// ---- Smart Guide viewer: page sequence and page codes ----
export interface GuidePage { kind: 'index' | 'category' | 'product'; id: string; code: string; title: string; categoryId?: string }
export interface GuideCat { id: string; name: string }
export interface GuideProd { id: string; code: string; name: string; categoryId: string | null }

export const categoryCode = (i: number) => `C${String(i + 1).padStart(2, '0')}`

/** Book order: General index, then each category followed by its products (one page per product). */
export function buildPages(cats: GuideCat[], prods: GuideProd[]): GuidePage[] {
  const pages: GuidePage[] = [{ kind: 'index', id: '', code: 'INDEX', title: 'General index' }]
  const known = new Set(cats.map((c) => c.id))
  const byCat = new Map<string, GuideProd[]>()
  const other: GuideProd[] = []
  for (const p of prods) {
    if (p.categoryId && known.has(p.categoryId)) byCat.set(p.categoryId, [...(byCat.get(p.categoryId) ?? []), p])
    else other.push(p)
  }
  const byCode = (a: GuideProd, b: GuideProd) => a.code.localeCompare(b.code, undefined, { numeric: true })
  cats.forEach((c, i) => {
    pages.push({ kind: 'category', id: c.id, code: categoryCode(i), title: c.name })
    for (const p of [...(byCat.get(c.id) ?? [])].sort(byCode)) pages.push({ kind: 'product', id: p.id, code: p.code, title: p.name, categoryId: c.id })
  })
  if (other.length) {
    pages.push({ kind: 'category', id: 'other', code: 'C99', title: 'Other products' })
    for (const p of [...other].sort(byCode)) pages.push({ kind: 'product', id: p.id, code: p.code, title: p.name, categoryId: 'other' })
  }
  return pages
}

export function findPage(pages: GuidePage[], kind: string | undefined, id: string | undefined): number {
  if (!kind || !id) return 0
  const k = kind === 'c' ? 'category' : kind === 'p' ? 'product' : ''
  return pages.findIndex((p) => p.kind === k && p.id === id)
}

export function pageIndexByCode(pages: GuidePage[], input: string): number {
  const t = input.trim()
  if (!t) return -1
  if (/^(index|home|general index)$/i.test(t)) return 0
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return pages.findIndex((p) => norm(p.code) === norm(t))
}

export const guideUrl = (p: GuidePage) => (p.kind === 'index' ? '/guide' : `/guide/${p.kind === 'category' ? 'c' : 'p'}/${p.id}`)

// ---- Email settings and sign-in codes ----
export const isEmail = (s: string) => s.length <= 254 && /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(s)

/** A one-time code from the email: digits only, 6 to 10 long (Supabase default is 6). */
export const isOtpCode = (s: string) => /^\d{6,10}$/.test(s.trim())

/** Splits what an admin typed (commas, semicolons, spaces or new lines) into unique lowercase addresses, in order. */
export function parseEmailList(text: string): string[] {
  const seen = new Set<string>()
  for (const part of text.split(/[\s,;]+/)) {
    const e = part.trim().toLowerCase()
    if (e) seen.add(e)
  }
  return [...seen]
}

export interface MailLogRow {
  id: number; kind: string; to_email: string; subject: string | null; reference: string | null; created_at: string
  error: string | null; status_code: number | null; timed_out: boolean | null; net_error: string | null; response: string | null
}

function providerMessage(raw: string | null): string {
  if (!raw) return ''
  try {
    const j = JSON.parse(raw) as { message?: unknown; error?: unknown }
    const m = j.message ?? j.error
    return typeof m === 'string' ? m.slice(0, 200) : ''
  } catch { return raw.slice(0, 120) }
}

/** Plain-language outcome of one logged email. The mail service answers a few seconds after the email is queued. */
export function mailResult(r: MailLogRow, now: number = Date.now()): { label: string; tone: 'ok' | 'bad' | 'wait' } {
  if (r.error) return { label: r.error, tone: 'bad' }
  if (r.status_code !== null && r.status_code >= 200 && r.status_code < 300) return { label: 'Accepted by the mail service', tone: 'ok' }
  if (r.status_code !== null) return { label: `Rejected (${r.status_code}): ${providerMessage(r.response) || 'see your mail service dashboard'}`, tone: 'bad' }
  if (r.timed_out || r.net_error) return { label: `Could not reach the mail service: ${r.net_error || 'timed out'}`, tone: 'bad' }
  const minutes = (now - new Date(r.created_at).getTime()) / 60000
  return minutes > 360 ? { label: 'No result recorded (older than 6 hours)', tone: 'wait' } : { label: 'Sending…', tone: 'wait' }
}
