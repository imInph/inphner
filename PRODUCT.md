# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Regular speedcubers, roughly sub-30 down to sub-10, who already time their solves in csTimer and
want a calmer, clearer replacement without losing what csTimer does. They practise at a desk with a
keyboard or on a phone propped beside the cube, often in long sessions, sometimes with a Stackmat or
a smart cube. Their jobs: time solves without distraction, see honest averages and PBs, drill
last-layer and F2L cases, and bring their csTimer history with them.

## Product Purpose

inphner is a speedcubing timer, session tracker, stats suite and algorithm trainer: csTimer rebuilt
properly. It exists so a cuber can move over from csTimer (import included) and get the same depth
with less noise. Success is a switcher who times every session in it, trusts its numbers, and uses
the trainer to learn cases.

## Positioning

All four together, which no neighbouring timer offers at once:

- **Calm and clear.** csTimer's features without its clutter; while timing, nothing else competes.
- **Numbers you can trust.** WCA-exact rounding and averaging (9f), every bundled alg verified by
  tests, optimal (not heuristic) cross/XCross/EOLine/block hints. Nothing is guessed.
- **A real trainer.** Case-setting scrambles you can't read the case from, weighted spaced
  repetition or once-per-round decks, recognition mode, per-case stats.
- **Local and offline.** No account and no inphner database; solves live in the browser (optionally
  synced through the user's own Google Drive), and the installed app times solves on a plane.

## Operating Context

- Hold-to-start timing (space, both Ctrls, or touch) with WCA inspection; focus mode fades all
  chrome during a solve.
- Desktop at roughly 1378×862 and phones at 375px are both first-class; on phones the solve list is
  a bottom sheet under the timer.
- Keyboard-first: `g x` view hotkeys, the `k` command palette, the `?` shortcuts sheet, post-solve
  keys.
- Imports csTimer `.txt`/CSV; exports csTimer, CSV and full backups.
- Installable PWA; launched offline it must make zero network requests.
- Static feature/guide pages (csTimer alternative, PLL/OLL trainer, offline timer), privacy and terms
  pages serve search visitors and Google's OAuth review.

## Capabilities and Constraints

- Priorities, in order: (1) timing is accurate and nothing gets in its way, (2) visual consistency
  with its design system, (3) polish.
- Nothing may interrupt or reload a page while a solve or trainer drill is in progress (updates,
  reminders, sync merges all wait).
- A mouse never starts the timer; timer colour changes are never animated.
- Plain static site from `public/` (esbuild bundle committed), served by GitHub Pages at
  inphner.com; cubing.js, Chart.js and gan-web-bluetooth load lazily, never on first paint.
- Stackmat and GAN smart-cube input are unverified on real hardware and must stay labelled
  experimental until they are.
- Never invent cubing algorithms or hardware protocols; unknown algs stay blank.
- Terms: event, session, solve, single, mo3, aoN, PB, inspection, +2/DNF, case, alg sheet.

## Brand Commitments

- Name **inphner**, lower-case. Owner imInph. Contact inph@inphner.com.
- Glass design system inherited from inphub, made plainer in v1.4.0 because the original read as
  "obviously AI-made": no sheen, glow or gradient gloss. Default look is light theme, forest
  wallpaper, green accent. The CLAUDE.md decisions table is binding for the look.
- Voice: plain, first-person, short sentences, few colons, no "Label:" lists in copy for newcomers.

## Evidence on Hand

- The live product at https://inphner.com and its feature pages; `public/og.png`.
- 170 unit tests behind the stats, solvers, scramble simulators and bundled algs.
- No testimonials, user counts, reviews or benchmarks against other timers exist. Do not invent
  them.

## Product Principles

1. The solve comes first: accuracy and an uninterrupted timer beat every other feature.
2. Earn trust by being exact: only show numbers and algs that are verified.
3. Calm over clever: depth stays available but never crowds the timer.
4. The user owns their data: local by default, portable in and out, no account required.
5. Phone and keyboard are equal citizens.

## Accessibility & Inclusion

Target WCAG 2.2 AA: text and essential icons meet AA contrast in both themes and with reduced
transparency; everything is reachable by keyboard with visible focus; motion respects
`prefers-reduced-motion`; the running time and results are announced through aria-live.
