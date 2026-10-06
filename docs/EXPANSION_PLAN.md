# Approved expansion — 2026-10-06

Work in small steps and commit. Preserve the current romantic design, privacy and existing Heartblast mechanics. **Stop after Hold Hands for two-phone testing**, per the completed connection brief. The following items are approved scope for later checkpoints, not claims of implementation.

## Current checkpoint

Question emphasis, tap delivery diagnosis/recovery, photo hearts/comments, named music with separate volume controls, and Hold Hands. Owner confirmed applying migrations 014 and 015. Manual checklist: CONNECTION_CHECKPOINT.md.

## Games, in order

- Heartblast gaps first: keep current 37 shapes/plain tiles, duel seed-only trays with small-piece safeguard, single-board Co-op/Daily fitting guarantee, scoring/server replay, modes, deadline/offset/countdown, controls/ghost/line feedback and final boards/breakdown/rematch. Broader pending integration: registry adapters, challenge/accept/decline/play-later and Home invite/push, 60s reconnect options, expanded wins/losses/streak/comeback scoreboard and achievements/coins/XP. No redesign or duel board-dependent dealing.
- Ledger Duel: persistent separate wallets (10 default/configurable/reset; daily free top-up below3), best1/3/5 or broke, secure high-card/Ace-high or d6/d20. Entry fee/extra stake caps; optional140-char kind/doable favor notes and editable suggestions. Both lock; notes owner-only until resolution. Ties retain sealed stacked notes and pot, double stakes/re-ante; transact conservation and wallet math. Winner receives pot, loser notes reveal (winner stays sealed unless reveal-both). Activities Promise Ledger/Home pending card: winner confirms Done, promisor nudge, bilateral Waived, expiry/reminders/proof/recap. Test ties/math/secrecy through direct API.
- Lost & Found: shared seeded5×5/6×6/8×8 items/words, themes/drop-in stickers; each privately hides one immutable treasure. Server Chebyshev/Manhattan hints (temperature/number/both/trend), trails/history; Race/Turns/Relaxed, optional limit/timer. Final trails/treasures reveal. Optional once-per-game coin sonar/magnifier/skip; base free. Prove guesser cannot read treasure via API.
- Sync Steps: different hidden maps, same directional move applies independently, simultaneous exits win. Shared/Turns/Driver controls and optional reveal. Wall/pit/sticky/ice/arrows/keys-doors/push-block/portal tiles with shape+color. Undo/reset/move count/stars vs optimum; optional move cap/hearts. Coordinate pings/text/quick icon chat. 30 hand-checked increasing levels plus Infinite/Daily; BFS complete JOINT state verifies solvability/optimal count and rejects trivial generated puzzles. Server sends only allowed own map; Home daily stats.

Shared contract: id/title/description/cover/setup; createMatch(config,seed), pure applyMove(state,move,playerId), viewer-filtered getPublicState, isOver/getResult. Client/server share logic; server owns outcomes and secret filtering. Metadata/player-private-state/ordered move-log RLS. Existing match_moves is already used by Heartblast: adapt or name new tables distinctly, never replace applied history. Private Broadcast/Presence and authoritative database updates, refresh recovery, challenge flow, reconnect choices. Deterministic puzzle PRNG; secure server randomness for dice/cards. No personal names/gender baked in; You/Partner or nicknames. All games need rewards/scoreboard and cover/background/specific art slots, incumbent fallbacks, sound toggle/haptics, reduced motion and360/768/1280 checks.

## Connections, after Hold Hands test

Build Voice cassettes, then Postcards, then achievements/art/README/manual acceptance. Use master haptics/sounds and user-gesture audio permission, private buckets/signed URLs, recipient opt-in/quiet hours and per-type push. New feature notifications never include message/voice/photo content. Existing customized Thinking of you keeps its intended custom body.

### Voice cassettes

Hold-to-record, permission explainer, live mic waveform/timer/reels; slide-left cancel, slide-up lock, stop/trash. Min1s/default max60s/configurable, warn50s and auto-stop. Preview Send/Re-record/30-char label/color/sticker. Choose supported opus-webm/mp4/opus-ogg, ~32kbps/echo-noise-autogain; target<300KB/60s must be measured. Exactly64 normalized peaks, decode fallback. Android RECORD_AUDIO/WebView permission documented/device-tested. Pause shared music during recording; save interruption; IndexedDB queue with idempotent sends.

Notes cassette shelf/new ribbon/arrival animation and Home latest. Player sheet: reels spin only while playing, waveform scrubbing, ±5s,1/1.25/1.5×, loop/favorites, Media Session. Sent/Delivered/Listened, reactions/reply. Private voice-notes storage; voice_messages(sender,path,mime,duration,peaks,label,color,timestamps,favorites), Realtime not polling. Keep forever default, shared configurable300MB soft cap, block politely, ZIP export/delete-old. No transcripts/AI; generic voice push.

### Postcards

Entry Memories/Notes/Home; box collection in Memories. Fullscreen studio stages photo/front/back/preview. Camera/gallery/memory/plain patterned paper, downscale/strip metadata;3:2 landscape/portrait pinch-and-drag crop. White border/paper shadow. Filters Original/Warm/Rosy/Dreamy/Vintage/Mono. Smoothed pressure pen/marker/crayon/glitter/neon/heart trail, eraser/colors/custom/size/undo-redo. Built-in/drop-in stickers(max60): drag/pinch/rotate/select/z-order/duplicate/delete/flip/squish. Text Caveat+free compatible fonts, outline/highlight/curve/bubble/label. Scallop/polaroid/film/torn/lace frames; perforated stamps/date-heart postmark(default back top-right).

Back divider, handwritten280-char message/counter or drawn message, stamp/address(nickname or To my favorite person), optional place/date. Preview700ms flip; seal/envelope-color/wax-squish/flight sparkle, optional haptic/whoosh. Receive generic push, sealed envelope Home/box; crack/flap/card reveal/hearts, front-first flip, layer stagger. Reply/react(heart/sparkle/kiss)/Save to Memories/download/favorite; fanned box/grid/favorites pinned wall. Future-date seal enforced server-side: no image/message/layers/signed URL to recipient before unlock.

Private postcards bucket/table(paths,layers JSON,message,envelope,stamp,unlock/timestamps/favorites). JSON layered document plus flattened front/back fallback; WebP long-side~1600/80%, target<400KB each, offscreen export/low-memory limits. Autosaved IndexedDB drafts/queue, exactly-once sending,7-day orphan draft cleanup/soft cap. No AI/public/share links.

## Final integration and tests

Hold Hands:400ms release grace,5s reconnect, wake lock, heartbeat/merge/milestones5/15/30/60/confetti; store only>=3s merged duration;10min invite/no push when present; stats/recap/rewards. Achievements: First touch/One minute/Five minutes, Chatterbox(10)/Cassette collector(25), First postcard/Postcard collector(10)/Wish you were here(place). Cosmetic coin/XP unlocks only; recap hold time/voice/postcards/promises.

Art families: holdhands(background,left/right/merged hearts,mascot); voice(background,body,label,reel,record,mascot); postcard(background,paper,envelope,seal,stamps,postmark,box,mascot,frames); games(cover/background plus requested avatars/tiles/treasure/cards/coins/dice/seal/paper). Preserve private/drop-in precedence.

Tests: anonymous/outsider rows/files fail; sealed notes/treasures/locked postcards never leak; hold two-state grace/reconnect;64 valid peaks/MIME; offline sends once; joint maze solvability; Ledger conservation/ties; Heartblast fairness/parity. Real two-phone/Android/iPhone checks and all widths/themes when permitted; unavailable captures are not passing evidence. README microphone setup/storage/assumptions/manual checklist. Prefer existing utilities/canvas before a new library.
