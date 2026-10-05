# Our Little Arcade

Private couples app at https://web-game-couple.vercel.app/. Sign in with either provisioned account's email and password. No public signups or new invitation link is needed. Game requests resolve the current session and refresh expired tokens.

## Current features

- Home: editable anniversary, countdown and milestones, daily sealed questions, Would You Rather, mood history, thinking-of-you taps, latest-wish shortcut, optional music and weather.
- Play: Tic-tac-toe, Connect Four, timed Block Hearts Duel, Draw & guess, Know me by heart and five-round trivia. Every online move is validated in Postgres. Quiz answers remain sealed until both people submit; only the artist can fetch the drawing word.
- Memories: private compressed photos, captions, date timeline, daily photo swap and hearts. A swap stays hidden until both share that day.
- Notes: text, optional photo or one-minute voice recording, dated seals and open-when envelopes. Recipient content and media are withheld by database/storage policies until the opening rules are satisfied.
- Us: shared, personal, secret and custom wishlists; invisible gift claims, priorities, prices, links, photos, comments, reactions, ordering, wish jar and private backup. Date ideas with mood/weather filters and a picker, a shared sketchbook, 36 original conversation prompts, countdowns, optional silly stakes and annual memories recap live here too. Completed games earn server-derived XP and coins toward cosmetic theme/sticker thresholds. Installation and notification settings live here.

Artwork uses the approved pink keepsake design. Real names and preferences are not baked into the active UI. Nicknames are optional. The anniversary is entered in setup, rather than prescribed by the app. Development preview is local pass-and-play and never writes to the online accounts.

## Run locally

Use Node 22+.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. “Review locally” appears only in development. Copy `.env.example` to `.env.local` and set the two NEXT_PUBLIC_SUPABASE variables for real sign-in. Do not put server secrets in NEXT_PUBLIC variables.

The development watcher regenerates drop-in artwork. If game verification temporarily cannot reach Supabase, check the dev server has network access before changing Auth or table permissions.

## Supabase setup

The active fresh project is `ohjeloskpjsynhbddgch`. The previous project is not used.

For a completely fresh schema, run `supabase/setup_fresh_project.sql` once; this contains migrations 001–003. Then apply migrations 004 through 008 in filename order. For your existing configured project, apply only the files that have not yet been run. Do not rerun table-creation migrations.

| Migration | Adds |
|---|---|
| 004_block_battle.sql | Timed, server-scored block duel |
| 005_connections.sql | Daily questions, choices, moods and taps |
| 006_keepsakes.sql | Wishlists, private claims/media, Memories and sealed Notes |
| 007_installation.sql | Private notification choices and device registrations |
| 008_together.sql | Remaining game rules, activities and server-derived progress |

See SUPABASE-SETUP.md for account provisioning. Both Auth users need linked profile seats 0 and 1 in the same couple. Keep public signups disabled. Only the two configured private emails are accepted by the app and game route. Passwords and server credentials belong in owner-managed environment variables, not chat or GitHub.

Authentication URL Configuration: Site URL `https://web-game-couple.vercel.app`; allow that HTTPS origin as a redirect. Use localhost as an additional development redirect only if needed.

RLS protects each table independently. Do not grant anonymous access to resolve an Auth or setup error. Secret Ideas and claims are excluded from shared notifications. Photo signed URLs expire after five minutes; compression strips EXIF/location metadata before upload. Backup exports only the current account's accessible content and media.

## Vercel and installation

The deployed app uses the Next.js preset, Node 22+, `npm ci` and `npm run build`. Required public environment variables are NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Add the server-only notification variables only when configuring push, then redeploy.

INSTALL.md explains Android sideload and iPhone Home Screen installation. The Android package is `com.ourlittlearcade.app` and loads the deployed HTTPS origin. Website changes update the app; native/icon changes need another APK.

```sh
npm run android:key
npm run android:build
```

The generated release key is in the ignored `.local-signing/` folder. Back up that folder privately; losing the key prevents updating the existing installation. Debug and signed release APKs are generated in `dist-apk/`. The GitHub Actions workflow builds a debug APK on main pushes; optional signing and Firebase configuration use repository secrets.

The service worker caches the public shell/static assets only. API responses, private media, signed URLs and Supabase traffic are excluded. Only new wishes can queue offline; claims, edits, game moves and sealed notes require a connection. Queued wishes are scoped to their original account and retried idempotently after it signs back in.

## Optional push

PUSH-SETUP.md gives the complete setup. Android remote push uses Firebase Cloud Messaging; web Home Screen push uses VAPID Web Push. Either transport can remain disabled while ordinary app features work.

For Android, put the correct `google-services.json` at `android/app/google-services.json` and rebuild. Firebase Admin JSON and SUPABASE_SERVICE_ROLE_KEY stay server-only in Vercel. The generated webhook secret is stored privately in `.local-signing/push.env`. Supabase Database Webhooks call `/api/push` with that secret. No service-role credential is shipped in the browser or APK.

Each person explicitly enables their own device. Preferences default off. Quiet hours skip notifications instead of postponing them. Delivery is best effort, with event deduplication and expired token removal. Messages contain no letter text, photo or gift-claim content. Local Android anniversary reminders are optional and require permission separately.

## AI questions

GEMINI_SETUP.md covers migration 009, the server-only Gemini key, free-project setup, request caps and the manual `npm run gemini:check` command. Brain Duel uses shared, unseen bank questions before one batched generation; daily questions and Would You Rather share a monthly content pack. Development and automated tests always use fixtures. Settings > AI Questions shows configuration, usage and saved content, with a shared AI toggle and timezone.

## Artwork and sound

Drop originals into `public/drop-in/`: backgrounds, couple, game-art, stickers, mascot, app-icon and sounds. Each folder's README.txt lists names and sizes. Filenames/extensions are case-insensitive and numeric suffixes are supported. `npm run assets:generate` refreshes the manifest; dev watches it and build regenerates it.

Resolution order is private app-art upload, local drop-in asset, then built-in fallback. Settings > Art Slots shows every slot and supports private upload. Native camera/library is offered explicitly in the APK; web uses the browser file picker.

Drop-in `icon-foreground` and `icon-background` override the code-native heart/gamepad at APK/PWA build time. Existing installed icons need reinstall/update to change; private uploads alone cannot rewrite an installed Android launcher icon.

Night Train is user supplied, self-hosted, and off by default. CREDITS.md records licenses and the music attribution limitation. No analytics or ad SDK is included.

## Verification and limits

```sh
npm run typecheck
npm test
npm run build
```

Tests execute real migration functions and RLS using embedded Postgres, including outsiders, direct-query secrecy, sealed rounds, artist-only words, private media, gift claims, device-token isolation and offline queue retries. Browser review evidence is in `.impeccable/review/` at 360, 768 and 1280px. A signed APK build/signature is verified, but physical-device installation and delivery still require owner setup and testing. Lighthouse 90+ is a target, not a measured result.

The acceptance pass still needs both real phones: sign out/in, live turns, private photo upload, a live wishlist update, a hidden gift claim, a future letter unlocking correctly, drop-in image refresh, Android push and iPhone Home Screen installation. These are not claimed complete from local preview.

Heavy games/canvas/backup code load on demand. Drawing publishes complete strokes when the pointer lifts; partial live strokes and undo are not shipped. Queries have bounded limits (3,000 game strokes, 1,500 shared strokes, 1,000 activity records); growing archives need pagination. Biometric app lock and Home Screen widgets remain optional future work.
