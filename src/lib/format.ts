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
