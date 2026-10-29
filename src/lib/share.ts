import { supabase } from './supabase'

export interface SharedProduct {
  id: string; product_code: string; name: string; brand: string | null; description: string | null; material: string | null
  pitch_mm: number | null; width_mm: number | null; thickness_mm: number | null; colour: string | null; application: string | null
  verified: boolean; categories: string[]; specs: { key: string; value: string; unit: string | null }[]; images: { path: string; caption: string | null }[]
}
export type Shared =
  | { kind: 'product'; product: SharedProduct }
  | { kind: 'category'; name: string; description: string | null; products: SharedProduct[] }

export const EXPIRY: [number, string][] = [[7, '7 days'], [30, '30 days'], [90, '90 days'], [0, 'No expiry']]
export const linkFor = (token: string) => `${window.location.origin}/share/${token}`

export async function createCustomerLink(kind: 'product' | 'category', id: string, days: number): Promise<string> {
  const { data, error } = await supabase.rpc('create_share_link', { p_kind: kind, p_target: id, p_days: days || null })
  if (error) throw new Error(error.message)
  return linkFor(data as string)
}

export async function getShared(token: string): Promise<Shared | null> {
  const { data, error } = await supabase.rpc('get_shared', { p_token: token })
  if (error) throw new Error(error.message)
  return (data ?? null) as Shared | null
}

export async function signImages(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(paths)]
  if (uniq.length === 0) return out
  const { data } = await supabase.storage.from('product-images').createSignedUrls(uniq, 3600)
  for (const u of data ?? []) if (u.signedUrl && u.path) out.set(u.path, u.signedUrl)
  return out
}
