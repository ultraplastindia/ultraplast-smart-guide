import { supabase } from './supabase'
import { LOGO_DATA_URL } from './logo'
import { fileStem, groupByCategory, hasUnverified, na, specText, totalQuantity, type BomExport } from './bom'

export async function fetchExport(bomId: string): Promise<BomExport> {
  const { data, error } = await supabase.rpc('export_bom_data', { p_bom: bomId })
  if (error) throw new Error(error.message)
  return data as BomExport
}

const dateText = (iso: string) => new Date(iso).toLocaleDateString()

export async function exportExcel(d: BomExport) {
  const { default: writeXlsxFile } = await import('write-excel-file')
  const bold = (value: string) => ({ value, fontWeight: 'bold' as const })
  const heads = ['Item', 'Product code', 'Description', 'Category', 'Qty', 'Material', 'Pitch (mm)', 'Width (mm)', 'Thickness (mm)', 'Catalogue page', 'Data status', 'Specifications', 'Notes']
  const rows: unknown[][] = [
    [bold('Ultraplast Chainbelts Pvt. Ltd.: Bill of Materials')],
    [bold('Reference'), { value: d.bom.reference }], [bold('Name'), { value: d.bom.name }],
    [bold('Project'), { value: na(d.bom.project) }], [bold('Date'), { value: dateText(d.generated_at) }],
    [],
    heads.map(bold),
  ]
  let n = 0
  for (const g of groupByCategory(d.items)) {
    rows.push([bold(g.category)])
    for (const i of g.items) {
      n += 1
      rows.push([{ value: n }, { value: i.product_code }, { value: i.name }, { value: g.category }, { value: i.quantity },
        { value: na(i.material) }, { value: na(i.pitch_mm) }, { value: na(i.width_mm) }, { value: na(i.thickness_mm) },
        { value: na(i.source_page) }, { value: i.verification_status === 'verified' ? 'Verified' : 'Not verified' },
        { value: specText(i.specs) || NA_TEXT }, { value: i.notes ?? '' }])
    }
  }
  rows.push([], [bold('Total quantity'), { value: totalQuantity(d.items) }])
  if (hasUnverified(d.items)) rows.push([{ value: 'Data marked "Not verified" has not been checked against the original catalogue.' }])
  const columns = [6, 22, 40, 24, 6, 14, 11, 11, 14, 14, 14, 50, 30].map((width) => ({ width }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await writeXlsxFile(rows as any, { columns, fileName: `${fileStem(d.bom.reference, d.bom.name)}.xlsx` })
}
const NA_TEXT = 'Not available'

export async function loadLogo(): Promise<string | null> {
  return LOGO_DATA_URL
}

export async function exportPdf(d: BomExport) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const logo = await loadLogo()
  let x = 14
  if (logo) {
    const p = doc.getImageProperties(logo)
    doc.addImage(logo, 'PNG', 14, 8, (12 * p.width) / p.height, 12)
    x = 14 + (12 * p.width) / p.height + 6
  }
  doc.setFontSize(15).text('Bill of Materials', x, 14)
  doc.setFontSize(9).text('Ultraplast Chainbelts Pvt. Ltd.', x, 19)
  doc.text(`Reference: ${d.bom.reference}    Name: ${d.bom.name}    Project: ${na(d.bom.project)}    Date: ${dateText(d.generated_at)}`, 14, 27)

  const body: unknown[][] = []
  let n = 0
  for (const g of groupByCategory(d.items)) {
    body.push([{ content: g.category, colSpan: 10, styles: { fontStyle: 'bold', fillColor: [232, 236, 239] } }])
    for (const i of g.items) {
      n += 1
      body.push([n, i.product_code, i.name, i.quantity, na(i.material), na(i.pitch_mm), na(i.width_mm), na(i.source_page),
        i.verification_status === 'verified' ? 'Verified' : 'Not verified', i.notes ?? ''])
    }
  }
  autoTable(doc, {
    startY: 31, theme: 'grid', styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [23, 32, 42] },
    head: [['#', 'Product code', 'Description', 'Qty', 'Material', 'Pitch (mm)', 'Width (mm)', 'Cat. page', 'Data status', 'Notes']],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: body as any, foot: [[{ content: `Total quantity: ${totalQuantity(d.items)}`, colSpan: 10 }]], footStyles: { fillColor: [232, 236, 239], textColor: 20 },
  })
  const pages = doc.getNumberOfPages()
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i).setFontSize(8)
    if (hasUnverified(d.items)) doc.text('Data marked "Not verified" has not been checked against the original catalogue.', 14, h - 8)
    doc.text(`${d.bom.reference}  |  Page ${i} of ${pages}`, w - 14, h - 8, { align: 'right' })
  }
  doc.save(`${fileStem(d.bom.reference, d.bom.name)}.pdf`)
}
