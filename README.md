# Pixel Direct — Camera Inventory

Internal webapp for testing, dispatching, and stock-counting camera inventory.

## Stack

- Next.js (App Router, TypeScript, Tailwind) — deployed on Vercel
- Supabase (Postgres + Auth + Row Level Security) — free tier

## First-time setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com) (free tier).
2. In the Supabase dashboard, open **SQL Editor**, paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates all tables,
   the three seed grades (A/B/C), and Row Level Security policies.
3. In **Project Settings → API**, copy the **Project URL**, **anon public key**, and
   **service_role key** (the service role key is secret — it's what lets `/admin`
   send staff invite emails; never expose it to the browser).
4. In **Authentication → URL Configuration**:
   - Set **Site URL** to `http://localhost:3000` (your production domain once deployed).
     Leave it as the plain base URL — no path needed.
   - Add `http://localhost:3000/set-password` to **Redirect URLs** (and your
     production domain's `/set-password` once deployed).
5. In **Authentication → Email Templates**, edit both the **Invite user** and
   **Reset Password** templates: find the link that reads `{{ .ConfirmationURL }}`
   and replace it with:
   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/set-password
   ```
   This is required. Supabase's default template links only work with the older
   "implicit flow"; this app's Supabase client uses the newer PKCE flow (via
   `@supabase/ssr`), which needs a `token_hash` link that a server route
   (`/auth/confirm`) exchanges for a session — otherwise every invite/reset link
   will land on `/set-password` saying "invalid or expired" even though it isn't.
6. Copy `.env.local.example` to `.env.local` and fill in all three values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
7. Install dependencies and run the dev server:
   ```
   npm install
   npm run dev
   ```
8. **Bootstrap the first admin** (staff are normally created via the in-app invite
   form on `/admin`, but that needs an admin to already exist first):
   - Go to **Authentication → Users → Invite user**, enter your own email, and send it.
   - Open the email, click the link — it lands on `/set-password` in the app. Set a
     password; you'll be signed in afterward.
   - In the Supabase **SQL Editor**, run:
     ```sql
     update profiles set role = 'admin' where email = 'your@email.com';
     ```
   - Sign in again — you'll land on `/admin`. From here on, invite every other
     tester/dispatcher/checker/admin from that page; no one else needs SQL access.

## How the data model maps to the workflow

- **Tester** (`/tester`) logs a freshly-graded camera: brand, model, color, grade,
  serial number, and an optional note (e.g. "with adapter"). Saving finds-or-creates
  the brand/model/color/grade combination (a **SKU line**, whose `quantity` is the
  live in-stock count for that combination) and adds a new **unit** row for that
  physical camera. The printed label's QR encodes that unit's own ID — every
  physical camera gets its own unique QR, even when 100 units share the same
  brand/model/color/grade.
- **Dispatcher** (`/dispatcher`) scans a unit's QR and immediately sees that exact
  camera's brand/model/color/grade/serial/note/tester — no manual matching, since
  the QR already identifies the specific unit. "Pick" marks it picked (which
  decrements its SKU line's quantity via a DB trigger); scanning without picking is
  just a read-only lookup.
- **Checker** (`/checker`) starts a count session, then scans every camera on the
  shelf. Each scan is logged once per unit per session (re-scanning the same label
  twice doesn't double-count), and the live table groups scans by brand/model/color/grade,
  showing system quantity vs. scanned quantity with mismatches highlighted.
### Scanning: handheld scanner or phone camera

Every scan field (dispatcher, checker, and the tester's "fix a mistake" search)
supports both. A handheld USB/Bluetooth barcode scanner just types into the
focused text field and hits Enter — no setup needed. Next to each field is a
**Scan with camera** button that opens the phone's rear camera and decodes the
QR directly in the browser (no app install). One thing to know: browsers only
allow camera access on HTTPS or `localhost` — if you're testing on a phone over
your local network (e.g. `http://192.168.x.x:3000`) the camera button won't
work until it's deployed to a real HTTPS domain (Vercel gives you this for
free) or you tunnel localhost with something like `ngrok`.

- **Admin** (`/admin`) invites staff by email (they get a Supabase email with a link
  to set their own password), manages everyone's role, and can resend access or
  deactivate someone (bans their login and hides them from active use, but keeps
  their testing/pick history intact — nothing is hard-deleted). The **Catalog** tab
  handles fixing a typo'd brand/model/color name or merging duplicates into one
  (moving all their units/SKU lines along with it). The **Export** tab downloads
  a CSV of either the current inventory summary or every unit ever tested.

### Fixing mistakes

- **Tester** (`/tester`) has a "Fix a mistake on a saved camera" panel: scan the
  QR or type the serial number to find a unit, then correct its serial, note, or
  grade (changing the grade moves it to the correct SKU line and both quantities
  update automatically).
- **Dispatcher** (`/dispatcher`) shows an "Undo pick" button on an already-picked
  unit, putting it back in stock if the wrong camera was picked.
- Forgot a password? `/login` has a "Forgot your password?" link. An admin can
  also trigger the same reset email for someone from their row on `/admin`
  ("Resend access").

### Offline behavior

A service worker keeps the app shell loadable on flaky warehouse wifi, and an
amber banner appears whenever the browser goes offline. Camera **lookups**
(dispatcher scan-to-view, tester's "fix a mistake" search) need a live
connection — there's nothing to show without one. But the two write actions used
while walking the floor — a dispatcher's **pick** and a checker's **scan** — are
queued locally (in the browser's storage) if the connection drops mid-action, and
sync automatically the moment the connection returns, without losing what was
scanned. The checker's "Finish session" button is blocked while scans are still
waiting to sync, so a session can't be closed out with missing data.

## Label printing

The print page is sized in CSS to a 2in × 2in direct-thermal sticker and uses the
browser's native print dialog — no vendor SDK required. Any printer that installs as
a normal Windows/Mac system printer works: **Zebra ZD230** for a durable, higher-volume
desktop printer, or a compact single-sticker printer like **MUNBYN ITPP941** /
**Phomemo M220** if desk space or budget is tight. Whichever you pick, confirm it has
a real desktop print driver — some cheap label printers only work through their own
phone app and never appear in a browser's print dialog, which won't work here.

## Already deployed the old schema?

If you ran `supabase/schema.sql` before staff management, catalog merge, or the
grade-correction trigger fix existed, run
[`supabase/migration_2_admin_tools.sql`](supabase/migration_2_admin_tools.sql)
once in the SQL Editor to bring an existing project up to date. Safe to run more
than once. A fresh project only ever needs `schema.sql` — it already includes
everything.

## What's built vs. what's next

Done: catalog + SKU/unit data model, RLS, auth with role gating, admin-driven
staff invites/resend/deactivate, catalog cleanup (rename/merge), CSV export,
offline-tolerant scan/pick queueing, and the full tester → print-label,
dispatcher scan/pick, and checker stock-count flows, plus mistake-correction
tools (edit a unit, undo a pick, forgot password) throughout.

Next (not built yet — flag if you want these): Amazon inventory sync and
reporting dashboards beyond the two CSV exports.
