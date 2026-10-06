# Targeted file map

Read the row relevant to the task, then follow actual imports. Paths are relative to this repository. This is a routing map, not a second specification.

| Area | Start here | Related source / checks |
|---|---|---|
| Entry, sign-in, shell, Home, Settings | src/components/StageOne.tsx | src/lib/private-auth.ts, src/lib/supabase.ts, src/app/page.tsx, src/app/globals.css |
| Existing arcade coordination | src/components/Arcade.tsx | src/components/PlayArcade.tsx, src/components/GameCover.tsx |
| Board games and shared surfaces | src/components/GameSurface.tsx | src/lib/games.ts, src/lib/game-request.ts, src/lib/use-game-presence.ts, src/app/api/game, src/app/arcade.css |
| Drawing / partner games | src/components/ExtraGame.tsx | src/components/Doodle.tsx, src/lib/extra-games.ts |
| Brain lobby / Gemini | src/components/BrainDuel.tsx | src/components/AIQuestions.tsx, src/lib/ai, src/app/api/brain, src/app/api/ai, migrations 009–010 |
| Heartblast | src/components/BlockBattle.tsx | src/lib/heartblast.ts, src/lib/heartblast-rules.json, src/lib/block-battle.ts, src/app/block-battle.css, scripts/generate-heartblast-rules.mjs, migrations 004/012, tests/heartblast*.test.ts |
| Daily Heartblast / Home comparison | src/components/DailyHeartChallenge.tsx | Heartblast files above |
| Daily prompts, moods, taps | src/components/Connections.tsx | src/lib/connections.ts, src/app/connections.css, migrations 005/009/011 |
| Memories / camera | src/components/MemoryAlbum.tsx | src/components/NativePhotoButton.tsx, src/components/Keepsakes.tsx, src/lib/memory-album.ts, src/lib/keepsakes.ts, src/app/keepsakes.css, migrations 006/013, tests/keepsakes.test.ts |
| Notes / wishlists | src/components/Keepsakes.tsx | src/lib/keepsakes.ts, src/app/keepsakes.css, migration 006 |
| Activities / wheel | src/components/TogetherActivities.tsx | src/components/Activities.tsx, src/components/SpinWheel.tsx, src/lib/together.ts, src/app/together.css, migrations 008/012 |
| Artwork | src/components/ArtSlots.tsx | scripts/asset-slots.mjs, public/drop-in, existing Slot/useAsset definitions and generated manifest |
| Music | src/components/Ambience.tsx | public audio assets, existing preference controls |
| Music settings / coordination | src/components/MusicControls.tsx | src/lib/music.ts, game music hooks and Ambience |
| Hold Hands | src/components/HoldHands.tsx | src/lib/hold-hands.ts, migration 015, src/app/api/push/hold, tests/hold-hands*.test.ts |
| Photo hearts/comments | src/components/MemorySocial.tsx | migration 014, tests/keepsakes.test.ts |
| Push / PWA | src/components/InstallSupport.tsx | src/lib/push.ts, src/app/api/push, src/app/manifest.ts, scripts/prepare-sw.mjs, migration 007 |
| Android / icons | capacitor.config.ts | android/app/build.gradle, scripts/build-android.mjs, scripts/generate-app-icons.mjs, scripts/generate-android-art.mjs, public/icons |

Commands: `npm run dev` (localhost:3000), `npm run typecheck`, `npm test` (fixtures), `npm run build`, `npm run android:build`. Focused tests: `node --import ./tests/gemini-env.mjs --import tsx --test tests/<relevant>.test.ts`. Do not run `gemini:check` under the exhausted live-call allowance.

Migrations and RLS are authoritative for online data access. Read later migrations that replace the affected RPC/policy. Tests use local fixtures/database emulation; they do not verify the hosted deployment.
