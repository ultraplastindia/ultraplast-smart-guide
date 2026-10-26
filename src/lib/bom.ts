export const NA = 'Not available'
export interface BomItemExport {
  product_id: string | null; product_code: string; name: string; category: string | null; quantity: number; notes: string | null
  material: string | null; pitch_mm: number | null; width_mm: number | null; thickness_mm: number | null; brand: string | null
  source_page: number | null; verification_status: string | null; specs: { key: string; value: string; unit: string | null }[]
}
export interface BomExport {
  generated_at: string
  bom: { id: string; reference: string; name: string; project: string | null; notes: string | null; created_at: string }
  items: BomItemExport[]
}

export const na = (v: string | number | null | undefined) => (v === null || v === undefined || String(v).trim() === '' ? NA : String(v))
export const UNCATEGORISED = 'Uncategorised'

export function groupByCategory<T extends { category: string | null; product_code: string }>(items: T[]): { category: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const k = it.category?.trim() || UNCATEGORISED
    map.set(k, [...(map.get(k) ?? []), it])
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === UNCATEGORISED ? 1 : b === UNCATEGORISED ? -1 : a.localeCompare(b)))
    .map(([category, list]) => ({ category, items: [...list].sort((x, y) => x.product_code.localeCompare(y.product_code)) }))
}

export const totalQuantity = (items: { quantity: number }[]) => items.reduce((n, i) => n + i.quantity, 0)

export function fileStem(reference: string, name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${reference}${slug ? `-${slug}` : ''}`.slice(0, 80)
}

export const hasUnverified = (items: { verification_status: string | null }[]) => items.some((i) => i.verification_status !== 'verified')

export const specText = (specs: BomItemExport['specs']) => specs.map((s) => `${s.key}: ${s.value}${s.unit ? ` ${s.unit}` : ''}`).join('; ')
