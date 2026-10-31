import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

interface Item { q: string; a: ReactNode }
interface Section { id: string; title: string; intro: string; items: Item[] }

const EVERYONE: Section[] = [
  { id: 'start', title: 'Getting started', intro: 'Signing in, approval and finding your way around.', items: [
    { q: 'How do I get access?', a: <>Choose <b>Request access</b> on the sign-in page, enter your details and verify your email. An Ultraplast administrator then approves your account. Until then you see a waiting page. If you are not approved after a reasonable time, contact your administrator.</> },
    { q: 'What can each role do?', a: <><b>Approved user:</b> search and view products, compare, build and export BOMs, download documents allowed for the account. <b>Administrator:</b> also manages products, categories, files and imports, and can create customer links. <b>Super Admin:</b> also manages users and administrators.</> },
    { q: 'Where is everything?', a: <>The top menu has Home, Categories, Explorer, Catalogue, Compare, Documents, My BOM, Dashboard and Help. Profile and Sign out are at the top right. Administrators also see Admin.</> }] },
  { id: 'find', title: 'Finding products', intro: 'Search, filters and the conveyor explorer.', items: [
    { q: 'How do I search?', a: <>Open <Link className="underline" to="/catalogue">Catalogue</Link> and type a code, name or specification. Codes match without spaces or dashes, so 1001FT finds 1001-FT. Use the category list, and the Brand, Material and Sort options when they appear. <b>Clear filters</b> resets everything.</> },
    { q: 'What is the Explorer?', a: <>The <Link className="underline" to="/explorer">Explorer</Link> shows a conveyor. Click a part (for example Sprockets) to see its categories. The number beside each part is how many categories are linked to it. If a part shows none, an administrator has not linked categories to it yet.</> },
    { q: 'What does "Not yet verified" mean?', a: <>A person has not yet checked the record against the original catalogue. Check the catalogue page number shown before relying on a value. <b>Not available</b> means the data does not exist in the system. Nothing is estimated or invented.</> }] },
  { id: 'guide', title: 'Smart Guide viewer', intro: 'Turn through the catalogue like a book.', items: [
    { q: 'What is the Smart Guide?', a: <>Open <Link className="underline" to="/guide">Guide</Link>. The general index shows a conveyor with a bubble for each category. Click a bubble to open the category page, then a product. Turn pages with the arrows (or the keyboard arrow keys), or type a page code in the box (INDEX, C01 for the first category, or a product code) and press Enter.</> },
    { q: 'What do the toolbar icons do?', a: <>Search, Contents (every category and product), Thumbnails (every page), PDF download, Print, Share link and Help. Each works on the page you are viewing.</> },
    { q: 'How do I ask for a quotation?', a: <>Click <b>Add to quotation</b> on a product or a category card, then open <b>Request for quotation</b> (the green button at the top right of the guide). Change quantities, check your details and click Send request. You get a reference number and Ultraplast contacts you. Your recent requests are listed in the same panel.</> }] },
  { id: 'product', title: 'Product pages', intro: 'Images, details and documents.', items: [
    { q: 'How do I zoom an image?', a: <>Click any product image. A viewer opens with <b>Zoom in</b>, <b>Zoom out</b> and <b>Reset</b>. You can also scroll to zoom, drag to move when zoomed, double-click to zoom, use the arrows for the next image, and press Esc to close.</> },
    { q: 'What is on a product page?', a: <>Images (and the catalogue page picture if uploaded), technical data, specifications, documents, related products, and a side panel with the data status, Add to BOM and Compare.</> },
    { q: 'Where are the documents?', a: <>Under Documents on the product page. A document linked to a product appears on that product. A document linked to a category appears on every product in that category. <Link className="underline" to="/documents">All documents</Link> can be searched and filtered.</> }] },
  { id: 'compare', title: 'Compare and BOM', intro: 'Side-by-side comparison and parts lists.', items: [
    { q: 'How do I compare products?', a: <>Tick <b>Compare</b> on up to four products, then open <Link className="underline" to="/compare">Compare</Link>. Rows that differ are shaded. Check the data status of each product.</> },
    { q: 'How do I make a BOM?', a: <>On a product page, under My selection, choose a BOM (or name a new one), set the quantity and click <b>Add to BOM</b>. In <Link className="underline" to="/bom">My BOM</Link> you can change quantities, add notes, tick lines and <b>Remove selected</b>, then <b>Export Excel</b>, <b>Export PDF</b> (needs the export permission) or <b>Print</b>. BOMs are private to you.</> }] },
  { id: 'share', title: 'Sharing, PDF and print', intro: 'Send a category or product to a colleague or customer.', items: [
    { q: 'What do the share buttons do?', a: <><b>Copy internal link</b> gives a link that needs a sign-in. <b>Copy customer link</b> (administrators) creates a public link, with an expiry you choose, that shows only that product or category without signing in. <b>Download PDF</b> saves a document with the company logo, heading and watermark. <b>Print</b> opens the same document ready to print.</> },
    { q: 'What do customers see?', a: <>Only the one product or category in the link: images, details and specifications. They can print or download a PDF from the page. Links can be withdrawn at any time under Admin, Customer links.</> },
    { q: 'Print did not open anything.', a: <>Your browser may have blocked the new tab. Allow pop-ups for this site and try again.</> }] },
  { id: 'trouble', title: 'Problems', intro: 'Common questions.', items: [
    { q: 'I cannot see any products.', a: <>Only published products are visible. If the catalogue is empty, ask an administrator to publish products in the Review queue.</> },
    { q: 'I cannot export a BOM or download a PDF.', a: <>These need the BOM export or document download permission. Ask your administrator.</> },
    { q: 'An image or document does not open.', a: <>Download links last about a minute. Reload the page and try again. CAD files need the CAD download permission.</> }] },
]

const ADMIN: Section[] = [
  { id: 'a-panel', title: 'Admin panel', intro: 'One place for every management tool.', items: [
    { q: 'Where do I start?', a: <>Click <Link className="underline" to="/admin">Admin</Link>. The top shows counts of users, products, drafts, categories and documents. Below, tiles open Products, Categories, Bulk product images, Import, Review queue, Documents, Catalogue page images, Catalogue PDF files, Customer links and User access. You only see the tiles your role allows.</> }] },
  { id: 'a-catalogue', title: 'Categories and products', intro: 'Adding, editing and deleting.', items: [
    { q: 'How do I add a category?', a: <>Admin, Categories. Type a name, choose an Explorer area if you want it to open from the conveyor picture, and click Add. Rename by editing the box, reorder with the arrows, and untick Visible to hide it. <b>Delete</b> removes a category (its products stay but lose it); tick several and use <b>Delete selected</b> for many.</> },
    { q: 'How do I add a product by hand?', a: <>Admin, Products, New product. Fill in the details, tick one or more categories (the first ticked is the main one), add specifications, choose several images at once, then Save. <b>Visibility</b>: Draft is hidden, Published is visible. Set <b>Data status</b> to Verified only after checking against the catalogue.</> },
    { q: 'How do I delete products?', a: <>In Admin, Products tick the products and choose <b>Delete selected</b>, or use Delete on one row. In the Review queue the same option applies to drafts. Deleting removes the specifications, images and documents of those products. BOM lines keep the code and name.</> }] },
  { id: 'a-bulk', title: 'Import and images', intro: 'Loading many products and pictures.', items: [
    { q: 'How do I import many products?', a: <>Admin, Import. Choose the Excel or CSV file (use the template), check the preview, type the catalogue name, tick the confirmation and Import. Records arrive as drafts. Publish them in the Review queue (tick products, then Publish or Verify and publish).</> },
    { q: 'How do I upload many product images?', a: <>Admin, Bulk product images. Name each file after its product code: CODE.jpg for the first image, CODE__2.jpg (two underscores) for the second. Select all files at once and upload.</> },
    { q: 'What are Catalogue page images and PDF files?', a: <><b>Catalogue page images</b>: upload page pictures named page-0300.jpg, shown on product pages (only upload pages Ultraplast may republish). <b>Catalogue PDF files</b>: private storage for full catalogue PDFs; select several to delete.</> }] },
  { id: 'a-docs', title: 'Documents and customer links', intro: 'Files and public links.', items: [
    { q: 'How do I upload a document?', a: <>Documents, Upload a document. Choose the file, give a title and type, and choose what it belongs to: nothing, one product (search by code or name) or one category. Use <b>Edit</b> on a row to change the title, type or link, and <b>Delete selected</b> for many. CAD files need the CAD download permission to open.</> },
    { q: 'How do customer links work?', a: <>On a product or category choose an expiry and click <b>Copy customer link</b>. Admin, Customer links lists every link with its status; withdraw one, or tick several and use <b>Withdraw selected</b>. Verify products before sharing them with customers.</> }] },
  { id: 'a-rfq', title: 'Quotation requests', intro: 'Requests sent from the Smart Guide.', items: [
    { q: 'Where do quotation requests go?', a: <>Admin, Quotation requests (for administrators with the quotation permission). Each request shows the customer, the products and the quantities. Contact the customer, then change the status as you work on it. There are no email alerts yet, so check this page regularly.</> }] },
  { id: 'a-users', title: 'People', intro: 'Access and roles (Super Admin or granted permission).', items: [
    { q: 'How do I approve someone?', a: <>Admin, User access. Approve or reject pending requests, suspend or reactivate accounts, and add an email to the approved list so a person is approved automatically when they register and verify that address. Only a Super Admin can change roles.</> }] },
]

function Block({ s }: { s: Section }) {
  return (
    <section id={s.id} aria-labelledby={`${s.id}-h`} className="bg-white border border-steel-300 rounded-md shadow-sm scroll-mt-24">
      <div className="px-4 py-3 border-b border-steel-300 border-l-4 border-l-brand-green rounded-t-md"><h2 id={`${s.id}-h`} className="font-semibold text-lg">{s.title}</h2><p className="text-sm text-steel-600">{s.intro}</p></div>
      <div className="divide-y divide-steel-300">{s.items.map((i) => (
        <details key={i.q} className="group px-4 py-2"><summary className="cursor-pointer font-medium py-1 list-none flex items-center justify-between gap-3">{i.q}<span aria-hidden="true" className="text-steel-600 group-open:rotate-45 transition">+</span></summary><div className="pb-2 text-sm leading-relaxed text-steel-800">{i.a}</div></details>))}</div>
    </section>
  )
}

export default function Help() {
  const { can } = useAuth()
  const admin = can('manage_catalogue') || can('manage_users') || can('manage_imports')
  const all = admin ? [...EVERYONE, ...ADMIN] : EVERYONE
  return (
    <div className="space-y-6 max-w-4xl">
      <header><h1 className="text-2xl font-bold">Help</h1><p className="text-steel-600">How to use the Ultraplast Chainbelts product guide. Click a question to open the answer.</p></header>
      <nav aria-label="Help topics" className="bg-white border border-steel-300 rounded-md p-3">
        <ul className="flex flex-wrap gap-2 text-sm">{all.map((s) => <li key={s.id}><a href={`#${s.id}`} className="inline-block border border-steel-300 rounded-full px-3 py-1 hover:border-brand-green hover:text-brand-green">{s.title}</a></li>)}</ul>
      </nav>
      {EVERYONE.map((s) => <Block key={s.id} s={s} />)}
      {admin && (<><h2 className="text-xl font-bold pt-2">For administrators</h2>{ADMIN.map((s) => <Block key={s.id} s={s} />)}</>)}
      <p className="text-sm text-steel-600">Ultraplast Chainbelts Pvt. Ltd. · <a className="underline" href="https://www.ultraplastindia.com/" target="_blank" rel="noopener noreferrer">www.ultraplastindia.com</a>. For account or data questions, contact your administrator.</p>
    </div>
  )
}
