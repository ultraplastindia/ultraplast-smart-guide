# Final checklist (honest status)

## Verified in the build environment
- Dependency-free library code (`access`, `format`, `importer`, `bom`) passes a strict TypeScript check and gives expected results on sample inputs.
- `scripts/process_catalogue.py`: compiled and run on real catalogue pages (TOC pages 4-5, product pages 299-301). Values on page 300 matched the page image.
- Tracked file count script runs (current count is below the 100 limit).

## Written but NOT run (treat as unverified)
- All SQL migrations (0001-0014) and `supabase/tests/access_smoke.sql`. They were reviewed by reading only; no PostgreSQL was available. This includes 0014 (Guide illustrations) and its admin editor: picture upload, dragging callouts and the access rules still need a test on a real Supabase project.
- The React app: typecheck, lint, unit tests, build, and browser behaviour. Excel/PDF export libraries.
- The GitHub Actions workflow and the Vercel/Supabase deployment.
- Accessibility (keyboard, screen reader) and mobile layout.

## Implemented (code present)
Login (password and email code), request access, pending/denied pages; category, product, image and document admin screens; related products and Guide viewer with quotation requests and email; Guide illustrations with clickable page codes; allowlist approval, roles, suspension, audit log; RLS and secure functions; catalogue search, filters, sorting, pagination; product details with "Not available"; categories and explorer; comparison; BOMs with Excel/PDF/print; import (CSV/Excel) with validation and batches; review queue; private document and image storage with signed links; admin dashboard; profile, dashboard and help pages; extraction script with OCR and validation report.

## Incomplete or not built
- Sending invitation emails (the allowlist pre-approves an address but sends nothing).
- `package-lock.json` is not in the repository: run `npm install` once and commit it, because CI uses `npm ci`.
- Guide illustrations are not included in PDFs or customer share links, and callouts are placed by hand (no automatic import).
- Table item codes (such as the highlighted VG- codes on a System Plast page) are not clickable.
- Rate limiting on admin functions; server-side-only export enforcement.
- Official logo (add `public/logo.png`); featured/frequently-used sections on the home page.
- Component tests and end-to-end tests.
- Real catalogue data: the OCR pipeline only produces series-level candidates; part-number tables are not extracted.

## Open business questions
- Who owns the Rexnord catalogue, and may Ultraplast republish it, its images and page previews?
- Is this the full source, and what categories should the app use?

## Security notes
- The anon key is public by design; RLS is the real protection, so run the smoke test before launch.
- Anyone can create an unapproved account. Enable CAPTCHA and custom SMTP; approval still gates all data.
- Rotate the database password if it was ever shared.
