# Current limits and unresolved issues

Updated 2026-10-06. Keep only actionable current facts; detailed evidence lives in .impeccable/review.

- **Local browser access restored:** permitted in-app browser access succeeded on October 6. Local preview checks covered Home, Settings, Memories and Heartblast/Hold Hands at 360, 768 and 1280 widths; this does not certify authenticated two-device behavior or the complete light/night matrix.
- **Review fixes verified locally:** Hold Hands fallback rectangles were removed; desktop Heartblast now reserves room for Place piece (bottom 877px in a 900px viewport). Phone layout remains unchanged. Evidence: .impeccable/review/LOCAL_REVIEW_2026-10-06.md.
- **One legacy photo remains sealed:** Elaine's October 6 photo is an existing swap, not a missing shared upload. Automatic review rejected changing its visibility without explicit approval. Pending approval remains unanswered. New ordinary album posts are shared; preserve legacy rules.
- **Device/hosted acceptance incomplete:** signed APK and fixture/build checks passed for the previous implementation batch; real device camera/push and current authenticated two-account acceptance have not been certified.
- **Historical records can be stale:** PRODUCT.md and DESIGN.md contain older stage checkpoints. Use PROJECT_SPEC.md for current intended behavior; exact code/schema and fresh evidence take precedence over summaries.
- **Receiving alerts needs device setup:** read-only check found Elaine has no notification preferences/device registration. Local environment lacks Firebase/VAPID/webhook configuration; Vercel settings were not inspected. New direct tap dispatch is implemented, but actual alerts remain unverified. See docs/CONNECTION_CHECKPOINT.md.

Do not store API keys, passwords, service-account data, raw private media or unnecessary account identifiers in these notes.
