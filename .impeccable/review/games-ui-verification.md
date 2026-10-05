# Games, artwork and tap-message verification — 2026-10-05

- All38 local fixture tests pass. The new game-sessions suite loads the full setup through migration011, tests Tic-tac-toe and ConnectFour boardmoves, Draw & Guess strokes/guesses, sealed KnowMeanswers, BlockBattle readiness and BrainDuel paired answer reveal.
- All six kinds reject solo moves. Explicit leave cancels the shared match; Brain lobby cancellation also prevents preparing jobs from starting a match. Finished/cancelled sessions cannot become active through a presence heartbeat.
- Stale sessions retire on subsequent presence/new-game checks; this is lazy cleanup, not a background cron guarantee. Presence has20-second grace. In-app Play-page departure requests cancellation. Abrupt browser/network disappearance cannot notify the server immediately.
- Cancellation grants no completed-game rewards. Preview board/extra exit marks the local session cancelled; Block preview unmounts its local match.
- Private art row and storage deletion policies restrict removal to the couple. Tests cover outsider denial and own deletion. Removal clears the provider override and restores folder/default artwork.
- ThinkingOfYou customtext is bounded180characters and rate-limited byexisting60-second tap rule. Same structuredtitle/body is sent to webpush and Firebase; SW displays it. Helper/payload tests pass. No actual notification delivery or extra Gemini HTTP calls were made.
- Production build passed after implementation changes. Focused migration tests passed again after idempotency/stale-block-wrapper hardening. Migration011 is safe to re-run; hosted application remains owner-dependent.
- UI sources remove ConnectFour's38px cardoffset and use equal grid columns/stretched labels; wishlist headericon is besideits text and empty-stateicon centered. Stage5promise copyremoved. Every online game has Exitgame with sharedcancellation.
- No newdesktop/mobile renders: localhostbrowserrestriction remains respected. IndependentImpeccablereviewdispositionrecapture; source/test evidence doesnotcertifyresponsivevisualacceptance. Physicaldevicepushacceptanceunverified.
