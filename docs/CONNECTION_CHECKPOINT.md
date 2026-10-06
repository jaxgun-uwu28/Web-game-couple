# Two-phone checkpoint

Owner confirmed migrations 014_memory_social.sql and 015_hold_hands.sql applied on 2026-10-06. Both passed local database tests including reapplication.

1. Sign in separately on both devices. Home → Hold hands. Hold both hearts or use Hold for me; check merge/timer/split, <400ms finger lift,30/60s milestones and Activities → Moments held. Test reconnect and Android heartbeat/iPhone visual fallback.
2. Settings → Music & feel controls background/game volume, game music, effects and haptics. Background remains opt-in via music icon. Start each supplied-track game: background pauses; leaving resumes only if previously enabled. Know me by heart has no supplied track. Check silent volumes and no overlap.
3. Memories → open photo → Heart/comment; verify partner sees it, second heart tap removes it, archived/sealed content stays protected.
4. On the receiving device enable/register notifications in Settings, enable Thinking of you/Hold my hand, save and check quiet hours. Android needs permission/Firebase build; web needs deployed service worker/VAPID. Send a custom tap and check lock screen/in-app. Hold invite is generic and limited10min.

Read-only diagnosis: Elaine has no saved notification preferences or device registration. Lance has Android registration/taps enabled/quiet22–08 Asia/Manila. Elaine must register on her own device. Local environment lacks Firebase, VAPID and PUSH_WEBHOOK_SECRET; Vercel configuration was not inspected. No live notification was sent. Authenticated taps now dispatch without requiring a database webhook, and saved-versus-delivered feedback differs; failed delivery with no success can retry.

53 fixture tests and the final production build passed. Typecheck passed. The public Vercel service-worker fingerprint matches current source; localhost was restarted successfully. Permitted local browser preview review succeeded October 6; see .impeccable/review/LOCAL_REVIEW_2026-10-06.md for scope and visual findings. Real audio/haptics/push/two-account acceptance remains to test. Stop here for Hold Hands testing; remaining scope is in EXPANSION_PLAN.md.
