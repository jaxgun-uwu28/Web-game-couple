# Install Our Little Arcade

The Android app opens https://web-game-couple.vercel.app/. Updates to the website appear in the app without reinstalling the APK. Native plugin or icon changes require a new APK signed with the same key.

## Android

Copy `dist-apk/our-little-arcade-release.apk` to your phone and open it. Allow installation from the app you use to open that file if Android asks. Sign in using one of your two existing Supabase accounts. No new invitation link is needed.

Keep a private backup of `.local-signing/` somewhere safe. It contains the signing key and its passwords, needed to update this installation. Never commit or share it publicly. The release is signed locally; it has not been installed or tested on your phone yet.

Rebuild with `npm run android:build`. Android Studio's Java 21 runtime and Android SDK 36 are required. The GitHub workflow produces a debug APK automatically; signed CI releases require the signing secrets named in `.github/workflows/android.yml`.

## Home Screen

Android Chrome: open the website, then use Install app / Add to Home Screen. iPhone: open it in Safari, tap Share, then Add to Home Screen. The Us page includes the install guide and notification choices.

The service worker caches the public app shell and static assets only. It never caches private photos, API responses, signed URLs or Supabase responses. Only new wishlist items can queue offline. Queued wishes remain scoped to the original account; sign back into that account to sync them or discard them in Us.

## Supabase and notifications

Run migrations 006 and 007 once in the new project's SQL Editor, after the previously applied 001–005. See PUSH-SETUP.md for optional device push. Photo uploads and push registration need these tables and policies before they can work online.

In Supabase Authentication URL Configuration, set Site URL to `https://web-game-couple.vercel.app` and allow that origin as a redirect. Keep public signups disabled. The app still accepts only the two provisioned account emails.

Before considering installation complete, check on both real phones: sign in/out/in, refresh, live game turns, private photo uploads, wishlist updates, hidden gift claims, a future-dated letter, notification opt-in and quiet hours. Native push remains unconfigured until Firebase and server secrets are supplied.

References: https://capacitorjs.com/docs/config and https://capacitorjs.com/docs/getting-started/environment-setup
