# Gemini questions setup

1. In Supabase SQL Editor, apply migration 009, then `supabase/migrations/010_brain_lobby.sql`. Migration 010 adds the two-player lobby and protects sealed daily prompts during AI upgrades.
2. Keep `GEMINI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel's server environment. Neither may have a NEXT_PUBLIC_ prefix. The APK uses the HTTPS site; no server key belongs in Android files.
3. In Vercel → project → Settings → Environment Variables, add/edit `GEMINI_MODEL` as Config with value `gemini-3.5-flash-lite` for Production. Alternatively remove that variable to use the same default. Save, then redeploy. Access and quotas depend on the Google project; use an unbilled project for free usage.
4. In Settings → AI Questions, enable AI and check model/error status. Actual generation attempts are capped globally at 4/minute and 60/day; Google's limits may be lower. Three failures pause AI for ten minutes.
5. Both accounts open Play → Brain Duel. One creates the lobby; the other joins. The host selects a topic (or custom topic), Easy/Medium/Hard and 3/5/10 questions, then saves the setup. Both choose I’m ready. Only the host can start. Changing setup resets both ready checks. Stay on the page while questions prepare.

New online duels use unseen Gemini bank questions or generate a batch with extra items for later. Hardcoded trivia is never used for new online matches. If Gemini cannot supply enough valid questions, the lobby shows an error instead of starting a sample pack. Correct answers remain private until both seal their answers. Leaving or stopping heartbeats pauses answer writes; returning players mark themselves ready again. Server-checked presence expires after 20 seconds.

Daily questions and Would You Rather share one 30+30 Gemini batch, generated when fewer than seven days remain or fallback dates need upgrading. Upgrade attempts are serialized and limited to once an hour. Sealed dates retain their original prompts; unsealed fallback dates can become AI content. Saved daily content remains available during outages and is labeled. Names, profiles, dates and personal answers are never sent to Gemini.

Development and automated tests use fixtures. The explicit diagnostic on 2026-10-05 made exactly three Google HTTP requests: model list (200), five trivia questions (200; all valid), and thirty daily prompts plus thirty pairs (200; all valid), using gemini-3.5-flash-lite. No retries. These manual calls were outside the hosted SQL usage ledger because the local server-role key was absent; production always reserves SQL budget first. No additional live tests are authorized by that three-request diagnostic.

For a later explicit one-request manual check, `npm run gemini:check` requires the local server-role key and reserves shared budget without logging keys.

Official references: [Models](https://ai.google.dev/gemini-api/docs/models), [Billing](https://ai.google.dev/gemini-api/docs/billing), [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), [Structured output](https://ai.google.dev/gemini-api/docs/structured-output).
