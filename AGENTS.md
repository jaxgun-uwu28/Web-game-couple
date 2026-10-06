# Focused development workflow

Read `PROJECT_SPEC.md` first. Consult only the relevant row of `ARCHITECTURE.md`; read `TODO.md` or `KNOWN_ISSUES.md` when the task concerns pending work or a reported failure. Historical PRODUCT/DESIGN/review records are optional references, not mandatory startup reads.

- Implement the requested scope directly. Inspect relevant files first with targeted searches; expand only when dependencies or evidence require it.
- Reuse existing components, utilities, tokens and libraries. Do not rewrite, redesign or refactor unrelated working code, add unrequested features, or change architecture without task justification.
- Keep terminal output bounded. Report useful errors and test summaries, not entire logs. Never print secrets or read environment values just to rediscover configuration.
- Run checks appropriate to the change. Documentation-only changes need link/content checks; behavior changes need relevant tests/typecheck, and build when bundling or production behavior is affected. Do not repeat passing checks without new changes or unresolved concerns.
- Update compact references only when facts change. Replace stale facts instead of appending chronological checkpoints. Keep PROJECT_SPEC.md approximately 1–3 pages; store detailed evidence in existing review records.
- Keep progress and final reports brief: outcome, changed files, checks and remaining material issues. Stop when requested acceptance criteria are satisfied, or report a real blocker accurately.
- Use existing approved UI for routine fixes. Propose a design separately only when the user requests planning or the design decision materially needs clarification; do not introduce routine approval pauses.
- Follow applicable skills and permission rules. Do not retry or bypass explicitly blocked browser actions. Do not treat previous build/source checks as current visual or device acceptance.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
