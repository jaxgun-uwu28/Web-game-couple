## verdict

1. Resolved — AI settings recovery: revised src/components/AIQuestions.tsx calls setError("") after successfully installing status and timezone. Both Retry settings and reopening the disclosure use this load() path, so a successful load clears the earlier failure state. This resolution is source-verified; parent reports typecheck passed. Re-read original settings-top/settings-bottom day/night captures at 360/768/1280/624: the unchanged, explicitly labeled read-only sample layout remains valid, with no fix-batch visual regression. These captures do not demonstrate an online failure followed by recovery.

## remaining

Clear for the single scored source-state fix. This ship covers the scored fix, not the whole surface. Live Gemini, hosted migration, live account settings recovery and two-phone synchronization remain unverified owner acceptance boundaries; no live recovery screenshot was supplied or implied.

disposition: ship
