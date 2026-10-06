# Current limits and unresolved issues

Updated 2026-10-06. Keep only actionable current facts; detailed evidence lives in .impeccable/review.

- **Local browser review blocked:** automatic approval review rejected localhost browser access under a protocol/security restriction and rejected a retry. Do not retry via another browser, alternate URL or rendering workaround. CLI server/type/build checks are separate evidence. Last check: localhost server ready/listening and typecheck passed; full current screenshot matrix is unverified.
- **One legacy photo remains sealed:** Elaine's October 6 photo is an existing swap, not a missing shared upload. Automatic review rejected changing its visibility without explicit approval. Pending approval remains unanswered. New ordinary album posts are shared; preserve legacy rules.
- **Device/hosted acceptance incomplete:** signed APK and fixture/build checks passed for the previous implementation batch; real device camera/push and current authenticated two-account acceptance have not been certified.
- **Historical records can be stale:** PRODUCT.md and DESIGN.md contain older stage checkpoints. Use PROJECT_SPEC.md for current intended behavior; exact code/schema and fresh evidence take precedence over summaries.
- **Receiving alerts needs device setup:** read-only check found Elaine has no notification preferences/device registration. Local environment lacks Firebase/VAPID/webhook configuration; Vercel settings were not inspected. New direct tap dispatch is implemented, but actual alerts remain unverified. See docs/CONNECTION_CHECKPOINT.md.

Do not store API keys, passwords, service-account data, raw private media or unnecessary account identifiers in these notes.
