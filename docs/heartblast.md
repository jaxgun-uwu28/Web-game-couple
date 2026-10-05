# Block Hearts Duel rules

Canonical shapes, style names and scoring constants live in `src/lib/heartblast-rules.json`. `src/lib/heartblast.ts` implements the shared scoring calculation; `scripts/generate-heartblast-rules.mjs` embeds the same constants in migration 012. Regenerate and apply a new migration when changing rules on a deployed database. Old matches retain the legacy handler.

Placement scores one point per cell. A move clearing L lines scores `10 × L² × multiplier`, rounded down. Consecutive clearing placements increase the multiplier through 1, 1.5, 2, 2.5 and 3; a placement without a clear resets the streak. Clearing the whole board adds 100. Final ties use fewer placed pieces, then a draw.

The 37 fixed-orientation shapes include the requested bars, rectangles, squares, small/large L orientations, T orientations, S/Z and diagonals. The count exceeds the approximate 20–25 to include the requested orientations without allowing rotation. Both players receive the same seed/tray sequence. One small piece is included deterministically; duel trays do not inspect either board. A used tray is replaced only after all three pieces are placed. Co-op and Daily Challenge may replace the first piece with a single if none of the generated pieces fits the single board.

Timed matches start three seconds after both Ready actions. Server clock samples use client request midpoint to estimate offset. Placements accepted within the one-second grace are included; finalization occurs after that grace. An out player is frozen while the other plays until time ends. Race ends under the match lock on the first accepted target-reaching placement; if both boards run out first, compare final scores. Endless players may Ready independently and finish within 24 hours of creation. Their opponent board/score remains hidden in the game until completion. Explicit Exit cancels a shared match in every mode; ordinary navigation preserves asynchronous Endless/Daily runs. Expiry is enforced on the next request, not by a background scheduler.

Co-op uses board/score/tray index zero and alternates actor seats. Its best completed score is the shared record. Versus Junk is disabled for Co-op/Daily. A multi-line clear sends at most two sleepy clouds, capped at four on the receiving board; placement is skipped if it would remove the last legal move. Sleepy clouds also clear when an adjacent row or column clears.

`match_moves` stores accepted actions with actor, unique move ID and server timestamp. Every placement replays the accepted history under the locked match row before deriving the official state and score. Client-supplied boards/scores are ignored. Broadcast board/score previews are throttled and decorative; results come from server state.

Daily seed/date use Asia/Manila. The couple shares one run record with two independent solo boards each day; Home compares scores. Each board may finish manually or when no legal placement remains. The same daily record is returned on reopening.

Artwork slots: `heartblast-cover`, `heartblast-background`, `heartblast-board-background`, `heartblast-block-1` through `heartblast-block-5`. Defaults use original geometry and the existing Lucide icon family with pastel fills. No third-party block-game artwork or branding is used.
