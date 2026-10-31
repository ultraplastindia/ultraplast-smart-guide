export const NA = 'Not available'
export const PAGE_SIZE = 24
export type Sort = 'name' | 'code' | 'category'

export function show(v: string | number | null | undefined): string {
  return v === null || v === undefined || String(v).trim() === '' ? NA : String(v)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export interface CatalogueParams { q: string; category: string; brand: string; material: string; sort: Sort; page: number }

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
  }
}

export function toRpcArgs(p: CatalogueParams) {
  return {
    p_q: p.q.trim() || null, p_category: p.category || null, p_brand: p.brand || null,
    p_material: p.material || null, p_sort: p.sort, p_limit: PAGE_SIZE, p_offset: (p.page - 1) * PAGE_SIZE,
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
