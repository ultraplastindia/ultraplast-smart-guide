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
  { id: 'search', title: 'Search in detail', intro: 'What the search looks at and how to get better results.', items: [
    { q: 'What does the search look at?', a: <>Product code, name, description, brand, material, application, colour and the values of specifications. Only published products are searched. The search text can be up to 100 characters.</> },
    { q: 'How do I search by code?', a: <>Type any part of the code. Spaces, dashes and capital letters do not matter, so 1001ft, 1001 FT and 1001-ft all find 1001-FT-84.</> },
    { q: 'How do I search by words?', a: <>Type a phrase from the name, or several words. With several words, every word must appear somewhere in the product text, in any order, for example "flat top PA". If you get no results, use fewer words.</> },
    { q: 'How do I narrow the results?', a: <>In the Catalogue use the category list, the Brand and Material lists and Sort. The numbers show how many products each choice has. Filters combine with the search text. A product in several categories appears under each of them. Clear filters resets everything.</> },
    { q: 'Search in the Guide viewer', a: <>The search box in the Guide toolbar uses the same search and shows the first 8 matches; pick one to open its page. For the full list with filters use the Catalogue. To go straight to a known page use the page-code box.</> }] },
  { id: 'guide', title: 'Smart Guide viewer', intro: 'Turn through the catalogue like a book.', items: [
    { q: 'What is the Smart Guide?', a: <>Open <Link className="underline" to="/guide">Guide</Link>. The general index shows a conveyor with a bubble for each category. Click a bubble to open the category page, then a product. Turn pages with the arrows (or the keyboard arrow keys), or type a page code in the box (INDEX, C01 for the first category, or a product code) and press Enter.</> },
    { q: 'What do the toolbar icons do?', a: <>Search, Contents (every category and product), Thumbnails (every page), PDF download, Print, Share link and Help. Each works on the page you are viewing.</> },
    { q: 'What does a product page in the Guide look like?', a: <>It is laid out like a catalogue page. The coloured borders and title bar match the category. The left column lists <b>Related products · go to</b> with a picture, name and page code; click one to open it. The centre has the images (click to zoom), technical data and specifications, with underlined values you can click. The right column has information cards (Introduction to the catalogue, Documents) and your selection (quotation, BOM, compare). Below, a table of <b>More in this catalogue</b> lets you click any row, or any underlined value, to move on. The small box under the title, For general index go to, returns to the index.</> },
    { q: 'What is the picture with page codes on some Guide pages?', a: <>Some category and product pages show a picture with labels and page codes, like the printed Smart Guide index pages. Click a code, a label or the dot on the picture to open that page. A code turns red when you point at it. Pages without a picture look as usual. An administrator adds these pictures under Admin, Guide illustrations.</> },
    { q: 'What can I click on a Guide page?', a: <>Everything leads somewhere. On the index, click a bubble, its name, its code boxes, or the line and dot that point to the conveyor to open that category. The grid of tabs at the top of every page jumps to any category (the INDEX tab returns to the general index). Inside a category, click a product card to open it. The toolbar arrows, the page-code box, Contents and Thumbnails also move you around.</> },
    { q: 'How do the clickable tables and Go to boxes work?', a: <>On a category page, the Index box lists every product code and the Related catalogues box lists categories that share products; click any of them to jump there. Switch to <b>Table</b> to see the products in rows: click a row to open the product, or click an underlined brand, material, pitch, width or thickness to see every product with that value. On a product page, underlined values in Technical data and Specifications work the same way, and the Related products and Related catalogues lists take you straight to those pages.</> },
    { q: 'How do I sign in with an email code?', a: <>On the Sign in page choose <b>Email me a sign-in code instead</b>, enter your work email, then type the code from the email. A code works once and expires shortly. When you request access, the verification email also contains a code you can type on the same page. You still need an approved account.</> },
    { q: 'Where do quotation requests arrive by email?', a: <>A Super Admin sets the receiving address(es) in <b>Admin, Email settings</b>. Every new quotation request is emailed there, and you can reply to the customer directly from that email. All requests are also listed in Admin, Quotation requests.</> },
    { q: 'How are page codes and the page order decided?', a: <>INDEX is the general index. Categories are C01, C02 and so on, in the order set under Admin, Categories. Products use their own product code. The book order is the index, then each category followed by its products sorted by code, then Other products (C99) for products without a main category.</> },
    { q: 'Why does a bubble show a letter instead of a picture?', a: <>The bubble picture is the first image of the first product (by code) in that category. If that product has no image, the bubble shows the first letter of the category name. Add an image to that product to fix it.</> },
    { q: 'How do I ask for a quotation?', a: <>Click <b>Add to quotation</b> on a product or a category card, then open <b>Request for quotation</b> (the green button at the top right of the guide). Change quantities, check your details and click Send request. You get a reference number and Ultraplast contacts you. Your recent requests are listed in the same panel.</> }] },
  { id: 'product', title: 'Product pages', intro: 'Images, details and documents.', items: [
    { q: 'How do I zoom an image?', a: <>Click any product image. A viewer opens with <b>Zoom in</b>, <b>Zoom out</b> and <b>Reset</b>. A tall picture fits the width: scroll to see the rest of it. Hold Ctrl and scroll (or press + and −) to zoom, drag to move, double-click to zoom, use the arrows for the next image, and press Esc to close.</> },
    { q: 'What is on a product page?', a: <>Images (and the catalogue page picture if uploaded), technical data, specifications, documents, related products, and a side panel with the data status, Add to BOM and Compare.</> },
    { q: 'Where are the documents?', a: <>Under Documents on the product page. A document linked to a product appears on that product. A document linked to a category appears on every product in that category. <Link className="underline" to="/documents">All documents</Link> can be searched and filtered.</> }] },
  { id: 'compare', title: 'Compare and BOM', intro: 'Side-by-side comparison and parts lists.', items: [
    { q: 'How do I compare products?', a: <>Tick <b>Compare</b> on up to four products, then open <Link className="underline" to="/compare">Compare</Link>. Rows that differ are shaded. Check the data status of each product.</> },
    { q: 'How do I make a BOM?', a: <>On a product page, under My selection, choose a BOM (or name a new one), set the quantity and click <b>Add to BOM</b>. In <Link className="underline" to="/bom">My BOM</Link> you can change quantities, add notes, tick lines and <b>Remove selected</b>, then <b>Export Excel</b>, <b>Export PDF</b> (needs the export permission) or <b>Print</b>. BOMs are private to you.</> }] },
  { id: 'share', title: 'Sharing, PDF and print', intro: 'Send a category or product to a colleague or customer.', items: [
    { q: 'What do the share buttons do?', a: <><b>Copy internal link</b> gives a link that needs a sign-in. <b>Copy customer link</b> (administrators) creates a public link, with an expiry you choose, that shows only that product or category without signing in. <b>Download PDF</b> saves a document with the company logo, heading and watermark. <b>Print</b> opens the same document ready to print.</> },
    { q: 'What do customers see?', a: <>Only the one product or category in the link: images, details and specifications. They can print or download a PDF from the page. Links can be withdrawn at any time under Admin, Customer links.</> },
    { q: 'Print did not open anything.', a: <>Your browser may have blocked the new tab. Allow pop-ups for this site and try again.</> }] },
  { id: 'pdf', title: 'PDF and print in detail', intro: 'What the documents contain and how to get them.', items: [
    { q: 'What is in a category PDF?', a: <>Landscape pages with the logo and company name at the top, a green rule, the category name, the date and a table of every product: code, name, brand, material, pitch, width, thickness, catalogue page, data status and specifications. A faint logo and company name sit behind every page, and the page number is at the bottom.</> },
    { q: 'What is in a product PDF?', a: <>Portrait pages with the same heading and watermark, the first product image, all details and the specification table.</> },
    { q: 'How do I download or print?', a: <>On a category or product choose Download PDF or Print, or use the PDF and printer icons in the Guide toolbar. Print opens the document in a new tab, ready for the printer dialog. If nothing opens, allow pop-ups for this site. The BOM has its own Export PDF with the same logo heading.</> },
    { q: 'What do customers get?', a: <>On a customer link page they can print or download a PDF with the same heading and watermark, but only customer-safe details: no catalogue page references and no data status column.</> },
    { q: 'Why is a PDF missing or empty?', a: <>PDF buttons need the document download permission. The general index has no PDF, and a category with no published products cannot be exported.</> }] },
  { id: 'trouble', title: 'Problems', intro: 'Common questions.', items: [
    { q: 'I cannot see any products.', a: <>Only published products are visible. If the catalogue is empty, ask an administrator to publish products in the Review queue.</> },
    { q: 'I cannot export a BOM or download a PDF.', a: <>These need the BOM export or document download permission. Ask your administrator.</> },
    { q: 'An image or document does not open.', a: <>Download links last about a minute. Reload the page and try again. CAD files need the CAD download permission.</> }] },
]

const ADMIN: Section[] = [
  { id: 'a-panel', title: 'Admin panel', intro: 'One place for every management tool.', items: [
    { q: 'Where do I start?', a: <>Click <Link className="underline" to="/admin">Admin</Link>. The top shows counts of users, products, drafts, categories and documents. Below, tiles open Products, Categories, Bulk product images, Import, Review queue, Documents, Catalogue page images, Catalogue PDF files, Customer links and User access. You only see the tiles your role allows.</> }] },
  { id: 'a-setup', title: 'Set up the index and catalogue', intro: 'The order to follow when loading Ultraplast data.', items: [
    { q: 'Step 1: the index (categories)', a: <>Admin, Categories. Add one category for each bubble you want on the Guide index. The order you set with the arrows decides the codes (C01, C02 ...) and the colours. Untick Visible to hide one. Keep names short, because long names are shortened on the index.</> },
    { q: 'Step 2: the catalogue (products)', a: <>Fill in the Excel template (one row per product, the category name in the category column) and import it under Admin, Import with "Create categories that do not exist yet" ticked, or add products by hand under Admin, Products. Imported products arrive as drafts.</> },
    { q: 'Step 3: images', a: <>Add pictures on each product, or many at once under Admin, Bulk product images (CODE.jpg, CODE__2.jpg). The first image of each category's first product becomes that category's bubble picture on the index.</> },
    { q: 'Step 4: publish', a: <>Admin, Review queue: tick products and choose Publish, or Verify and publish after checking them against the catalogue. Only published products appear in the Guide, the Catalogue and PDFs.</> },
    { q: 'Step 5: check the Guide', a: <>Open Guide. Check that every bubble opens the right category, the codes look right and products have pictures. Fix anything in Admin and reload the page.</> },
    { q: 'Optional extras', a: <>Documents (datasheets, drawings, CAD) linked to a product or category; Catalogue page images (page-0300.jpg) shown on product pages; Catalogue PDF files stored privately; Customer links for sharing with customers.</> }] },
  { id: 'a-catalogue', title: 'Categories and products', intro: 'Adding, editing and deleting.', items: [
    { q: 'How do I add a category?', a: <>Admin, Categories. Type a name, choose an Explorer area if you want it to open from the conveyor picture, and click Add. Rename by editing the box, reorder with the arrows, and untick Visible to hide it. <b>Delete</b> removes a category (its products stay but lose it); tick several and use <b>Delete selected</b> for many.</> },
    { q: 'How do I add a product by hand?', a: <>Admin, Products, New product. Fill in the details, tick one or more categories (the first ticked is the main one), add specifications, choose several images at once, then Save. <b>Visibility</b>: Draft is hidden, Published is visible. Set <b>Data status</b> to Verified only after checking against the catalogue.</> },
    { q: 'How do I link related products?', a: <>Admin, Products, Edit a product. Under Related products, type a code or name and pick the product. The link works both ways: each product appears as a Go to link on the other's page. Use Remove to undo it. Related catalogues need no setup: they follow the categories you tick on the products.</> },
    { q: 'How do I delete products?', a: <>In Admin, Products tick the products and choose <b>Delete selected</b>, or use Delete on one row. In the Review queue the same option applies to drafts. Deleting removes the specifications, images and documents of those products. BOM lines keep the code and name.</> }] },
  { id: 'a-bulk', title: 'Import and images', intro: 'Loading many products and pictures.', items: [
    { q: 'How do I import many products?', a: <>Admin, Import. Choose the Excel or CSV file (use the template), check the preview, type the catalogue name, tick the confirmation and Import. Records arrive as drafts. Publish them in the Review queue (tick products, then Publish or Verify and publish).</> },
    { q: 'How do I upload many product images?', a: <>Admin, Bulk product images. Name each file after its product code: CODE.jpg for the first image, CODE__2.jpg (two underscores) for the second. Select all files at once and upload.</> },
    { q: 'What are Catalogue page images and PDF files?', a: <><b>Catalogue page images</b>: upload page pictures named page-0300.jpg, shown on product pages (only upload pages Ultraplast may republish). <b>Catalogue PDF files</b>: private storage for full catalogue PDFs; select several to delete.</> }] },
  { id: 'a-docs', title: 'Documents and customer links', intro: 'Files and public links.', items: [
    { q: 'How do I upload a document?', a: <>Documents, Upload a document. Choose the file, give a title and type, and choose what it belongs to: nothing, one product (search by code or name) or one category. Use <b>Edit</b> on a row to change the title, type or link, and <b>Delete selected</b> for many. CAD files need the CAD download permission to open.</> },
    { q: 'How do customer links work?', a: <>On a product or category choose an expiry and click <b>Copy customer link</b>. Admin, Customer links lists every link with its status; withdraw one, or tick several and use <b>Withdraw selected</b>. Verify products before sharing them with customers.</> }] },
  { id: 'a-rfq', title: 'Quotation requests', intro: 'Requests sent from the Smart Guide.', items: [
    { q: 'Where do quotation requests go?', a: <>Admin, Quotation requests (for administrators with the quotation permission). Each request shows the customer, the products and the quantities. Contact the customer, then change the status as you work on it. Each new request is also emailed to the address set in Admin, Email settings, so you do not have to keep checking this page.</> }] },
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
