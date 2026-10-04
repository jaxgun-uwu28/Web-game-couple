# Our Little Arcade

A private couples app. The active interface is **Stage 1 of the new pink brief**: responsive Home, anniversary setup/editing, artwork slots, private sign-in and optional music. Play, Memories and Notes are deferred. Earlier game modules remain in the repository for later integration. This stage pauses for visual approval.

## Current Stage 1

- Run `npm run dev`, open http://localhost:3000 and choose “Review Stage 1 locally”. This button appears only in development. Preview dates persist in this browser; preview uploads stay in memory until reload. Production requires a provisioned private account.
- Drop originals into `public/drop-in/`. Seven folders contain README.txt instructions with filenames and sizes. Dev watches files; build regenerates the manifest. Raster images become resized, metadata-free WebP. SVG/GIF/audio are copied. Originals stay untouched. Missing images use designed fallbacks.
- Us lists artwork slots and permits image uploads. Signed-in uploads override folder artwork and use a private bucket after migration 002. Folder artwork is public static content: use private uploads for private photos. Future feature/icon slots are registered now; APK/PWA packaging is deferred.
- Apply migration `002_stage_one.sql` once after reconciling migration 001 with the existing database. It preserves existing dates, removes the anniversary default for new couples and enables couple-scoped private artwork. New private Realtime topics are `art:<uuid>` and `anniversary:<uuid>`.
- Home uses the saved anniversary or first-run setup; Us edits it. Night Train remains off by default and plays with the sound control.
- Tests cover date/leap-day arithmetic, asset optimization/original preservation and migration access rules. Screenshots cover Home, Us, setup and sign-in on desktop, tablet and mobile, plus night palette. Hosted authentication, remote upload persistence, email delivery and Realtime still require owner setup and two-account verification. No live deployment or APK/PWA is claimed.

The setup and architecture below document the **earlier cabin implementation**. Its games and activity modules are retained but are not active in the Stage 1 interface. The old local preview behavior described below applies to that earlier interface.

## Earlier implementation stages

1. Design and foundation: `DESIGN.md`, `PRODUCT.md`, assets and credits.
2. App and database: five games, private daily questions, all-time scoreboard and shared activities.
3. Verification and setup: embedded Postgres security/rules tests, responsive review, production build and deployment instructions.

## Run locally

Requires Node 22 or newer.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

On PowerShell use `Copy-Item .env.example .env.local`. Open http://localhost:3000. The provided publishable key is a browser-safe key; security is enforced by Auth and RLS. Never put a service-role key into a `NEXT_PUBLIC_*` variable or commit `.env.local`.

The **local design preview** button exists only in development. It uses isolated in-memory data, supports pass-and-play board games and activity previews, and disappears from production. Reloading clears it. It does not bypass Supabase or show saved private data. Knowledge/trivia online rounds require two real accounts. Private profiles are the source of player identity; nobody can choose a seat at login.

## Supabase setup (project owner)

The publishable key cannot create tables or administer accounts. These steps must be completed in your Supabase project before online play works.

1. In the SQL editor run `supabase/migrations/001_arcade.sql` **once** on a fresh schema. It creates the couple, private profiles, games, answers, shared entries, RLS, validated functions, and Realtime policies. It does not reset other application tables or publications. The supplied project already responds with a protected `profiles` table; inspect its schema/migration history first and reconcile existing objects rather than blindly rerunning creation SQL. A 401 from an anonymous table request is expected; do not grant anonymous access to fix it.
2. In Auth settings disable public user signups. Enable email/password and email magic links. Set the Site URL to the production Vercel URL; add `http://localhost:3000` and the production URL to allowed redirects. Configure email delivery/SMTP for dependable magic links. Do not use an unrestricted wildcard production redirect.
3. In Realtime settings disable public channels. The app uses a private `couple:<uuid>` channel with membership-scoped RLS. Database changes for games, entries and profiles are added to the existing publication by the migration.
4. Provision exactly two users and their profile rows. Either use the script below or create users through the Auth dashboard and insert profiles manually. There are only two seats, enforced by the unique `(couple_id, slot)` constraint.

### Account seed

Put these variables in ignored `.env.local`:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=YOUR_OWNER_SERVICE_ROLE_KEY
LANCE_EMAIL=lancerobertmacorol8@gmail.com
ELAINE_EMAIL=lancerobertmacorol4@gmail.com
```

Then run:

```sh
node --env-file=.env.local scripts/seed.mjs
```

Passwords are optional (`LANCE_PASSWORD`, `ELAINE_PASSWORD`); leave them unset to use email links. The script creates email-confirmed users but **does not send email**; use the login page’s “Email link” tab to request invitations. Keep the service-role key local, remove it after provisioning, and do not add it to Vercel. The script reuses existing emails; do not change these emails to transfer an occupied seat without intentionally updating the existing profile. The temporary Elaine email belongs to Lance; replace it with Elaine’s own address in Supabase Auth when ready.

For manual profiles, use the users’ real Auth UUIDs:

```sql
insert into public.profiles(id,couple_id,slot,name,color) values
('LANCE_AUTH_UUID','06092025-0000-4000-8000-000000000001',0,'Lance','#262821'),
('ELAINE_AUTH_UUID','06092025-0000-4000-8000-000000000001',1,'Elaine','#344f3f');
```

## Vercel deploy

Push this repository to GitHub, then import `jaxgun-uwu28/Web-game-couple` in Vercel. Select the Next.js preset and Node 22+. Set **only** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from `.env.example`. Build command `npm run build`, install `npm ci`; keep the default Next.js output setting. Deploy, then configure Supabase Site URL and redirect URLs as above. Rebuild whenever public environment variables change.

## How the shared table works

- **Games:** `src/lib/games.ts` is the registry and shared game contract. The same inline game surface renders all modules; heavy canvas code loads on demand. Starting the same type joins its current game. SQL serializes starts and locks game rows for every move. Board games check turn, bounds, occupied space, wins and draws. Quiz/knowledge rounds seal each answer exactly once and score only after both submit. Drawing words are stored in a private table and exposed only to the artist; only the artist can save game strokes. Completed games build the all-time scoreboard in Postgres.
- **Realtime:** private Presence shows who is here; Postgres changes refresh persisted records. Broadcast nudges and daily-answer refresh signals contain no private answers. A 30-second refresh covers reconnects and Manila date rollover. Browser notifications are opt-in and work while the tab is open; there is no service-worker push notification system.
- **Daily question:** answers cannot be queried directly. A validated RPC returns the caller’s own answer and a sealed placeholder for the partner until both respond. Dates and streaks use Asia/Manila so both devices share a day. An incomplete current day preserves yesterday’s streak until the day passes.
- **Together:** daily choices reveal together with historical match percentage; date picking uses custom ideas or personal suggestions; bucket/movie/restaurant lists can be checked off and deleted; notes open randomly from the partner’s messages; doodles persist normalized strokes. Notes are shared couple data with a surprise UI, not private-from-partner encryption.
- **Ambience:** local time changes the cabin tint and palette; night mode can be manually toggled. Seasonal accents use a decorative northern-calendar window label. Optional geolocation sends rounded coordinates to Open-Meteo only after choosing weather and granting permission. Location is not saved. User-supplied Night Train music loops at 30% volume using the sound button, stays off by default, and loads only when requested. Pausing and resuming keeps your place in the track. Reduced motion disables animations.

## Verification

```sh
npm run typecheck
npm test
npm run build
npm audit
```

Embedded Postgres tests run the real migration and functions with simulated Auth users: active-game joining, turn rejection, tic-tac-toe/Connect Four wins, outsider isolation, sealed/revealed daily answers, private quiz rows, duplicate-answer rejection, artist-only drawing and secret guessing. Separate tests cover board edge wrapping and Manila anniversary arithmetic. No production data is changed by tests.

Responsive evidence is in `.impeccable/review/`. Preview flows were inspected at 360, 768 and 1280px. Production build and dependency audit pass. A Lighthouse 90+ score is a target, not yet a measured result. Two-device Supabase Auth/Presence/Broadcast and email delivery must be verified after owner setup. Recommended acceptance: open both accounts in separate browsers, play each game, seal/reveal daily answers, draw on both devices, save a list entry, sign out, and check an unrelated account cannot read data.

## Practical limits

Daily/trivia questions are a curated initial set (five trivia rounds, seven daily prompts); edit the corresponding SQL scoring answers together with `src/lib/games.ts`. Drawing points publish when a stroke is released; no partial stroke previews or undo are shipped. The shared-entry query currently loads up to 3,000 items per visit; add pagination/archiving if your sketchbook grows past that. The app uses trusted database functions instead of a service-role runtime. Client UI is login-gated and every data operation is protected independently by RLS/function authorization.

See `CREDITS.md` for asset licenses and `DESIGN.md` for visual decisions.
