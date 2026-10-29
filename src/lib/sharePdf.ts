import type { jsPDF } from 'jspdf'
import { supabase } from './supabase'
import { loadLogo } from './exportBom'
import { fileStem, na } from './bom'
import type { Shared, SharedProduct } from './share'

const COMPANY = 'Ultraplast Chainbelts Pvt. Ltd.'
const SITE = 'https://www.ultraplastindia.com/'
const COLS = 'id,product_code,name,brand,material,pitch_mm,width_mm,thickness_mm,colour,application,description,source_page,verification_status,product_specifications(spec_key,spec_value,unit)'

interface Row {
  id: string; product_code: string; name: string; brand: string | null; material: string | null; pitch_mm: number | null; width_mm: number | null
  thickness_mm: number | null; colour: string | null; application: string | null; description: string | null; source_page: number | null
  verification_status: string; product_specifications: { spec_key: string; spec_value: string; unit: string | null }[]
}
const specText = (r: Row) => r.product_specifications.map((s) => `${s.spec_key}: ${s.spec_value}${s.unit ? ` ${s.unit}` : ''}`).join('; ')
const status = (r: Row) => (r.verification_status === 'verified' ? 'Verified' : 'Not verified')

async function drawHeader(doc: jsPDF, title: string, subtitle: string): Promise<number> {
  const logo = await loadLogo()
  let x = 14
  if (logo) {
    const p = doc.getImageProperties(logo)
    doc.addImage(logo, 'PNG', 14, 8, (12 * p.width) / p.height, 12)
    x = 14 + (12 * p.width) / p.height + 6
  }
  doc.setFontSize(15).text(COMPANY, x, 14)
  doc.setFontSize(9).textWithLink(SITE, x, 19, { url: SITE })
  doc.setFontSize(13).text(title, 14, 30)
  doc.setFontSize(9).text(subtitle, 14, 36)
  return 40
}

function drawFooter(doc: jsPDF, unverified: boolean) {
  const pages = doc.getNumberOfPages()
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i).setFontSize(8)
    if (unverified) doc.text('Data marked "Not verified" has not been checked against the original catalogue.', 14, h - 8)
    doc.text(`${COMPANY}  |  Page ${i} of ${pages}`, w - 14, h - 8, { align: 'right' })
  }
}

export async function exportCategoryPdf(categoryId: string, categoryName: string) {
  const rows: Row[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('product_category_links').select(`products(${COLS})`).eq('category_id', categoryId).range(from, from + 499)
    if (error) throw new Error(error.message)
    const list = (data ?? []) as unknown as { products: Row | null }[]
    for (const r of list) if (r.products) rows.push(r.products)
    if (list.length < 500) break
  }
  if (rows.length === 0) throw new Error('This category has no products you can export.')
  rows.sort((a, b) => a.product_code.localeCompare(b.product_code))
  const [{ jsPDF: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const startY = await drawHeader(doc, `Category: ${categoryName}`, `${rows.length} products  |  ${new Date().toLocaleDateString()}`)
  autoTable(doc, {
    startY, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.3 }, headStyles: { fillColor: [23, 32, 42] },
    head: [['#', 'Product code', 'Name', 'Brand', 'Material', 'Pitch (mm)', 'Width (mm)', 'Thickness (mm)', 'Cat. page', 'Data status', 'Specifications']],
    body: rows.map((r, i) => [i + 1, r.product_code, r.name, na(r.brand), na(r.material), na(r.pitch_mm), na(r.width_mm), na(r.thickness_mm), na(r.source_page), status(r), specText(r) || na(null)]),
    columnStyles: { 10: { cellWidth: 70 } },
  })
  drawFooter(doc, rows.some((r) => r.verification_status !== 'verified'))
  doc.save(`${fileStem('Ultraplast', categoryName)}.pdf`)
}

async function firstImage(productId: string): Promise<{ data: string; format: string } | null> {
  try {
    const im = await supabase.from('product_images').select('storage_path').eq('product_id', productId).order('sort_order').limit(1).maybeSingle()
    if (!im.data) return null
    const signed = await supabase.storage.from('product-images').createSignedUrl(im.data.storage_path as string, 60)
    if (!signed.data) return null
    const blob = await (await fetch(signed.data.signedUrl)).blob()
    const data = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error('read')); r.readAsDataURL(blob) })
    return { data, format: blob.type === 'image/png' ? 'PNG' : blob.type === 'image/webp' ? 'WEBP' : 'JPEG' }
  } catch { return null }
}

export async function exportProductPdf(productId: string) {
  const { data, error } = await supabase.from('products')
    .select(`${COLS},product_category_links(product_categories(name)),catalogues(name,edition)`).eq('id', productId).maybeSingle()
  if (error || !data) throw new Error(error?.message ?? 'Product not found.')
  const r = data as unknown as Row & { product_category_links: { product_categories: { name: string } | null }[]; catalogues: { name: string; edition: string | null } | null }
  const cats = r.product_category_links.map((l) => l.product_categories?.name).filter(Boolean).join(', ')
  const [{ jsPDF: JsPDF }, { default: autoTable }, img] = await Promise.all([import('jspdf'), import('jspdf-autotable'), firstImage(productId)])
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = await drawHeader(doc, r.name, `Product code: ${r.product_code}  |  ${new Date().toLocaleDateString()}`)
  if (img) {
    try {
      const p = doc.getImageProperties(img.data)
      const scale = Math.min(80 / p.width, 55 / p.height)
      doc.addImage(img.data, img.format, 14, y, p.width * scale, p.height * scale)
      y += p.height * scale + 4
    } catch { /* unsupported image: continue without it */ }
  }
  autoTable(doc, {
    startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 1.8 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45, fillColor: [232, 236, 239] } },
    body: [['Product code', r.product_code], ['Categories', na(cats)], ['Brand', na(r.brand)], ['Material', na(r.material)],
      ['Pitch', r.pitch_mm === null ? na(null) : `${r.pitch_mm} mm`], ['Width', r.width_mm === null ? na(null) : `${r.width_mm} mm`],
      ['Thickness', r.thickness_mm === null ? na(null) : `${r.thickness_mm} mm`], ['Colour', na(r.colour)], ['Application', na(r.application)],
      ['Description', na(r.description)], ['Catalogue', r.catalogues ? `${r.catalogues.name}${r.catalogues.edition ? ` (${r.catalogues.edition})` : ''}` : na(null)],
      ['Catalogue page', na(r.source_page)], ['Data status', status(r)]],
  })
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  if (r.product_specifications.length) {
    autoTable(doc, {
      startY: finalY + 6, theme: 'grid', styles: { fontSize: 9, cellPadding: 1.8 }, headStyles: { fillColor: [23, 32, 42] },
      head: [['Specification', 'Value']], body: r.product_specifications.map((s) => [s.spec_key, `${s.spec_value}${s.unit ? ` ${s.unit}` : ''}`]),
    })
  }
  drawFooter(doc, r.verification_status !== 'verified')
  doc.save(`${fileStem('Ultraplast', r.product_code)}.pdf`)
}

async function urlToImage(url: string): Promise<{ data: string; format: string } | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const data = await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(new Error('read')); r.readAsDataURL(blob) })
    return { data, format: blob.type === 'image/png' ? 'PNG' : blob.type === 'image/webp' ? 'WEBP' : 'JPEG' }
  } catch { return null }
}
const sSpecs = (p: SharedProduct) => p.specs.map((s) => `${s.key}: ${s.value}${s.unit ? ` ${s.unit}` : ''}`).join('; ')
const mm = (v: number | null) => (v === null ? na(null) : `${v} mm`)

/** PDF for the public customer page. Uses only the customer-safe data returned by get_shared. */
export async function exportSharedPdf(d: Shared, urls: Map<string, string>) {
  const [{ jsPDF: JsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  if (d.kind === 'category') {
    const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const startY = await drawHeader(doc, d.name, `${d.products.length} products  |  ${new Date().toLocaleDateString()}`)
    autoTable(doc, {
      startY, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.3 }, headStyles: { fillColor: [23, 32, 42] },
      head: [['#', 'Product code', 'Name', 'Brand', 'Material', 'Pitch (mm)', 'Width (mm)', 'Thickness (mm)', 'Specifications']],
      body: d.products.map((p, i) => [i + 1, p.product_code, p.name, na(p.brand), na(p.material), na(p.pitch_mm), na(p.width_mm), na(p.thickness_mm), sSpecs(p) || na(null)]),
      columnStyles: { 8: { cellWidth: 80 } },
    })
    drawFooter(doc, d.products.some((p) => !p.verified))
    doc.save(`${fileStem('Ultraplast', d.name)}.pdf`)
    return
  }
  const p = d.product
  const first = p.images[0] ? urls.get(p.images[0].path) : undefined
  const img = first ? await urlToImage(first) : null
  const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  let y = await drawHeader(doc, p.name, `Product code: ${p.product_code}  |  ${new Date().toLocaleDateString()}`)
  if (img) {
    try {
      const pr = doc.getImageProperties(img.data)
      const scale = Math.min(80 / pr.width, 55 / pr.height)
      doc.addImage(img.data, img.format, 14, y, pr.width * scale, pr.height * scale)
      y += pr.height * scale + 4
    } catch { /* unsupported image: continue without it */ }
  }
  autoTable(doc, {
    startY: y, theme: 'grid', styles: { fontSize: 9, cellPadding: 1.8 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45, fillColor: [232, 236, 239] } },
    body: [['Product code', p.product_code], ['Categories', na(p.categories.join(', '))], ['Brand', na(p.brand)], ['Material', na(p.material)],
      ['Pitch', mm(p.pitch_mm)], ['Width', mm(p.width_mm)], ['Thickness', mm(p.thickness_mm)], ['Colour', na(p.colour)], ['Application', na(p.application)], ['Description', na(p.description)]],
  })
  if (p.specs.length) {
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
    autoTable(doc, {
      startY: finalY + 6, theme: 'grid', styles: { fontSize: 9, cellPadding: 1.8 }, headStyles: { fillColor: [23, 32, 42] },
      head: [['Specification', 'Value']], body: p.specs.map((s) => [s.key, `${s.value}${s.unit ? ` ${s.unit}` : ''}`]),
    })
  }
  drawFooter(doc, !p.verified)
  doc.save(`${fileStem('Ultraplast', p.product_code)}.pdf`)
}
