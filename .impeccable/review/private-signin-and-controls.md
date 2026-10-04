# Private sign-in and block controls

User reported all active games rejecting sessions as expired invitations, and supplied a Block Blast clip showing tray dragging onto a block board.

Changed active sign-in to existing-email/password authentication, with the same two supplied emails enforced in the UI and verified-user game route. Existing private profile and database authorization remains required. No public signup. No password or service-role credential was obtained. Games resolve current session tokens, refresh near expiry and retry a 401 once; a server auth outage is reported separately.

Added pointer-captured tray dragging, whole-shape boundary clamping, centered shape graphics, colored tray pieces, subtle block relief and reduced-motion-aware clear feedback. Invalid/outside drops return to the tray. Keyboard/tap controls remain available. Video decoded locally for reference only; footage is not an app asset.

18 tests pass and production build passes, including all-shape boundary, expired-session refresh, 401 retry and non-auth-error checks. Browser verified desktop drag-to-bottom-right placement (20 points), outside drop (no score change), and alternative controls. Sign-in and gameplay captures cover desktop and 360px mobile. No real password sign-in or hosted two-device game was tested; the user supplies existing passwords privately in the form. No schema update beyond existing game migration 004 is required.

Follow-up report confirmed the underlying local server problem: sandboxed Node requests to Supabase failed with `EACCES` and AuthRetryableFetchError status 0. The same public settings request outside that restriction returned HTTP 200. Restarted only the verified WebProject dev process tree with network access, on port 3000. Kept authentication verification enabled.
