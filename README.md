# Roy's Garage

A mobile-first, bilingual (EN/FR) site where neighbours get an oil change price and book an evening or weekend slot. Roy runs everything from `#/admin`.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # pricing and booking-rule checks
```

With no `.env`, the app runs in **local demo mode**: data is stored in your browser and seeded with sample bookings, quotes, customers and cars. Admin login in demo mode: `roychababi53@gmail.com` (no email is sent). Reset the demo data from Admin → Settings.

The sample car-table specs (litres, grade, filter) are placeholders. Check them before going live.

## Go live

### 1. Supabase (free tier)
1. Create a project at supabase.com.
2. In the SQL editor, run `supabase/migrations/001_init.sql`. It creates the tables, row-level security, the booking rules in SQL, and adds Roy's admin address. Then run `supabase/seed_car_table.sql` to load the starter car table (~2,800 rows).
3. Auth → Providers → Email: keep it on, and **turn off "Allow new users to sign up"**.
4. Auth → Users → **Invite user**: `roychababi53@gmail.com`. Only addresses listed in `admin_users` can read or change data.
5. Auth → URL configuration: set Site URL to `https://roychababi.github.io/Roys-Garage/` and add it to the redirect URLs, along with `http://localhost:5173/`.
6. Edge Functions (needs the Supabase CLI):
   ```bash
   supabase functions deploy notify --no-verify-jwt
   supabase functions deploy vehicle-menu --no-verify-jwt
   supabase secrets set RESEND_API_KEY=re_xxx NOTIFY_FROM="Roy's Garage <onboarding@resend.dev>"
   ```
   Resend's free tier (3,000 emails/month) covers the alerts. Its test sender `onboarding@resend.dev` only delivers to the email address that owns the Resend account, so sign up with Roy's Gmail, or verify a domain.
7. Copy `.env.example` to `.env` and fill in the project URL and anon key.

### 2. GitHub Pages
1. Push this repo to `github.com/RoyChababi/Roys-Garage`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Settings → Secrets → Actions: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Every push to `main` runs the tests, builds and deploys (`.github/workflows/deploy.yml`).
5. `.github/workflows/keepalive.yml` pings Supabase daily so the free project never pauses.

### Starter car table
`scripts/car-specs.mjs` lists oil specs by engine family (make, model, years, engine size, litres with filter, grade). `node scripts/build-car-table.mjs` matches them to the exact FuelEconomy.gov names and writes `src/data/car-table.json` (demo seed) and `supabase/seed_car_table.sql`. The specs are typical owner's-manual values marked "Starter spec, verify": fix any wrong one in `car-specs.mjs` and rebuild, or edit it in Admin → Car table.

### Optional: prebuild the car menus
```bash
npm run build:cars          # years 2005+ into public/vehicle-menus.json
```
Without it, menus come from the Supabase cache, then FuelEconomy.gov live, and are cached after the first use.

## How it fits together

| Piece | Where |
|---|---|
| Pricing (`labour + filter + litres × jug price ÷ jug litres`, +pickup) | `src/lib/pricing.js` |
| Booking rules (open days, 3/day, back to back, 7-day window) | `src/lib/slots.js`, enforced again in SQL `create_booking` |
| Car menus + diesel/EV blocking | `src/lib/vehicles.js`, `supabase/functions/vehicle-menu` |
| Customer texts, `sms:` links, `.ics` | `src/lib/messages.js` |
| Translations | `src/lib/i18n.js` |
| Customer flow | `src/customer/` (`#/`, `#/book…`) |
| Admin | `src/admin/` (`#/admin`) |
| Backend switch (Supabase or local demo) | `src/backend/index.js` |

Quote links look like `…/#/book?quote=<id>`. They pre-select the car and Roy's price and open straight at "Pick a time".

## Still open
- QR code and printable flyer: waiting on the final site URL.
- Weekend hours: default is 9 am to 5 pm. Change it in Admin → Schedule → "Make this the default".
