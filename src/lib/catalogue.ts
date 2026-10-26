import { supabase } from './supabase'
import { toRpcArgs, type CatalogueParams } from './format'

export interface ProductRow {
  id: string; product_code: string; name: string; category_id: string | null; category_name: string | null
  brand: string | null; material: string | null; verification_status: string; source_page: number | null; catalogue_id: string | null
}
export interface Facets {
  brands: { value: string; count: number }[]
  materials: { value: string; count: number }[]
  categories: { value: string; name: string; count: number }[]
}
export interface Category { id: string; slug: string; name: string; description: string | null; explorer_zone: string | null }

export async function searchProducts(p: CatalogueParams) {
  const { data, error } = await supabase.rpc('search_products', toRpcArgs(p))
  if (error) throw new Error(error.message)
  return data as { total: number; items: ProductRow[] }
}

export async function getFacets() {
  const { data, error } = await supabase.rpc('catalogue_facets')
  if (error) throw new Error(error.message)
  return data as Facets
}

export async function listCategories(zone?: string) {
  let q = supabase.from('product_categories').select('id,slug,name,description,explorer_zone').eq('is_active', true).order('sort_order').order('name')
  if (zone) q = q.eq('explorer_zone', zone)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as Category[]
}

export async function recentProducts(limit = 6) {
  const { data, error } = await supabase.from('products').select('id,product_code,name').eq('status', 'active').order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error(error.message)
  return data as { id: string; product_code: string; name: string }[]
}

/** Opens a private document through a 60-second signed link. Storage policies re-check access. */
export async function openDocument(bucket: 'technical-documents' | 'product-images', path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
  if (error || !data) throw new Error(error?.message ?? 'Could not create a download link')
  window.open(data.signedUrl, '_blank', 'noopener')
}

/** Signed link to the catalogue page image, or null when no image was uploaded for that page. */
export async function pagePreviewUrl(page: number | null): Promise<string | null> {
  if (!page) return null
  const { data, error } = await supabase.storage.from('page-previews').createSignedUrl(`page-${String(page).padStart(4, '0')}.jpg`, 300)
  return error || !data ? null : data.signedUrl
}
