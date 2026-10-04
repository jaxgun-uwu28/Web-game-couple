# Our Little Arcade — pink keepsake design

A pocket keepsake book: strawberry cover, lavender question page, framed personal artwork. Desktop side rail and mobile bottom bar. Home opens on the anniversary, not a marketing hero or card grid.

Palette: canvas #FFF8F3; white #FFFFFF; ink #50313F; muted #795562; strawberry #F8C9D8; blush #FFE6EC; cherry #9D304F; peach #F8DCC4; lavender #EAE1F5; butter #F7E6A6. White on cherry and berry on pastels meet AA. Night: canvas #261C2B, surface #38283E, ink #FFF0F4, muted #D8BCCA, cherry #F7B5CD with plum foreground. Never pure black.

Fredoka headings, Nunito Sans body, Caveat short notes; Google Fonts/SIL OFL with rounded sans fallbacks. Fluid headings to 64px. Spacing 4/8/12/16/24/32/48px, 44px minimum controls, safe-area padding. Keepsake corners 28px, substantial pill buttons, soft offset shadows and 3px focus.

One spring flourish celebrates the date; controls squish on press. Reduced motion disables animation. Night follows local time with manual toggle. Night Train loops off by default.

Artwork uses Slot/useAsset: signed private app-art images, generated local manifest, then icon/gradient fallback. No fabricated couple photographs. Slot sizes and filenames live in scripts/asset-slots.mjs and each public/drop-in folder README. Local uploads override defaults. Uploads are rasterized to WebP and strip metadata. Lucide ISC; fonts OFL; music is user-supplied (CREDITS.md).

Stage 1 boundary: working Home/setup and Us/Art Slots. Daily question uses the existing sealed-answer RPC after sign-in. Play, Memories, Notes, mood, nudges and wishlist remain clearly marked later-stage features until approved implementation.
