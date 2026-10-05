# Installation surface
Mode: Operate. Extend the approved pink keepsake world with plain installation guidance and a single notification preference form in Settings. Reuse Fredoka/Nunito, cherry controls, token surfaces and 48px actions. No permission prompts before an explicit button. Show setup and transport failures honestly. Preview requests no permission. Current installation copy omits internal Stage 5 labels; source review is not current rendered or device acceptance.

Web targets: 360, 768, 1280 pixels; dark and inherited daylight palettes. Captures in review/installation. Android is a Capacitor WebView loading the deployed HTTPS origin, with code-native icon/splash art. The signed APK build and signature are verified; real device captures and notification delivery are owner-dependent and unverified.

## Owner-supplied kitty icon

The default web favicon, PWA icons and Android launcher/splash source now use the owner's kitty doodle JPEG, preserved at `public/icons/kitty-original.jpg`. Its white background is opaque; the file's name does not establish transparency. Icon generation trims empty white margins, fits the character within the launcher safe area and emits PNG variants. Local icon-foreground/background drop-ins can still override this default. The shell brand uses the generated kitty icon, replacing the earlier heart mark.

This supersedes the original geometric heart/gamepad icon described above. Existing APK verification is historical; a native icon change needs a newly built and installed APK, and the new build/device status must be reported separately. Current web and physical-device rendering are unverified.
