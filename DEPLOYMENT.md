# Deployment guide: GitHub, Supabase, Vercel

Do the steps in order. Nothing here needs a public admin endpoint, and no secret is ever committed.

## 1. GitHub repository
1. Create an empty **private** repository on GitHub.
2. In the project folder: `git init`, `git add .`, `git commit -m "Initial commit"`, then add the remote and `git push -u origin main`.
3. Check `git ls-files | wc -l` is below 100 (or run `npm run check:files`). Confirm `.env`, `node_modules`, `dist` and any `.pdf` are not listed.

## 2. Supabase project
1. Create a project (choose a region near your users). Save the database password in a password manager.
2. Note **Project URL** and the **anon public key** (Project Settings, API). Do **not** use the service-role key anywhere in this app.

## 3. Apply migrations
Run `supabase/migrations/0001` to `0006` **in order** in the SQL Editor (or `supabase db push`). If you applied an earlier copy of these files, use a fresh project or reset the database first, because migrations 0003 to 0006 were corrected in place.

## 4. Authentication settings
1. Authentication, Providers: keep **Email** on and switch every other provider off.
2. Turn **Confirm email** on (approval depends on verified emails).
3. Set minimum password length to 10.
4. Configure **custom SMTP** (Authentication, SMTP). Supabase's built-in sender is heavily limited and unsuitable for real users.
5. Recommended: enable CAPTCHA protection for sign-ups.
6. URL Configuration: set **Site URL** to your Vercel URL, and add redirect URLs `https://YOUR-DOMAIN/login` and `http://localhost:5173/login`.

## 5. Storage
Migration 0005 creates the private buckets `technical-documents`, `product-images` and `catalogues`. Check Storage, Policies. Free plans cap uploads at 50 MB, so keep the 300 MB catalogue PDF offline or use a paid plan.

## 6. Vercel environment variables
In Vercel, Project Settings, Environment Variables, add for Production and Preview: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Nothing else.

## 7. Connect Vercel to GitHub and deploy
Import the repository in Vercel. Framework: Vite. Build command `npm run build`, output `dist`. Deploy. Add the final Vercel URL to Supabase redirect URLs (step 4.6).

## 8. First Super Admin (one time)
1. The designated person opens the site, chooses Request access, and verifies their email.
2. A project owner opens `supabase/bootstrap_super_admin.sql` in the Supabase SQL Editor, sets `v_email`, and runs it **once**. It refuses to run if a Super Admin exists and is not reachable from the browser.
3. Sign in again. The Admin and User access links appear.

## 9. Test registration and approval
1. Register a second test account and verify its email. It must land on the waiting page and see no catalogue data.
2. As Super Admin, open User access and approve it. Reload as the test user: the catalogue opens.
3. Add a third email to the approved list, register that address, verify: it should be approved automatically.

## 10. Test revocation and document protection
1. Suspend the test user. Their next request must lose access (reload and try the catalogue).
2. Upload a CAD file as admin. A normal user without the CAD permission must not see or download it.
3. Confirm a copied signed download link stops working after about a minute.

## 11. Mobile check
Open the site on a phone: menu, search, catalogue, a product page, BOM and the explorer must be usable without sideways scrolling.

## 12. Optional checks
Run `supabase/tests/access_smoke.sql` in a **throwaway** project (it rolls back). Then run `npm run typecheck && npm run lint && npm test && npm run build`. CI repeats these on every push.

## 13. Load the real catalogue
See the README, Phase 4. Import creates **unverified drafts**. Review each against its source page, then verify and publish.

## If the site shows a blank white page
1. Open the site, press F12, choose Console, and read the first red error.
2. "Invalid URL" or "supabaseUrl is required": the Vercel variable is wrong. `VITE_SUPABASE_URL` must start with `https://`. Fix it and **redeploy** (variables only apply to new builds).
3. "Failed to load module script" or a 404 for `/src/main.tsx`: Vercel did not build the app. In Project Settings set Framework Preset to Vite, Build Command `npm run build`, Output Directory `dist`, and Root Directory to the folder that directly contains `package.json`.
4. In GitHub, the repository root must show `package.json`, `index.html` and `src` directly, not inside another folder.
5. In Vercel, Deployments, a red deployment means the build failed. Open it and send the build log.

## Load the catalogue data (after the site works)
1. Run SQL migration `0007_page_previews.sql` in the Supabase SQL Editor.
2. Sign in as Super Admin, open **Import**, upload `rexnord-products-import.csv`, type the catalogue name, tick **Create categories that do not exist yet**, confirm, and import.
3. Open **Review**, tick **Select all on this page**, and choose **Publish (keep Not verified)**. Repeat for each page. Users then see the products with a warning label.
4. Optional page images: in Supabase, Storage, open the `page-previews` bucket and upload the JPG files from `catalogue-page-previews.zip` (unzip first). Only do this if Ultraplast may republish the catalogue pages.
