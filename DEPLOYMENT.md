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


## 14. Email: sign-in codes and quotation emails (migrations 0012 and 0013)
This adds sign-in by emailed code, verification codes at sign-up, and an email for every quotation request. It only **adds** tables and functions; nothing existing is changed. Do the steps in this order.

1. **Get a mail key.** Gmail is the simplest: it can email any address and needs no domain.
   - **Gmail / Google Workspace (App password):** in your Google Account open Security, turn on 2-Step Verification, then search for "App passwords", create one (any name) and copy the 16 letters. Google Workspace: an administrator must allow app passwords. Gmail allows about 500 emails a day (Workspace about 2,000).
   - **Resend** (resend.com): verify your company domain, then API Keys. Until the domain is verified it only delivers to your own account email.
   - **Brevo** (brevo.com): verify your sender address, then SMTP & API, API keys (starts with `xkeysib-`).
2. **Run the SQL, in order.** In Supabase open **SQL Editor**, paste the whole file `supabase/migrations/0012_email_otp_and_quotation_mail.sql` and press **Run**; then do the same with `0013_gmail_app_password.sql`. If it complains about `pg_net`, open Database, Extensions, switch on `pg_net` and run again (both files are safe to run twice).
3. **Deploy the new site files** (the update steps are in the README), so the Email settings page exists.
4. **Save your settings.** Sign in as Super Admin, open **Admin, Email settings**, choose your mail service, paste the key (for Gmail also enter the Gmail address), enter the sender name and the address(es) that should receive quotation requests, and press **Save settings**.
5. **Gmail only: install the mail sender (once).** After saving, section 5 of the same page shows a ready-to-paste code. Press **Copy code**, then in the Supabase dashboard open **Edge Functions**, **Deploy a new function**, **Via Editor**, name it exactly `smtp-mail`, replace everything in the editor with the pasted code and press **Deploy function**. Open the function, go to **Details** and switch **off** "Verify JWT" (the function protects itself with the private key in the code). Resend and Brevo do not need this step.
6. **Send the two test emails** from the same page. Check how they look and that "Recent emails" says *Accepted by the mail service*. Quotation emails already work at this point.
7. **Switch on sign-in emails.** Supabase dashboard, **Authentication**, **Hooks**, add a hook of type **Send Email**, choose **Postgres function**, schema `public`, function `send_auth_email`, Save. Do this last: from then on Supabase sends **all** sign-up and sign-in emails through your mail service, so if the key or sender is wrong, those emails fail.
8. **Check the web address list.** Authentication, URL Configuration: the Site URL is your Vercel address and `https://YOUR-SITE/login` is in the Redirect URLs, so the button in the verification email returns to the site.

To undo: delete the Send Email hook (step 7). Supabase then sends its own emails again, and password sign-in is never affected. To remove the feature completely, use the ROLLBACK notes at the bottom of the SQL files.

Who can use the page: Super Admins. A Super Admin can also grant the permission `manage_email_settings` to a specific admin in User access.


## 15. Guide illustrations: clickable pictures with page codes (migration 0014)

Optional. It lets a category page or a product page of the Guide show a picture with labels and page codes that open other pages, like the printed Smart Guide index pages. Pages without a picture look exactly as before.

1. **Run the SQL.** In Supabase open **SQL Editor**, paste the whole file `supabase/migrations/0014_guide_illustrations.sql` and press **Run**. It adds two tables and a private storage bucket named `guide-illustrations`. Run it once.
2. **Add a picture.** Sign in as an admin, open **Admin, Guide illustrations**, choose a category (or a product), pick the picture (PNG, JPG or WEBP, up to 5 MB).
3. **Add callouts.** Choose the product or category the callout opens, optionally type a label, and press **Add**. Then drag the round dot onto the part of the picture and the label box to where the text and code should sit. Positions save when you let go.
4. **Check it.** Open the Guide, go to that category or product. Click a code: the page opens. Hovering turns the code red.

To undo: remove the illustration on the same admin page. To remove the feature completely, run `drop table public.guide_callouts, public.guide_illustrations;` and delete the `guide-illustrations` bucket.
