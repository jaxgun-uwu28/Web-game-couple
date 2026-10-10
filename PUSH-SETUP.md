# Optional private push setup

Push uses a generic message without note text, photos, claims or Secret Ideas. Both people opt in separately in Us. Preferences default off, with quiet hours 22:00–08:00 Asia/Manila. No push has been delivered in verification yet.

1. Run `npm run push:keys`. Copy the variables from the ignored `.local-signing/push.env` into Vercel Environment Variables. The public VAPID key must be named NEXT_PUBLIC_VAPID_PUBLIC_KEY. Never put the private VAPID key or webhook secret in a NEXT_PUBLIC variable.
2. Add SUPABASE_SERVICE_ROLE_KEY to Vercel only. Do not put it in client code or chat. Redeploy after adding build-time public variables.
3. For Android, create a Firebase project and Android app with package `com.ourlittlearcade.app`. Download `google-services.json` into `android/app/`, which Git ignores. Enable Cloud Messaging. Add the Firebase Admin service account JSON as FIREBASE_SERVICE_ACCOUNT_JSON in Vercel. Rebuild the APK after adding the Android config. Use Firebase's free project tier; no paid service is required for FCM itself.
4. Apply migration 007. Create Supabase Database Webhooks for INSERT and UPDATE on wishlist_items, memories, love_notes, connection_taps and games. POST to `https://web-game-couple.vercel.app/api/push`, with `Authorization: Bearer <PUSH_WEBHOOK_SECRET>`. The endpoint re-reads the row and derives recipients on the server. Do not create a webhook for wishlist_claims.
5. On each device sign in, save notification choices with Allow updates checked, then press Enable this device. Accept the OS prompt yourself. iPhone web push requires a supported iOS version and the site installed on the Home Screen.

The current sender is best effort: it deduplicates event IDs, deletes expired device tokens, and skips quiet hours rather than postponing notifications. Repeated changes are distinct events. A new dated letter sends an arrival update; its sealed content remains unavailable until the date. Scheduled anniversary reminders are local Android notifications and need a separate permission.

If the settings work but no push arrives, check Vercel function logs, Supabase webhook logs, the device opt-in and quiet hours, Firebase package/config, and server environment variables. Missing configuration does not prevent ordinary app use.

References: https://capacitorjs.com/docs/apis/push-notifications and https://firebase.google.com/docs/cloud-messaging/send/admin-sdk

### Cute chimes and snap previews
Run migration 035_notification_chimes.sql. Install APK 1.0.6 or newer, open it once to create the sound channels, then use Settings > notification chime, preview a sound and Save notification choices. Each recipient chooses their own chime. Android system notification settings can override channel sound or silence it. Browser/PWA background sound is controlled by the browser/OS; custom chimes are previewable in Settings.
Letter, postcard and ordinary snap sends call the authenticated /api/push/media endpoint, so they do not require extra database webhooks. Existing webhook retries are deduplicated. Snap previews use private signed URLs valid for 15 minutes and FCM messages expire after 15 minutes. Sealed swaps omit images. Photos may appear on the lock screen depending on OS privacy settings.
Device checklist: send a letter, postcard and ordinary snap from the partner account with the recipient app foreground, background, then locked; check only the recipient gets each notification, snap shows a photo, each selected chime sounds, disabled types/quiet hours remain quiet, and sealed swaps show no private preview.
