import { supabase } from './supabase'

/** Deletes products, then the image and document files stored for them. */
export async function deleteProducts(ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50)
    const [im, dc] = await Promise.all([
      supabase.from('product_images').select('storage_path').in('product_id', chunk),
      supabase.from('technical_documents').select('storage_path').in('product_id', chunk),
    ])
    const imgs = (im.data ?? []).map((r) => r.storage_path as string)
    const docs = (dc.data ?? []).map((r) => r.storage_path as string)
    const { error } = await supabase.from('products').delete().in('id', chunk)
    if (error) throw new Error(error.message)
    if (imgs.length) await supabase.storage.from('product-images').remove(imgs)
    if (docs.length) await supabase.storage.from('technical-documents').remove(docs)
  }
}
