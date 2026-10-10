# Targeted file map

Read the row relevant to the task, then follow actual imports. Paths are relative to this repository. This is a routing map, not a second specification.

| Area | Start here | Related source / checks |
|---|---|---|
| Entry, sign-in, shell, Home, Settings | src/components/StageOne.tsx | src/lib/private-auth.ts, src/lib/supabase.ts, src/app/page.tsx, src/app/globals.css |
| Existing arcade coordination | src/components/Arcade.tsx | src/components/PlayArcade.tsx, src/components/GameCover.tsx |
| Board games and shared surfaces | src/components/GameSurface.tsx | src/lib/games.ts, src/lib/game-request.ts, src/lib/use-game-presence.ts, src/app/api/game, src/app/arcade.css |
| Drawing / partner games | src/components/ExtraGame.tsx | src/components/Doodle.tsx, src/lib/drawing.ts, src/lib/extra-games.ts, src/lib/ai/party-games.ts, api/game/route.ts, migration 026, tests/party-games.test.ts |
| Brain lobby / Gemini | src/components/BrainDuel.tsx | src/components/AIQuestions.tsx, src/lib/ai, src/app/api/brain, src/app/api/ai, migrations 009–010 |
| Heartblast | src/components/BlockBattle.tsx | src/lib/heartblast.ts, src/lib/heartblast-rules.json, src/lib/block-battle.ts, src/app/block-battle.css, scripts/generate-heartblast-rules.mjs, migrations 004/012, tests/heartblast*.test.ts |
| Daily Heartblast / Home comparison | src/components/DailyHeartChallenge.tsx | Heartblast files above |
| Daily prompts, moods, taps | src/components/Connections.tsx | src/lib/connections.ts, src/app/connections.css, migrations 005/009/011 |
| Memories / camera | src/components/MemoryAlbum.tsx | src/components/NativePhotoButton.tsx, src/components/Keepsakes.tsx, src/lib/memory-album.ts, src/lib/keepsakes.ts, src/app/keepsakes.css, migrations 006/013, tests/keepsakes.test.ts |
| Notes / wishlists | src/components/Keepsakes.tsx, src/components/WishJar.tsx | src/lib/keepsakes.ts, wish-jar.ts (layout/privacy), wish-defaults.ts and outbox.ts (defaults/idempotent queue), src/app/keepsakes.css, migrations 006/031; tests/wish-jar.test.ts and wish-defaults.test.ts |
| Activities / wheel | src/components/TogetherActivities.tsx | src/components/Activities.tsx, src/components/SpinWheel.tsx, src/lib/together.ts, src/app/together.css, migrations 008/012 |
| Artwork | src/components/ArtSlots.tsx | scripts/asset-slots.mjs, public/drop-in, existing Slot/useAsset definitions and generated manifest |
| Music | src/components/Ambience.tsx | public audio assets, existing preference controls |
| Music settings / coordination | src/components/MusicControls.tsx | src/lib/music.ts, game music hooks and Ambience |
| Hold Hands | src/components/HoldHands.tsx | src/lib/hold-hands.ts, migration 015, src/app/api/push/hold, tests/hold-hands*.test.ts |
| Voice cassettes | src/components/VoiceCassettes.tsx | src/lib/voice.ts, src/lib/media-outbox.ts, migration 016, tests/voice*.test.ts |
| Postcards | src/components/Postcards.tsx | src/lib/postcard.ts, migration 017, src/app/expansion.css, tests/expansion-db.test.ts |
| New plugin games | src/components/PluginGame.tsx | src/lib/plugin-games, src/app/api/game/plugin/route.ts, migrations 018–020, tests/plugin-games.test.ts |
| Invites, daily maze, promises, expansion rewards | src/components/GameInvites.tsx | DailySyncPuzzle.tsx, PromiseLedger.tsx, ExpansionStats.tsx, MediaStorage.tsx, migration 019 |
| Photo hearts/comments | src/components/MemorySocial.tsx | migration 014, tests/keepsakes.test.ts |
| Push / PWA | src/components/InstallSupport.tsx | src/lib/push.ts, src/app/api/push, src/app/manifest.ts, scripts/prepare-sw.mjs, migration 007 |
| Android / icons | capacitor.config.ts | android/app/build.gradle, scripts/build-android.mjs, scripts/generate-app-icons.mjs, scripts/generate-android-art.mjs, public/icons |

Commands: `npm run dev` (localhost:3000), `npm run typecheck`, `npm test` (fixtures), `npm run build`, `npm run android:build`. Focused tests: `node --import ./tests/gemini-env.mjs --import tsx --test tests/<relevant>.test.ts`. Do not run `gemini:check` under the exhausted live-call allowance.

Migrations and RLS are authoritative for online data access. Read later migrations that replace the affected RPC/policy. Tests use local fixtures/database emulation; they do not verify the hosted deployment.


## Game-feel release — 2026-10-07

Migrations 021–025 are owner-confirmed applied. Heartblast uses room entry plus Ready without acceptance (028 applied), immediate reconciled placements and durable 60-second reconnect handling. Rivalry includes losses, current/best streaks and replay-derived Heartblast comeback deficits, ordered by completion time for new results. Postcards add collection filters and smart replies; cassettes clean up preview URLs and decode missing waveform peaks; Settings offers reward-coin cosmetic unlocks.

Shared game-feel/card engine: src/lib/game-feel.ts, cards.ts, board-feel.ts; PlayingCard, GameDie, StickerPicker and CasinoChip. Ledger uses private server-selected values, own tap-flip/roll, 20-second auto-flip, then suspense and resolution. Blackjack pure rules live in src/lib/plugin-games/blackjack.ts, UI in BlackjackTable.tsx, authoritative route in api/game/plugin. Blackjack uses equal configurable match-only chips (migration 033 owner-confirmed applied); new sessions never debit/credit Ledger wallets. Playing legacy sessions retain transactional wallet settlement. Accepted notes cover requirements only, never add chips. Bonuses use remaining loser chips, rounded down and capped. Decks and opponent hole cards remain hidden. Ledger/BJ cannot overlap on one wallet; reset is blocked during either.

Checks: 77 automated fixtures passed, including 1,000 conserved-chip sessions and repeat-run database/privacy/retry checks. Localhost Blackjack preview exercised bet/match/flip/stand/payout; layouts reviewed at 360, 768 and 1280. Chips are round and fallback card ranks readable; active table fits the available viewport. Real two-phone/network/push/microphone acceptance remains pending. Native release: 1.0.6 (code 7), including raw notification sounds and channels.
