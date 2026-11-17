---
name: inphner
description: A speedcubing timer, stats suite and trainer on frosted panels over a soft wallpaper.
colors:
  desk-green: "#15803d"
  desk-green-deep: "#116932"
  desk-green-night: "#30d158"
  desk-green-night-deep: "#22b847"
  on-accent: "#ffffff"
  on-accent-night: "#04140a"
  paper: "#eef1f6"
  ink: "#10131a"
  ink-dim: "#525a69"
  ink-faint: "#8a92a1"
  night: "#07080c"
  night-text: "#f3f5f9"
  night-text-dim: "#a4abb9"
  night-text-faint: "#6c7485"
  glass-light: "rgba(255,255,255,.78)"
  glass-light-strong: "rgba(255,255,255,.92)"
  glass-night: "rgba(22,24,30,.74)"
  glass-night-strong: "rgba(18,20,26,.90)"
  fill-1: "rgba(16,22,40,.04)"
  fill-2: "rgba(16,22,40,.07)"
  fill-3: "rgba(16,22,40,.12)"
  hairline: "rgba(16,22,40,.08)"
  good: "#1f9d4c"
  warn: "#b45309"
  bad: "#dc2f36"
  good-night: "#34c759"
  warn-night: "#ffb020"
  bad-night: "#ff5a5f"
  forest-1: "#16a34a"
  forest-2: "#65a30d"
  forest-3: "#0d9488"
  forest-4: "#166534"
  forest-paper: "#eef7ef"
typography:
  timer:
    fontFamily: "ui-rounded, 'SF Pro Rounded', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Display', 'Segoe UI', Nunito, Roboto, sans-serif"
    fontSize: "clamp(4.5rem, 14vw, 11rem)"
    fontWeight: 720
    lineHeight: 1.02
    letterSpacing: "-0.045em"
    fontFeature: "tnum"
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI Variable Display', 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "2.1rem"
    fontWeight: 750
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI Variable Display', 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 650
    letterSpacing: "-0.012em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI Variable Display', 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif"
    fontSize: ".92rem"
    fontWeight: 650
    letterSpacing: "-0.005em"
  stat:
    fontFamily: "ui-rounded, 'SF Pro Rounded', -apple-system, BlinkMacSystemFont, 'Segoe UI Variable Display', 'Segoe UI', Nunito, Roboto, sans-serif"
    fontSize: "1.15rem"
    fontWeight: 680
    lineHeight: 1.2
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable', 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable', 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif"
    fontSize: ".78rem"
    fontWeight: 560
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
    fontWeight: 560
rounded:
  xs: "5px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
components:
  button:
    backgroundColor: "{colors.fill-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-hover:
    backgroundColor: "{colors.fill-3}"
  button-primary:
    backgroundColor: "{colors.desk-green}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.desk-green-deep}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-icon:
    backgroundColor: "{colors.fill-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "38px"
  card:
    backgroundColor: "{colors.glass-light}"
    rounded: "{rounded.md}"
    padding: "18px"
  input:
    backgroundColor: "{colors.fill-1}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
  pill:
    backgroundColor: "{colors.glass-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "7px 12px 7px 11px"
  chip:
    backgroundColor: "{colors.fill-2}"
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.md}"
    padding: "9px 12px"
  segmented:
    backgroundColor: "{colors.fill-2}"
    rounded: "12px"
    padding: "3px"
---

# Design System: inphner

## Overview

**Creative North Star: "The Cuber's Desk"**

inphner should feel like a tidy desk at home where you practise: personal, light, everything in
reach, nothing shouting. Frosted panels sit over a soft, flat colour wash the way papers
sit on a wooden desk. The one big thing on the desk is the time; every other object is small,
quiet and put away until you reach for it.

The system grew out of inphub's Glass design and was made plainer in v1.4.0, because the glossy
original read as obviously AI-made. What survives is the structure (glass panels, wallpaper,
sidebar, rounded type for numbers); what went is everything decorative: sheen, hover glow,
gradient gloss, glossy icon tiles. The default desk is light, with the plain wallpaper and a green
accent. Users can switch to dark, pick one of nine accents and seven wallpapers, or reduce
transparency, and every surface must hold up in all of them.

Controls are soft and tactile. Corners are gently rounded, fills are flat, and things answer a
press with a small spring (a 0.96 squeeze that bounces back), the way a good cube feels when it
turns. Density is moderate: comfortable to tap on a phone, compact enough to keep a session's
numbers on one desktop screen.

**Key Characteristics:**
- Frosted, fairly solid glass panels over a soft wallpaper with a fine grain.
- One big rounded, tabular time; everything else small and calm.
- Flat accent fills, hairline borders, small tight shadows.
- A small spring on press; nothing moves on its own.
- Light + plain + green by default; dark, eight more accents and reduced transparency fully supported.

## Colors

A quiet, cool-grey desk with one green accent and three status colours that carry real meaning.

### Primary
- **Desk Green** (light theme default): the accent. Primary buttons, the active nav item's icon,
  links, PB badges, the focus ring and selection. Light-theme accents are darkened so white text on
  a filled button keeps at least 4.5:1.
- **Desk Green Deep**: hover and pressed state of the accent fill.
- **Night Green / Night Green Deep**: the same roles in dark theme, bright enough to read on near
  black, with dark text on top.

The accent is user-selectable (blue, indigo, purple, pink, red, orange, green, teal, graphite);
green is the default, not a constant. Never hardcode it; always use `--accent`.

### Neutral
- **Paper**: the light theme's base colour, painted only on `<html>`.
- **Ink / Ink Dim / Ink Faint**: primary text, secondary text and labels, hints and placeholders.
- **Night / Night Text family**: the dark theme's equivalents.
- **Glass Light / Glass Light Strong** (and the Night pair): panel fills. Strong is for floating
  layers (sidebar, modals, popovers, toasts, bottom sheet).
- **Fill 1 / 2 / 3**: tonal fills used *inside* a glass panel (inputs, chips, plain buttons,
  hovered rows) instead of nesting glass.
- **Hairline**: panel borders.

### Status
- **Good / Warn / Bad** (light) and their brighter night versions: the timer's ready (green) and
  armed (amber) states, inspection warnings, +2/DNF, success and error messages, switches that are on.

### Wallpaper
- **Forest over Forest Paper**: one soft, flat wash falling from the top of the screen (two
  linear gradients at .26 light, .22 dark), plain everywhere else. No blobs, no grain, no drift. The
  other presets (aurora, sunset, ocean, graphite, plain) and a custom image follow the same recipe.

### Named Rules
**The Plain Colour Rule.** `--bg`, `--text-dim`, `--border`, `--accent`, `--good`, `--warn`,
`--bad` and `--purple` stay plain colours, never `color-mix()`: Chart.js reads them at draw time.
Only derived tints (`--accent-soft`, badge backgrounds) are mixed.

**The Signal Rule.** Green and amber on the time mean "ready" and "armed". Don't reuse them for
decoration anywhere a cuber might glance mid-hold.

## Typography

**Display Font:** the system display face (SF Pro Display, Segoe UI Variable Display, fallbacks)
**Body Font:** the system text face (SF Pro Text, Segoe UI Variable, Inter, Roboto)
**Numbers Font:** the system rounded face (SF Pro Rounded / ui-rounded, Nunito fallback), always tabular
**Mono Font:** ui-monospace, for scrambles and algorithms

**Character:** native system type, so the app feels like part of the device on the desk. Rounded,
tabular numerals give times and averages a friendly, steady look that never jitters as digits change.

### Hierarchy
- **Timer** (720, clamp(4.5rem, 14vw, 11rem), 1.02): the solve time. The only very large thing.
- **Display** (750, 2.1rem, 1.1, tight tracking): the page title in the top bar.
- **Headline** (650, 1.3rem): section headings.
- **Title** (650, .92rem): card titles.
- **Stat** (680, 1.15rem, rounded, tabular): values in the stat strip and stats cards.
- **Body** (400, 15px, 1.5): everything else.
- **Label** (560, .78rem, sentence case, dim ink): stat labels and table headings.
- **Mono** (560): scrambles, algs, notation.

### Named Rules
**The Tabular Rule.** Every time, average, count or clock uses the rounded face with tabular
figures, so numbers never shift sideways as they change.

**The 16px Field Rule.** Form fields are at least 16px, or iOS zooms in on focus.

## Layout

Desktop is a 244px sticky sidebar plus a main column (max 1680px) inside a 12px frame, 16px
gaps. The main column has a top bar (page title, event/session picker, theme button) over the view.
Grids use `auto-fill` with minimums (340px two-up, 260px three-up, 420px for settings) rather than
fixed breakpoints. The spacing scale is 4/8/12/16/24/32.

The timer view centres the time on the stage, with the scramble and preview above and the stat
strip and solve list below; at 1100px and wider a small "last 100" trend sits beside the list. The
post-solve row is positioned absolutely under the time so landing a solve moves nothing.

At 768px and below the sidebar becomes a slide-in drawer opened from a hamburger, the frame
padding drops to the safe-area insets, and the solve list becomes a bottom sheet that peeks
`clamp(150px, 30dvh, 350px)` under the timer. The timer view is capped at the real viewport height
minus the top bar so the page never scrolls under a solve. Both 1378×862 and 375px are checked for
every change, and nothing ever scrolls horizontally.

## Elevation & Depth

Depth comes from layering, not shadow drama: wallpaper at the bottom, glass panels on top, strong
glass for anything floating above those, then the overlay tint. Panels get a 14px backdrop blur
(no saturate), a hairline border, a 1px inner top highlight and a small, tight shadow. Floating
layers use the larger shadow. With reduced transparency (user setting, OS preference, or no
backdrop-filter support) glass turns opaque and the blur goes away; everything must still read.

### Shadow Vocabulary
- **Small** (`0 1px 2px rgba(20,30,60,.08)` light): tiny raised bits.
- **Panel** (`0 1px 2px rgba(20,30,60,.06), 0 6px 16px -10px rgba(20,30,60,.18)` light): every glass panel at rest.
- **Floating** (`0 18px 40px -16px rgba(20,30,60,.28), 0 2px 6px rgba(20,30,60,.08)` light): modals, popovers, toasts, the open drawer.

Dark theme uses the same shapes with black at higher opacity.

### Named Rules
**The No Glass-in-Glass Rule.** Inside a panel, use Fill 1/2/3. A glass panel never sits inside
another.

**The Clean Ancestor Rule.** Only `<html>` paints a background, overlays put their tint and blur on
`::before`, and no `transform`/`filter` (or `forwards`/`both` animation fill) stays on an ancestor of
a glass panel. Any of those silently stops the blur.

## Shapes

Gently rounded everywhere, on a short scale: 5px for tiny tags, 8px for buttons and
inputs, nav items, the event/session picker and icon buttons, 12px for cards and the stat strip,
14px for the sidebar; full pills only for chips. Switches are iOS-style pills with a white
knob. Borders are 1px hairlines; there are no heavy outlines and no dividers inside cards beyond a
single hairline where a footer starts.

## Components

### Buttons
Soft, flat and pressable.
- **Shape:** gently rounded (8px); small and icon buttons also 8px (38px, 30px small).
- **Default:** Fill 2 background, ink text, weight 560.
- **Primary:** flat accent fill with the accent's foreground colour. No gradient, gloss or glow.
- **Ghost:** transparent, dim text; gains Fill 1 and full ink on hover.
- **Danger:** red text on a 12% red tint; fills solid red on hover.
- **Glass:** a glass panel used as a button, for controls that float over the wallpaper.
- **Hover / Press / Focus:** hover changes the fill only (inside `@media (hover: hover)`); press
  squeezes to 0.96 on a spring and springs back; focus shows a 3px accent ring at 55%.
- **Disabled:** 45% opacity, no press.

### Chips and badges
- **Chip:** full pill, Fill 2, dim text, .74rem. Variants tint the text (warn, bad) or use the soft
  accent (current, locked).
- **Badge:** 7px corners, .72rem bold, tinted background with matching text: good, warn, bad, PB (accent).

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** glass (fairly solid, blurred).
- **Shadow Strategy:** panel shadow at rest; cards marked as links lift 2px with the floating shadow on hover.
- **Border:** hairline.
- **Internal Padding:** 18px; the head row holds a .92rem title, optional small hint and an open button.

### Inputs / Fields
- **Style:** Fill 1 background, Fill 2 border, 10px corners, 9px 12px padding, 16px minimum text.
- **Hover:** stronger border.
- **Focus:** accent border, Fill 2 background and a soft 4px accent halo.
- **Selects** use a drawn chevron; **checkboxes** are switches that turn Good green when on.
- **Error:** a red-tinted block with red text below the field.

### Segmented control
A Fill 2 track (12px corners, 3px padding) holding buttons with 9px corners; the selected one gets a
white (light) or brighter fill, the rest are dim text.

### Navigation
- **Sidebar:** strong glass, 14px corners, sticky full height; brand wordmark at 1.35rem/750 with a
  version tag.
- **Items:** 8px corners, dim text at .93rem/520; hover adds Fill 1; active gets the soft accent
  background, full ink at 620 and an accent icon. Press springs to 0.97.
- **Phone:** the sidebar becomes a drawer that springs in from the left over a tinted backdrop.

### The time (signature)
The solve time: rounded face, 720 weight, tabular, very large, plain ink at rest (no gradient). While held it goes solid amber (armed), then solid green (ready); during
inspection it's ink, then amber, then red. Colour changes are instant, never animated. While
running it scales to 1.04 and all other chrome fades out (focus mode); on stop it lands with a
spring. A new PB flashes a ring around it.

### Pills and the stat strip
- **Event/session pill:** glass, 8px corners, .88rem/620, event icon on the left and a chevron right; opens a glass popover.
- **Stat strip:** one glass bar (12px corners) split into cells by hairlines; each cell is a sentence-case label over a rounded tabular value. On phones it is a flat fill inside the bottom sheet.

## Do's and Don'ts

### Do:
- **Do** use the tokens (`--accent`, `--glass-bg`, `--fill-*`, `--radius-*`) for every colour, fill and corner.
- **Do** put hover effects inside `@media (hover: hover)` and give every pressable thing the small spring.
- **Do** check every change light and dark, with reduced transparency, at 1378×862 and at 375px.
- **Do** keep the time the only large element on the timer screen.
- **Do** honour `prefers-reduced-motion`; motion collapses to near-instant.

### Don't:
- **Don't** bring back inphub's sheen, hover glow, gradient-filled buttons or logo, or glossy icon tiles (the v1.4.0 decision).
- **Don't** give `body`, `.app`, `.main` or `.view` a background; it hides the wallpaper.
- **Don't** hardcode a translucent background or a raw hex outside badge tints, cube stickers, white knobs and `#fff` in mixes.
- **Don't** nest glass inside glass.
- **Don't** animate the timer's colour changes.
- **Don't** add perpetual motion; nothing moves on its own.
- **Don't** bring back the AI tells removed in Nov 2026: blob wallpapers with grain, separate stat bubbles, a topbar clock or time-of-day greeting, gradient text, a 3D keycap, tiny uppercase tracked labels.
