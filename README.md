# Ultraplast Smart Conveyor Guide

Phase 1 scaffold: React + TypeScript + Vite + Tailwind, Supabase Auth, Vercel config, CI.

## Run locally
1. `npm install`
2. Copy `.env.example` to `.env` and fill in the Supabase URL and anon key.
3. `npm run dev`

## Checks
`npm run typecheck && npm run lint && npm test && npm run build && npm run check:files`

## Important
- Frontend route guards are UX only. Real access control is Supabase RLS (Phase 2).
- Never commit `.env`, the catalogue PDF, or the service-role key.
- Keep tracked files under 100 (`npm run check:files`).

## Phase 2: access control (Supabase)
1. Auth settings: enable email sign-up, **turn on "Confirm email"**, set Site URL and redirect URLs. Disable other providers.
2. Apply `supabase/migrations/0001..0003` in order (SQL Editor or `supabase db push`).
3. The first person signs up and verifies their email, then a project owner runs `supabase/bootstrap_super_admin.sql` once (edit `v_email`). It refuses if a Super Admin exists.
4. Optionally run `supabase/tests/access_smoke.sql` in a throwaway project (rolls back).
All approvals, roles and suspensions go through `admin_*` functions; API roles have no direct write access to any table.

## Phase 4: catalogue pipeline, import, storage
**Extract (runs on your computer, needs poppler-utils and tesseract; output stays in `scripts/work/`, never committed):**
```
python3 scripts/process_catalogue.py info CATALOGUE.pdf
python3 scripts/process_catalogue.py toc CATALOGUE.pdf --toc-pages 4-12
python3 scripts/process_catalogue.py ocr CATALOGUE.pdf --pages @toc      # only pages listed in the TOC; resumable
python3 scripts/process_catalogue.py build --catalogue-name "Name, edition"
```
Outputs `products.csv` and `validation_report.json`. Rerunning is safe (OCR resumes; imports skip duplicates).
**Import:** apply `0005_storage_import.sql`, sign in as an admin with import and catalogue permissions, open Import, upload `products.csv`, confirm. Records arrive as unverified drafts; use Review to verify and publish.
**Storage:** buckets `technical-documents`, `product-images`, `catalogues` are private; downloads use 60-second signed links. Supabase free plans cap uploads at 50 MB, so a 300 MB catalogue PDF needs a paid plan or should stay offline.

## Phase 5: comparison, BOM, exports
Apply `0006_boms.sql`. BOMs are private to their owner. Excel and PDF exports call `export_bom_data`, which checks the `export_bom` permission and writes an audit entry. To put the company logo on PDFs, add an official `public/logo.png`.

## Adding data by hand (no code or SQL)
Sign in as admin, open **Admin**. **Categories**: add, rename, reorder, hide, link to an explorer area. **Products**: New product, fill in the fields and specifications, Save, then add images. **Import**: many products at once from CSV or Excel. **Documents**: CAD files and datasheets.

**Bulk images:** Admin, Bulk images. Name each file after its product code (`CODE.jpg`, `CODE__2.jpg` for a second image) and select many files at once.
