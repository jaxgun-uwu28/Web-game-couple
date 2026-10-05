# Our Little Arcade — pink keepsake design

## Heartblast and album refinement, October 6 2026

Heartblast uses square wells and chunky raised plain-color tiles; the owner's latest plain-block correction supersedes emblem decoration. Light wells are blush-grey, night wells deep plum; six mode-specific tile tokens contrast at least 4.5:1 with both well shades. Board, tray and preview share these tokens, with a compact multiplier pill and viewport-driven sizing. Memories uses real photo covers grouped by day and a focused viewer. The supplied couple-kitty JPEG is the default identity and sign-in artwork. Existing global palette and typography remain unchanged. Current responsive/device acceptance requires fresh captures.

A pocket keepsake book: strawberry cover, lavender question page, framed personal artwork. Desktop side rail and mobile bottom bar. Home opens on the anniversary, not a marketing hero or card grid.

Palette: canvas #FFF8F3; white #FFFFFF; ink #50313F; muted #795562; strawberry #F8C9D8; blush #FFE6EC; cherry #9D304F; peach #F8DCC4; lavender #EAE1F5; butter #F7E6A6. White on cherry and berry on pastels meet AA. Night: canvas #261C2B, surface #38283E, ink #FFF0F4, muted #D8BCCA, cherry #F7B5CD with plum foreground, butter #66512F. Night butter supports readable light text on yellow game and activity surfaces. Drawing paper stays #FFF8F3 in both modes so the fixed cherry, plum, lavender and brown inks retain contrast. Never pure black.

Fredoka headings, Nunito Sans body, Caveat short notes; Google Fonts/SIL OFL with rounded sans fallbacks. Fluid headings to 64px. Spacing 4/8/12/16/24/32/48px, 44px minimum controls, safe-area padding. Keepsake corners 28px, substantial pill buttons, soft offset shadows and 3px focus.

One spring flourish celebrates the date; controls squish on press. Reduced motion disables animation. Night follows local time with manual toggle. Night Train loops off by default.

Artwork uses Slot/useAsset: signed private app-art images, generated local manifest, then icon/gradient fallback. No fabricated couple photographs. Slot sizes and filenames live in scripts/asset-slots.mjs and each public/drop-in folder README. Local uploads override defaults. Uploads are rasterized to WebP and strip metadata. Lucide ISC; fonts OFL; music is user-supplied (CREDITS.md).

Stage 2 extends the approved keepsake world into a small arcade. Play uses two cartridge entries: a strawberry Tic-Tac-Toe with cross/ring pieces and a lavender Connect Four with cross/heart tokens. Each opens a focused start screen, then a tactile board, turn HUD, all-time rivalry ribbon and result screen. Boards use geometry rather than stock illustrations; optional artwork resolves through existing slots. Game sound stays off by default; a short synthesized tap sound needs no external audio asset. A single falling confetti moment marks a result, disabled with reduced motion. Online identity comes from the two linked account seats; nicknames are optional and entered in Us. Preview explicitly uses pass-and-play on this device. Memories and Notes have honest later-stage landing screens; wishlists follow in Stage 4.
# Block Hearts Duel addition

The new cartridge keeps the approved pink keepsake direction: a butter cover, large geometric pieces, pink score-and-clock ribbon, and lavender partner board. Touch aiming, an explicit placement button and 44px arrow controls support phones; keyboard controls and spoken shape/placement feedback support non-pointer play. The result preserves final scores and offers a rematch. Reduced motion respects the existing setting.

## Stage 3 connection pages

Daily questions remain beside the anniversary on their lavender page. Would You Rather uses a butter/lavender pair of large choice tiles, followed by a quiet shared reveal and match percentage. Mood uses labeled Lucide icons in a horizontal picker, an optional note and expandable history. A full-width peach ribbon holds Thinking of you. Activities stack on phones and tablets to keep controls generous. Night uses the existing plum tokens. Preview seat controls are explicitly local; online identity remains the authenticated profile. No new external artwork or fonts are needed.

## Stage 4 keepsakes

Wishlists extend Us with named tabs, paper wish rows, heart levels, an animated butter wish-jar pick and a focused bottom sheet. Memories uses a chronological photo-led album, with captions in the existing handwritten face. Notes uses peach envelopes and white reading paper. Existing tokens, type and 28px keepsake corners remain authoritative. Every private upload is compressed/rasterized; absent photos use honest empty states. Secret ideas and claims have no shared notification or broadcast. Date seals and daily photo swaps are enforced before content or signed media reaches the other account.

Stage 5 extends Us with installation guidance, opt-in notification choices and quiet hours, inherited from the same typography and palette. The public offline shell never stores private server responses. Android packaging uses the deployed HTTPS origin and an original heart/gamepad geometric icon; no new visual system is introduced.

## Stage 6 games and together activities

The current implementation extends the existing cartridge collection with Draw & guess, Know me by heart and A little brain duel. Their focused stations use peach, blush and butter respectively, with the incumbent Fredoka headings, Nunito Sans labels, cherry actions and rounded paper choices. Drawing uses a fixed cream canvas and cream ink pots in both palettes, with named ink controls; paired answers stay sealed until reveal. Loading, saving, error and local pass-and-play messages make state explicit. A save gate prevents overlapping drawing saves and shows “Saving your mark…” while persistence completes.

Us adds named activity tabs: Dates, Sketchbook, 36 questions, Countdowns, Silly stakes and Our year. Editable date rows accompany the spinning picker; conversation prompts use a reading page; countdown rings show elapsed waiting time. The recap uses visible memories and fulfilled wishes. Earned theme and sticker choices use existing lavender/peach colors and geometric icons, without purchased currency or new artwork. The shared sketchbook uses the same fixed cream paper as the drawing game.

Rendered review accepted 80 required captures across the 360/768/1280 day/night matrix and supplements. The four material findings were corrected in one batch: cream ink-pot grounds, one active Back to Play control, conditional local-preview descriptions with user-facing retry recovery, and distinct saving/live/completed drawing instructions with final guess counts. The subsequent independent verdict is pass, with disposition ship scoped to those four scored fixes; it does not approve the whole surface. Stage 6 remains uncommitted and unpublished at this documentation checkpoint. Hosted migration 008, live two-account behavior, Android UI and push delivery remain unverified. See `.impeccable/review/together-verification.md` and `.impeccable/review/together-verdict.md` for evidence and scope.
