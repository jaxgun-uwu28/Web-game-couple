# Games and UI documentation checkpoint

Documenter pass is bounded to product and surface behavior documentation. DESIGN.md and .impeccable/design.json are preserved: the existing palette, fonts, component tokens and keepsake world remain unchanged.

Sources checked: src/app/globals.css, src/app/arcade.css, src/app/keepsakes.css; src/components/ArtSlots.tsx, PlayArcade.tsx, ExtraGame.tsx, BlockBattle.tsx, BrainDuel.tsx, Connections.tsx and Keepsakes.tsx; src/lib/use-game-presence.ts and push.ts; src/app/api/push/route.ts; supabase/migrations/011_game_presence_and_taps.sql; PRODUCT.md, DESIGN.md, .impeccable/design.json and the settings, stage-two, ai-questions, connections and installation briefs. The Impeccable documenter agent contract and reference/document.md were read.

The source supports Exit game on all six games; same-game presence gates; explicit exit/page cleanup cancellation attempts; stale-session retirement at the next presence/new-game or Brain lobby check; preview board/extra cancellation on explicit exit; exclusion of cancelled sessions from rewards; private artwork removal; aligned cartridge tracks; wishlist heading/empty-state correction; and optional 180-character thinking-of-you messages. Firebase and Web Push share the sanitized notification body and nickname/action title. The optional composer discloses lock-screen exposure; delivery retains opt-in/quiet-hours boundaries.

Migration 011 application is not acknowledged. All 38 fixture tests and the production build passed; the focused database suite passed again after final migration hardening, including applying 011 twice. No browser, network, live Gemini or push calls were made by this documentation pass. The previous exactly-three live Gemini checks remain historical evidence. Current captures are missing, so the review disposition remains recapture. The user-provided earlier screenshots identify the problems; they do not establish current layout/contrast acceptance. Hosted two-account behavior, device UI and push delivery are unverified.

Palette: warm cream/white paper, berry ink/cherry actions, strawberry/blush/peach/lavender/butter surfaces and inherited plum night palette.
Type: Fredoka headings, Nunito Sans body and Caveat short notes; existing fluid heading and body hierarchy preserved.
Layout: rounded keepsake pages, generous controls, desktop rail/mobile navigation; cartridge equal grid tracks are a surface correction.
Components: existing pill actions, rounded fields and paper panels; added behavior reuses incumbent controls.
Rules: keep honest private/preview states, explicit recovery and reduced-motion behavior; cancellation is distinct from rewarded completion.

Not canonized or repaired: missing current visual captures and owner/device acceptance remain evidence gaps; pre-existing DESIGN.md format or historical checkpoint drift was not rewritten as a new system rule.
