# Roy's Garage

Bilingual (EN/FR) mobile-first site where neighbours get an oil-change price and book an evening/weekend slot. Roy runs everything from the admin panel. React 18 + Vite, hash routing, Supabase backend, hosted on GitHub Pages.

## Where things live
- **Live site:** https://roychababi.github.io/Roys-Garage/ (path is case-sensitive; `/roys-garage/` is a 404)
- **Admin:** https://roychababi.github.io/Roys-Garage/#/admin (no link on the customer site, on purpose)
- **Repo:** github.com/RoyChababi/Roys-Garage (renamed from `Roy-s_Garage`; the local `origin` may still use the old name, GitHub redirects it)
- **Supabase project ref:** `drynevippztzkalpxiox` (linked; CLI via `npx -y supabase@2 ...`)
- **Admin user:** roychababi53@gmail.com (also the only row in `admin_users`)

## Commands
- `npm run dev` / `npm test` (pricing + booking rules) / `npm run build`
- No `.env` locally means **local demo mode** (data in the browser). Production builds get `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from GitHub Actions secrets.
- Run SQL on the live DB: `npx -y supabase@2 db query --linked "<sql>"` (or `-f file.sql`)
- Deploy: push to `main`. `.github/workflows/deploy.yml` tests, builds and deploys. `keepalive.yml` pings Supabase daily.
- Check deploys without gh auth: `curl -s "https://api.github.com/repos/RoyChababi/Roys-Garage/actions/runs?per_page=3"`

## Auth
- Admin signs in with **email + password** (`signInWithPassword`). The magic link is only a fallback ("No password yet, or forgot it?"); after using it, Roy sets a password in Admin → Settings → Account.
- Supabase's built-in mailer is rate-limited (about 1 email/min per address, a few per hour per project). A 429 `over_email_send_rate_limit` is that, not a bad email. Long-term fix: custom SMTP (Resend) in Supabase Auth settings.
- Magic-link landing: `authLanding` in `src/backend/index.js` records `#access_token` before Supabase strips it, so `App.jsx` still routes to admin.

## Known gotchas (already hit)
- **Blank page / 404 on `/src/main.jsx`:** GitHub Pages source is "Deploy from a branch", so GitHub's own "pages build and deployment" publishes raw source and races our workflow. Fix: Settings → Pages → Source = **GitHub Actions**.
- **Admin sees 0 cars / no data:** this project doesn't auto-grant table privileges to `anon`/`authenticated`. `supabase/migrations/002_grants.sql` fixes it; RLS (`is_admin()`) still limits rows.
- `settings.site_url` in the DB is used in quote/reminder texts; it must be `https://roychababi.github.io/Roys-Garage/` or empty.
- Edge functions `notify` and `vehicle-menu` are deployed with JWT verification ON, so the frontend must use the **legacy anon key** (`eyJ…`), not `sb_publishable_…`.
- Resend sender `onboarding@resend.dev` only delivers to the Resend account owner's address.

## Layout
| Piece | Where |
|---|---|
| Pricing | `src/lib/pricing.js` |
| Booking rules | `src/lib/slots.js`, enforced again in SQL `create_booking` |
| Car menus, diesel/EV blocking | `src/lib/vehicles.js`, `supabase/functions/vehicle-menu` |
| Texts, `sms:` links, `.ics` | `src/lib/messages.js` |
| Translations | `src/lib/i18n.js` |
| Customer flow | `src/customer/` |
| Admin | `src/admin/` |
| Backend switch (Supabase / local demo) | `src/backend/` |
| Schema, RLS, grants | `supabase/migrations/` |

## Working rules
- Run `npm test` and `npm run build` before pushing; push to `main` deploys to real customers.
- Live DB holds real bookings and customer phone numbers: back up a table (`select ... ` to a file) before bulk updates or deletes.
- Keep EN and FR strings in sync in `i18n.js`.
