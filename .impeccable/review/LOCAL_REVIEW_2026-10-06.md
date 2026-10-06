# Local preview review

Permitted Codex in-app browser access to localhost:3000 succeeded. Used PROJECT_SPEC.md and ARCHITECTURE.md; no live AI requests, online messages, uploads or pushes. Restored viewport override after review.

Observed: daily-question highlight is distinct; Settings exposes separate background/game volumes and sounds/haptics controls; Memories opens its empty local album with Snap and Archive; browser console returned no warnings/errors. Heartblast waits for both fixture players to ready, counts down, accepts a placement (+3), advances selection, and Exit returns to Play. At 360×800 all three tray cards and Place piece are visible, with square cells and no horizontal overflow. At 768×1024 board bounds were 560×560, inside viewport. At 1280×900 cells were square and opponent preview was alongside board.

Findings: Hold Hands generic artwork fallback applies a rectangular plum background to each heart; it remains visible when merged. Screenshot: hold-hands-local-2026-10-06.jpg. Heartblast desktop Place piece extends below the 900px viewport. These were recorded, not changed during this review.

Limits: Hold Hands merge used the explicit simulated-partner preview. No authenticated two-account, physical camera, push, audible music handoff, reconnect or full theme-matrix certification. Photo reactions/comments cannot be exercised on the empty preview album without adding media.

Follow-up fixes: scoped CSS makes Hold Hands fallbacks transparent and hides overlapping pad labels during merge. Desktop Heartblast reserves extra vertical space, including preview player controls. Browser confirmed transparent fallbacks at 360×800 and Place piece fully visible at 1280×900 (bottom 876.8px). Evidence: hold-hands-fixed-2026-10-06.jpg and heartblast-desktop-fixed-2026-10-06.jpg. Typecheck passed; mechanics and database unchanged.
