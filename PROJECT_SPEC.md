# Our Little Arcade — current specification

Updated 2026-10-06. This is the compact current reference. Source and migrations define exact behavior; this file summarizes it. Later explicit user instructions override it. Older PRODUCT.md/DESIGN.md checkpoints are historical where they conflict with this summary.

## Product and architecture

Two-person couples app for Lance and Elaine. Next.js 16 App Router, React 19, TypeScript; Supabase Auth/Postgres/RLS/Storage/Realtime; Vercel hosting; installable PWA and Capacitor 8 Android shell. Firebase Admin/FCM and Web Push deliver opt-in notifications. Gemini runs through server routes only. Use package.json/package-lock.json for exact versions, not remembered framework conventions.

The entry page renders StageOne; the authenticated client shell coordinates destinations and shared state. Server routes and database RPCs validate online actions. Client previews use local fixtures/pass-and-play and are distinct from online games. Android loads https://web-game-couple.vercel.app/; web changes arrive from that origin, while native assets/plugins/version changes require rebuilding the APK.

## Features and behavior

- Navigation: Home, Play, Memories, Notes, Activities. Top-right gear opens Settings (anniversary, nickname, AI, artwork, notifications, installation, backup, sign-out).
- Play: Tic-tac-toe, Connect Four, Draw & guess, Know me by heart, Brain Duel and Block Hearts Duel. Explicit Exit cancels the shared session. Synchronous games require both players present; presence expires after 20 seconds. Endless/Daily ordinary navigation preserves runs.
- Brain Duel: host chooses topic, Easy/Medium/Hard and 3/5/10 questions; guest joins; both ready before start. Online trivia is AI-only with no hardcoded fallback. Daily/Would You Rather use shared generated batches with saved-content recovery when unavailable.
- Heartblast: fixed-orientation 8×8 pieces, three-piece trays, server-replayed placements/scores. Timed (30–1800s), Endless, Race, Daily and optional Co-op/Junk/opponent preview. Duel trays depend only on seed + tray index and contain one small piece; no board-specific guarantee. Only single-board Co-op/Daily guarantee a fitting tray. Canonical scoring/rules stay in existing shared rules and generator; tie-break is fewer pieces, then draw.
- Activities: wishlists, dates, sketchbook, conversations, countdowns, stakes, recap and shared spin wheel. Wheel result Close preserves entry; Remove deletes only the selected entry. Revision checks protect shared edits.
- Memories: shared dated albums, compact gallery, viewer, batch uploads (max 12), camera Snap & send, author caption editing and recoverable Archive/Restore. New photos are ordinary shared posts; existing sealed photo swaps retain their rules.
- Notes: sealed text/voice/photo keepsakes. Connections: daily prompts, choices, mood and Thinking of you with optional custom notification text. Preserve paired reveals, secret wishes/claims, quiet hours and recipient opt-in.
- Current expansion adds photo hearts/comments, named game tracks/separate music volumes and a private Hold Hands room/stats. Owner confirmed migrations 014/015. Stop for two-phone testing after Hold Hands; further games, voice cassettes and Postcards are tracked in docs/EXPANSION_PLAN.md.

## Identity and UI constraints

Pink romantic keepsake style; desktop side rail/mobile bottom bar. Fredoka headings, Nunito Sans body, Caveat short notes. Cream #FFF8F3, ink #50313F, cherry #9D304F, strawberry #F8C9D8, peach #F8DCC4, lavender #EAE1F5, butter #F7E6A6; night uses plum, not pure black. Reuse current CSS tokens. Rounded cards, minimum 44px controls, visible focus, safe-area padding and reduced-motion support.

Supplied kitty-couple.jpg is the default web/PWA/Android/sign-in identity; preserve its white background. Artwork resolves through existing Slot/useAsset customization and generated manifests. No fabricated couple photos. Heartblast tiles are now **plain colors without emblems**; square recessed wells, raised matching tray/board tiles, at least 4.5:1 contrast, legal open-space ghost previews, compact HUD and responsive board/tray.

Visible copy is personal and useful: no stage labels, metadata/compression/privacy commentary, developer notes, folder paths or technical artwork annotations. Keep necessary game instructions, permission choices and actionable errors. Anniversary/nicknames are editable data, not baked into active UI. Music/sounds are opt-in. No ads, analytics or paid-service additions.

## Data and security

Supabase project: ohjeloskpjsynhbddgch. Allowed sign-in emails: Lance `lancerobertmacorol8@gmail.com`, Elaine `elainemaeescosio49@gmail.com`. Preserve existing account UUIDs/membership when changing emails; verified Elaine is slot 0 and Lance slot 1 (earlier chat IDs were reversed).

Schema domains: couples/profiles; games/answers/secrets/presence; block_matches/match_moves; entries/together_activities/activity_wheels; daily questions/choices/answers/moods/taps; wishlists/items/claims/comments/reactions; memories/notes/social; hold sessions; artwork slots; notification settings/devices/deliveries; AI bank/history/lobbies/jobs/usage/health. Exact columns, policies and RPC signatures live in numbered `supabase/migrations/001…015`; inspect only relevant migrations and later overrides. Add new numbered migrations rather than changing already-applied history. Owner confirmed migrations 010, 012, 013, 014 and 015; do not infer other hosted state from local tests.

Only NEXT_PUBLIC Supabase URL/publishable key belong in browser configuration. Gemini API key, Supabase service-role key, Firebase service account and webhook secrets remain server-only. Never expose `.env.local`, private media or sealed answers. Gemini default is gemini-3.5-flash-lite, with existing quotas/lease/circuit breaker. Tests/dev use fixtures. Prior three-live-request allowance is exhausted: no more live Gemini checks without new explicit authorization.

## Working agreement

Follow AGENTS.md; use ARCHITECTURE.md for targeted file discovery and TODO.md/KNOWN_ISSUES.md for pending facts. Keep changes scoped, checks meaningful and reports short. No new dependencies when existing tools suffice. Review relevant bundled Next docs before code changes. Detailed setup: SUPABASE-SETUP.md, GEMINI_SETUP.md, PUSH-SETUP.md, INSTALL.md. Do not load all of them for unrelated fixes.

Verification is evidence-specific: fixture/build success does not establish two-account, browser, physical camera or push acceptance. Current pending boundaries are in KNOWN_ISSUES.md.
