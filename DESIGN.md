---
name: Our Little Arcade
description: A love letter on the table of a little forest cabin.
colors:
  paper: "#f5f0e4"
  sheet: "#fffcf3"
  ink: "#262821"
  forest: "#344f3f"
  forest-hover: "#243e2f"
  leaf: "#dce7ce"
  wine: "#713a45"
  rose: "#e8c8c8"
  brass: "#806132"
  muted: "#626653"
  line: "#d8d2c3"
typography:
  display:
    fontFamily: '"Fraunces", Georgia, serif'
    fontSize: "clamp(42px, 5vw, 70px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  headline:
    fontFamily: '"Fraunces", Georgia, serif'
    fontSize: "clamp(28px, 3vw, 38px)"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Fraunces", Georgia, serif'
    fontSize: "25px"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-0.025em"
  body:
    fontFamily: '"DM Sans", Arial, sans-serif'
    fontSize: "15px"
    lineHeight: 1.6
  label:
    fontFamily: '"DM Sans", Arial, sans-serif'
    fontSize: "13px"
    fontWeight: 600
  handwriting:
    fontFamily: '"Caveat", cursive'
    fontSize: "26px"
    lineHeight: 1.2
rounded:
  field: "4px"
  control: "5px"
  board: "8px"
  circle: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  control: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "48px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.forest-hover}"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.forest}"
    rounded: "{rounded.circle}"
    padding: "10px"
    width: "44px"
    height: "44px"
  button-icon-hover:
    backgroundColor: "{colors.leaf}"
    textColor: "{colors.forest}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.forest}"
    padding: "8px 0"
  button-text-hover:
    textColor: "{colors.wine}"
  field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
  game-ticket:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "23px 20px"
    width: "100%"
  game-ticket-hover:
    backgroundColor: "{colors.leaf}"
  game-paper:
    backgroundColor: "{colors.sheet}"
    padding: "28px"
  daily-paper:
    backgroundColor: "{colors.leaf}"
    textColor: "#263b2c"
    padding: "28px 27px 22px"
---

# Design System: Our Little Arcade

## Overview

**Creative North Star: "The Cabin Scrapbook"**

A love letter on the table of a little forest cabin. The window is a photographic anchor; playable objects are cream paper, ink, board-game pieces and olive bookcloth. Asymmetric compositions and handwritten marginalia keep the place intimate. This is a private shared space for Lance and Elaine.

Preserve the authored scrapbook direction: useful objects arranged on a table, with ruled edges, paper layering, a taped photograph and short personal notes. Everyday controls stay readable and predictable beneath the expressive headings. The established visual rejections are stock dashboard chrome, a generic card grid, competing scenery and emoji used as UI decoration.

**Key Characteristics:**
- Warm paper and earthy green, with wine used for personal accents.
- Expressive serif headings, quiet sans-serif controls and brief handwriting.
- Flat ruled lists alongside a few tactile paper objects.
- Symbols accompany colored game pieces; identity never relies on hue alone.

## Colors

The frontmatter records the default CSS palette. Forest is the primary action color; wine adds intimate contrast without replacing functional ink.

### Primary
- **Forest:** primary actions, wordmark, green player identity and selected controls. The deeper hover sibling supports action feedback.
- **Light Leaf:** daily-question paper, gentle hover surfaces and selected options.

### Secondary
- **Wine:** handwritten notes, anniversary accents, wax seal and some game illustrations.
- **Rose:** paired game pieces, selection highlight and error-message paper.

### Tertiary
- **Brass:** keyboard focus outlines and warm detail accents.

### Neutral
- **Paper:** page background.
- **Sheet:** fields, photograph mount, notebook and game papers.
- **Ink:** main readable text and Lance's black cross.
- **Muted:** secondary text and captions.
- **Line:** thin rules, fields and boundaries.

**The Symbol Rule.** Elaine owns the green circle; Lance owns the black cross. Preserve the symbols in every game state, including night.

Night changes paper to deep forest charcoal and sheet to dark green, with cream ink, pale green actions and rose wine accents. Exact night values live in the sidecar as environment overrides of the CSS tokens. The daily-question paper and game pieces intentionally retain light material colors for legibility. Golden hour, dusk and night tint the forest photograph; these filters do not recolor the whole interface.

## Typography

**Display Font:** Fraunces with Georgia and serif fallbacks. **Body Font:** DM Sans with Arial and sans-serif fallbacks. **Personal Note Font:** Caveat with cursive fallback. Fonts are loaded from Google Fonts under the SIL Open Font License; asset attribution remains in CREDITS.md.

Fraunces gives headings a personal, literary character. DM Sans handles controls, forms and longer text. Caveat appears only in short notes and captions; it is not the reading face for instructions.

### Hierarchy
- **Display:** the fluid main heading recorded in frontmatter. The invitation-window headline uses a larger expression (clamp(48px, 5.5vw, 74px)).
- **Headline:** section headings follow the fluid headline role; individual papers use context-specific sizes.
- **Title:** smaller headings and game names use the serif title role.
- **Body:** the base reading style; paragraphs are limited to 72ch.
- **Label:** semibold field labels. Supporting notes usually use 12px sans-serif.
- **Handwriting:** brief wine-colored marginalia with a relaxed line height.

**The Three Voices Rule.** Serif introduces an object, sans-serif explains or operates it, handwriting adds a personal aside.

## Layout

The centered shell has a maximum width of 1320px and fluid side padding (clamp(20px, 5vw, 64px)), with safe-area padding at the bottom. At 1400px and wider, side padding becomes 60px. The home introduction pairs text and photograph in a 1.3fr/0.7fr composition with a 40px gap. The play area pairs a flexible shelf with a 320px daily-question paper and a 45px gap. The invitation pairs an arched window and form in 1.15fr/1fr columns.

Use the extracted spacing steps in frontmatter as a rhythm, not an assertion that every existing measurement is on a strict scale. Object-specific gaps and padding remain intentional. Section separation is generous; game rows and notebook contents remain compact enough to operate.

At 1000px and below, the play rail narrows to 285px with a 28px gap. At 760px and below, the play and invitation layouts stack, the daily paper loses its rotation, and the introduction still pairs text with a 190px photograph column. At 480px and below, shell gutters become 18px, the introduction and choice strip stack, notebook objects stack, settings and quiz options become single columns, and the masthead wraps with the wordmark on its own line. The photograph remains a smaller centered object rather than a full-bleed banner.

Primary buttons and fields have a minimum height of 44px. Mobile header icons retain 44px by 44px targets despite smaller visible icons. At the narrowest breakpoint, Connect Four column controls extend across the game-paper padding to preserve 44px minimum widths. Do not infer that every visual board cell is a 44px action target; column controls perform the Connect Four action.

## Elevation & Depth

Depth is material rather than dashboard-like: fine rules separate list rows, soft shadows lift paper objects, and slight rotation plus translucent tape makes selected objects feel pinned to the table. The default paper shadow is reused for notebook, game and settings papers; the photograph, daily paper and wax seal use their own softer shadows. Exact shadow values are recorded in the sidecar.

**The Paper Rule.** Reserve lifted, rotated treatment for authored paper objects. Game rows remain flat and ruled. Keep the daily paper level on stacked mobile layouts.

## Shapes

Controls have gently softened corners, fields slightly smaller corners, and notebook/game papers mostly square edges. Round icon targets, circle pieces and the wax seal supply contrast. The invitation window has a tall arch (110px 110px 4px 4px), reduced to a smaller arch on mobile (70px 70px 3px 3px). The mounted forest photograph rotates by 3 degrees. Tape is a flat translucent strip; it is not another rounded card.

## Components

### Buttons

Primary buttons are forest on sheet, using the frontmatter padding and control radius. Hover deepens the forest and lifts the button by 1px. Disabled buttons use reduced opacity (0.58) and a default cursor. Icon buttons use transparent circular targets and leaf hover surfaces. Underlined text actions use forest and turn wine on hover.

Keyboard focus on buttons, links, fields, selects and summaries uses a brass outline (3px) with a 4px offset. Keep this visible in every environment. The implementation's action transitions are 160ms with the CSS default easing; the older prose's ease-out preference is not an implemented token.

### Cards / Containers

Game tickets are full-width ruled rows, not enclosed cards: a serif title, quiet description, small icon and trailing action. Hover uses leaf and moves the row 4px right. Game and notebook papers use sheet, square edges and the default paper shadow. The daily-question paper is a leaf-colored taped note, slightly rotated on desktop, with darker green text and a light writing field.

### Inputs / Fields

Fields use sheet, ink, a line-colored border (1px), the field radius and wine caret. Placeholders use muted text at full opacity. Textareas resize vertically; the base minimum height is 120px. The daily-question writing field has its own pale background and dark ink. Keep typed content available after a failed save, and communicate the failure using the rose/wine error-message treatment rather than implying a sealed answer succeeded.

### Navigation

Authentication tabs are understated text tabs over a ruled baseline, with forest text and a 2px bottom line on the active tab. Notebook navigation uses book-like tabs above a paper page; narrow screens reduce label size and padding. The masthead groups the wordmark and circular ambience/settings controls and wraps on small phones to preserve targets.

### Game Pieces and Notebook Objects

Tic-tac-toe uses a square sheet board divided by forest rules. Connect Four uses a forest tray, round pieces and separate numbered drop controls. Quiz choices have bordered rows, a leaf selected surface and native radio inputs. The note jar and date wheel are illustrated objects using the same wine, rose and forest vocabulary; drawing ink choices are small pots inside 44px circular controls.

### Environment and Motion

The authored game-entry moment is a paper opening (350ms, cubic-bezier(0.22, 1, 0.36, 1)), shifting 8px into place while its clip opens. The date wheel spins through three turns in 1.1s with the same easing. Optional rain is a photograph overlay moving on a 2s linear loop. The body palette transitions over 500ms. Reduced-motion preference disables animations and transitions, restores automatic scrolling and removes hover movement.

The cabin window supports morning, golden hour, dusk and night tints. The northern-calendar seasonal label is decorative and is not a Philippine weather claim. Weather is opt-in; the user-supplied Night Train background music is off by default and never autoplays. The sound button starts a loop at 30% volume; switching it off pauses the track, and switching it on resumes it. The MP3 is fetched only after playback is requested.

## Do's and Don'ts

### Do:
- **Do** preserve the cabin scrapbook, warm paper, forest photograph and quiet ruled objects.
- **Do** keep the black cross and green circle visible alongside player colors.
- **Do** use serif, sans-serif and handwriting for their established roles.
- **Do** preserve generous targets, brass keyboard focus and reduced-motion behavior.
- **Do** keep imagery self-hosted and attribution in CREDITS.md: the Unsplash forest photograph, ISC Lucide icons and original favicon geometry.
- **Do** keep public preview content limited to supplied names and preferences, without persistence or private data.

### Don't:
- **Don't** replace the home table with a stock dashboard or generic card grid.
- **Don't** introduce competing scenery or emoji decoration.
- **Don't** let handwritten notes become long-form instructions.
- **Don't** use game-piece color as the only player identifier.
- **Don't** autoplay ambience or make environmental motion override reduced-motion preference.
