# inphner

A speedcubing timer, session tracker, stats suite and algorithm trainer ("csTimer rebuilt
properly"). A visual sibling of **inphub** (the owner's dashboard, `/Applications/XAMPP/htdocs/inphub`):
the same Glass design system, token for token.

- **Spec:** `inphner-prompt/inphner-prompt.md` (Part A product, Part B design system, Part C build
  order + acceptance). Screenshots of inphub are in `inphner-prompt/screenshots/`.
  **`inphner-prompt/` is read-only reference material.** Never edit, move or delete anything in it,
  and never put app code there.
- **Priorities:** (1) timing is accurate and nothing gets in its way, (2) it matches inphub,
  (3) it's polished.

## Working agreement

- Build in Part C's order, **one step at a time**. After each step, check it in the browser at
  desktop size (1378×862, the screenshots' size) and at 375px. (After step 1 the owner said to
  carry on through the steps without waiting for approval: report progress, don't block.)
- Use Part B's token values exactly. Don't restyle, "modernise" or invent colours, radii, accents
  or wallpapers.
- **Don't invent cubing algorithms.** If unsure of an alg, leave it `""` for the owner to fill in.
- The stats engine's unit tests come before its UI; never call a step done with failing tests.
- No commits or pushes unless asked.

### Decisions made with the owner (they override the spec text)

| Topic | Decision |
|---|---|
| Rounding | **WCA 9f:** singles are *truncated* to 0.01; averages/means are *rounded* half-up to 0.01 (A11's wording has these swapped). |
| Stats order | The pure stats engine and its tests are built at the **start of step 4**, before the solve list and pills. Step 5 adds incremental/50k perf, best ranges, PBs, goals and the average modal. |
| Serving | XAMPP at `http://localhost/inphner/` (same origin as inphub). `public/` is **copied** there by `tools/sync-xampp.mjs`, because Apache can't read the home dir. |
| Trainer data | PLL/OLL/F2L ship with standard algs the author is certain of, blank otherwise. COLL has **42** cases (40 + O adj/diag). CMLL/CLL/EG/ZBLL get correct names and groups, empty algs, and stay disabled until filled in. |
| Post-solve keys | Both: plain keys (↵ 2 D C ⌫) while the post-solve row shows, and `Alt+1/2/3` / `Alt+Z` whenever idle. |
| Event icons | The per-event **SVGs** from cubing/icons 3.0.5 (MIT), fetched from the GitHub tag into `src/data/event-icons/` (the npm package ships only a font). `node tools/event-icons.mjs` regenerates `src/data/event-icons.ts`. |
| Training events (author's call) | `cross` and `roux` use a normal random-state 3x3 scramble (separate sessions/stats for the practice); `f2l` = last layer solved, rest random (the spec's "LL-solved scramble"); `ll` = F2L solved, random LL; `lse` = random ⟨M,U⟩ with U turns ≡ 0 mod 4 so corners stay solved; 2GEN/3GEN/custom length = random moves; PLL/OLL attack and `none` have no scramble. |
| Megaminx | One line per WCA row (7 lines), an exception to the "≤ 5 lines" sizing rule. |
| Stats maths (author's call) | Singles are truncated to the display precision BEFORE averaging (WCA records hundredths); σ is the population standard deviation of non-DNF results. |
| FMC | Stored as `timeMs = moves × 1000`; notation per WCA 12a (no slice moves), max 80 moves, validated with cubing.js (`experimentalIsSolved`, rotations ignored). The attempt survives a reload. |
| Multi-BLD | N numbered 3BLD scrambles (N = pref `multiCubes`); after the stop a sheet asks solved/attempted; DNF when points < 0 or < 2 solved (9f12); no averages. |
| Inspection | A tap (press+release, no hold) starts inspection; starting the solve still needs the hold to green. |
| Bundler | **esbuild** (the spec allows it): cubing.js has bare imports (three, …) and a module worker that an import map can't reach. `tsc` is the type checker only. |
| First-run keycap | Animates 3 times, then rests (B10: the only perpetual motion is the wallpaper drift). |

## Commands

```bash
npm run build      # tsc (typecheck) → esbuild bundle → stamp ?v= hashes → sync to XAMPP
npm run watch      # rebuild + sync on every change in src/ or public/
npm test           # node --test on src/**/*.test.ts (Node 26 strips types natively)
npm run typecheck  # tsc only
npm run icons      # regenerate public/icons/* (qlmanage rasterises the SVG)
```

Open `http://localhost/inphner/` (Apache must be running in XAMPP). The console logs
`[inphner] v1.0.0 ready` on a good boot.

## Layout

```
public/            what gets served (and synced to htdocs/inphner)
  index.html       the shell + the no-flash head script; ?v= stamps are rewritten by the build
  app.css          the whole design system + components (one file, custom properties)
  js/              build output (main.js + content-hashed chunks/); never edit by hand
  icons/           favicon.svg, PNGs (32/180/512), maskable variants
src/
  main.ts          boot: sidebar, router, drawer, global inline-onclick handlers, hotkeys, clock
  router.ts        hash routes with params (#sessions?focus=<id>); views read params, never consume them
  appearance.ts    PURE: appearance types, allowlists, parse/serialize, URL sanitiser, greeting (+ tests)
  prefs.ts         PURE parsePrefs + a tiny live store (localStorage 'inphner.prefs'; event 'inphner:prefs')
  theme.ts         applies theme/appearance to <html>, preview vs save, inphub fallback
  types.ts         Solve / Session (+ Multi-BLD `multi`, FMC moves stored as timeMs = moves × 1000)
  db/idb.ts        tiny IndexedDB wrapper: stores sessions / solves (indexes session, sessionTime) / meta
  store.ts         sessions + solves: cache per session, write-before-show, unsaved retry, undo data;
                   emits 'inphner:solves' {sessionId} and 'inphner:sessions'
  stats/           chart-data.ts (PURE histogram, heatmap, hour/weekday, PB steps, splits, downsample)
                   · core.ts (PURE WCA maths: effective, mo3, aoN trim, rolling, best, summary, trimmed)
                   · engine.ts (PURE incremental SessionStats: sorted windows per N, bests, PBs, totals)
                   · live.ts (one engine per session, synced via store.sessionRev in O(1))
                   · special.ts (PURE FMC notation/count, Multi-BLD points/rank)
  events.ts        every event: id, names, group, icon, scrambler kind
  timer/           engine.ts (PURE state machine, injected clock/scheduler) · format.ts (PURE WCA
                   formatting + typing parser) · sounds.ts (beep / voice alerts)
  scramble/        moves.ts (PURE random moves, LSE, tokenising) · nxn.ts (PURE N×N sticker simulator)
                   · states.ts (PURE random 3x3 subset states) · net.ts (PURE SVG net)
                   · generator.ts (cubing.js, lazy, one-ahead prefetch per event)
  data/            event-icons/*.svg (vendored, MIT) → event-icons.ts (generated)
  ui/              dom.ts (esc, onAction, isTyping) · icons.ts · toast.ts · modal.ts
  views/           registry.ts (views, hotkeys, tints) · timer.ts · scramble-card.ts · fmc.ts
                   · solve-list.ts (virtualised) · solve-modal.ts · average-modal.ts
                   · session-picker.ts · sessions.ts · stats.ts · charts.ts (Chart.js helpers)
                   · settings.ts (+ settings-prefs.ts) · placeholder.ts
  ui/sortable.ts   drag-to-reorder (port of inphub's sortable)
  ui/popover.ts    glass popover under a trigger (event picker; session picker in step 4)
tools/             build.mjs · sync-xampp.mjs · icons.mjs · event-icons.mjs
public/.htaccess   index.html / sw.js / manifest are served no-cache (everything else is hashed)
```

Tests import only **pure** modules (no DOM) with explicit `.ts` extensions. Imports everywhere use
`.ts` extensions (`allowImportingTsExtensions`; esbuild and Node both resolve them). No enums or
namespaces (`erasableSyntaxOnly`, which Node's type stripping requires).

## The timer (views/timer.ts + timer/engine.ts)

- The engine is pure: the view passes `performance.now()` taken **in** the event handler
  (start = keyup/pointerup, stop = keydown/pointerdown). rAF only paints.
- The key/touch that stopped a solve must be released before anything can arm again
  (`awaitRelease` in the engine; `stopKey` in the view maps the matching keyup/pointerup).
- A pointer press that stops the timer suppresses the click that follows it.
- `timerBusy()` (armed, inspecting or running) disables every other shortcut; main.ts checks it.
- `paint()` sets colours by class swap only; `.time` transitions **only** `transform`.
- `<html data-view="timer">` turns off overscroll (pull-to-refresh) while the timer is shown.
- Browser-pane testing: when the pane is hidden, rAF and CSS transitions don't run. Verify
  colours/classes synchronously, and check running-time rendering with the pane visible.

## Trainer (src/trainer/, views/trainer.ts, views/algorithms.ts)

- **Case identities are enumerated, never recalled** (`trainer/ll.ts`): all LL permutations up to
  pre/post AUF give exactly 21 PLL classes, all orientation patterns up to AUF exactly 57 OLL
  classes; `trainer/f2l.ts` enumerates the 41 F2L cases (24 + 6 + 6 + 5) with descriptive names
  read off the stickers.
- **Every bundled alg is verified by tests** (`ll.test.ts`): it must keep F2L intact and land in
  the class its name claims; the 21 PLL algs must cover the 21 classes exactly once; group
  structure (edges/corners/adjacent/diagonal) and inverse pairs (Ua/Ub, Aa/Ab, Ga/Gb, Gc/Gd) are
  asserted; the 7 OCLL algs must cover the 7 OCLL classes. Our sticker conventions are
  cross-checked against cubing.js (`cube3.test.ts`, `ll.test.ts`).
- Data: `src/data/trainer/pll.json` (21, standard algs), `oll.json` (only OLL 21–27 named, the
  other 50 are unnamed slots grouped by edge shape, still trainable), `shells.json` (COLL, CMLL,
  ZBLL, 2x2 CLL, EG-1, EG-2: names/groups only, shown as "need case data"). To name an OLL slot or
  add a set, add data and let the tests check it. **Never add an alg that isn't certain.**
- Scrambles (`trainer/scramble.ts`): the case in a random full-cube state (random AUF; random LL
  permutation for OLL; random LL pieces for F2L), solved by cubing.js and inverted.
- Selection (`trainer/select.ts`): weighted spaced repetition (EMA time vs set average, failure
  rate, staleness, learning status; unseen first) or "each case once per round" (deck).
- Persistence (`trainer/store.ts`): IndexedDB `meta` keys `trainer:stats`, `trainer:algs`,
  `trainer:custom`, `trainer:prefs`; debounced, flushed on pagehide.
- The trainer's timer is a second `TimerEngine`; keys reach it through `setKeyDelegate()` in
  views/timer.ts so it shares the double registration + dedupe. `trainerBusy()` blocks shortcuts.

## Stats pipeline

`store` mutates → bumps `sessionRev(sessionId)` (`append` / `update-last` / `pop-last` / `other`)
→ emits `inphner:solves` → views call `syncStats(sessionId, solves)`, which applies the one op
incrementally or rebuilds (~0.5 s for 50k, only on load or odd edits). PBs of an append are kept
until `takePbs(sessionId, solveId)` collects them for the celebration. Never compute stats over the
whole session in the timer's per-solve path.

## cubing.js notes (0.63.6)

- Loaded lazily (`import('cubing/…')`) so it never touches first paint; esbuild splits it into
  `public/js/chunks/`, including `search-worker-entry-*.js` (the worker is found automatically).
- 3x3 KPuzzle piece order (verified): EDGES `UF UR UB UL DF DR DB DL FR FL BR BL`, CORNERS
  `UFR URB UBL ULF DRF DFL DLB DBR`, CENTERS `U L F R B D`. `nxn-cubing.test.ts` proves our
  simulator agrees with cubing.js.
- `<scramble-display>` is NOT part of cubing.js; use `<twisty-player visualization="2D">`.
- `<twisty-player>` renders nothing inside a `<button>`, and nothing with `control-panel="none"`
  (in combination with our other attributes). The preview is a `div[role=button]` and the
  default control bar is cropped off by `.twisty-clip`.
- Big-cube scramblers warm up once per visit (4x4 ~10 s); the card says so after 1.5 s.
- `setSearchDebug({ logPerf: false })` keeps its per-scramble timing logs out of the console.

## Architecture conventions

- **Views** are persistent `<section class="view" id="view-…">` containers whose `innerHTML` is
  swapped on each render. Use **one delegated click handler per container** via
  `onAction(container, handler)` (WeakMap-registered, so it's idempotent). Elements opt in with
  `data-action="…"`. Never capture child nodes across renders.
- **Escape every user string** (session names, comments, custom algs) with `esc()` before it
  touches HTML.
- **Global chrome** (theme button, hamburger, drawer backdrop, sidebar-foot buttons) uses
  **inline `onclick="window.inphner*()"`**. In the owner's Firefox, `addEventListener` on these
  silently never fired. For the same reason, the timer's keydown/keyup must be registered through
  **both** `addEventListener` and `document.onkeydown/onkeyup`, stamped so whichever fires second
  is a no-op.
- **Appearance:** `localStorage['inphner.theme']` and `['inphner.appearance']` hold
  `{accent, wallpaper, transparency, logo, image, url}`, inphub's shape. The head script in
  `index.html` mirrors `parseAppearance()` in ES5. **Keep them in sync.** For whatever inphner
  hasn't saved, it falls back per key to `inphub.*` on localhost. Settings previews with
  `remember=false`, saves on Save, and `leaveSettings()` reverts an unsaved preview.
- Custom wallpaper URLs reach CSS only via `safeWallpaperUrl()` + `cssUrl()` (http(s) only,
  url()-breaking characters percent-encoded).
- Dates are local. Never derive "today" from `toISOString()`.
- Hover effects live only inside `@media (hover: hover)`.

## The design rules that are easy to break

1. **Only `<html>` paints the base colour.** Never give `body`, `.app`, `.main` or `.view` a
   background: it covers the `z-index:-1` wallpaper and every glass panel stops showing it.
2. **Containers that hold glass animate with fill mode `backwards`**, never `both`/`forwards`,
   and no `transform`/`filter` may remain on an ancestor of a glass panel. A filled animation
   leaves the element isolated, and every `backdrop-filter` inside then blurs nothing. Focus mode
   fades chrome with an `opacity` **transition**, and the 1.04 scale goes on the time element only.
3. **Overlays put their tint + blur on `::before`** (`.modal-backdrop::before`, the palette, the
   drawer backdrop), never on the element that contains the glass box.
4. **`--bg`, `--text-dim`, `--border`, `--accent`, `--good`, `--warn`, `--bad`, `--purple` stay
   plain colours, never `color-mix()`**: Chart.js reads them with `getComputedStyle` at draw
   time. Only derived tints (`--accent-soft`, badge tints…) use `color-mix()`.

Also: never hardcode a translucent background (use `--glass-bg(-strong)`); no glass inside glass
(inside a panel use `--fill-1/2/3`); no raw hex outside the B2.1 exceptions (white knobs, `#fff`
in gradients, badge tints, cube stickers); timer colour changes (armed → ready) are **never
animated**; the wallpaper drift pauses while timing (`<html data-timing>`).

Quick self-check in the console:
`getComputedStyle(document.body).backgroundColor` → `rgba(0, 0, 0, 0)`;
`document.documentElement.scrollWidth <= innerWidth` at 375px.

## Pre-release status (v1.0.0-pre)

The owner asked for a **v1.0.0-pre** that ends at the Trainer. Version label: sidebar chip,
console "ready" line (`VERSION` in main.ts) and package.json.

**Done:** steps 1–8 (see Build status). 90 unit tests (`npm test`), each step checked in the
browser pane at desktop size and 375px.

**Next, in order:**
1. **Step 9: command palette + shortcuts sheet.** `k` / Cmd-K opens a palette identical in look to
   inphub's (switch session, switch event, jump to view, "export session", "toggle inspection"…);
   `window.inphnerPalette` currently shows a "later build step" toast. The `?` sheet exists
   (main.ts `showShortcuts`) and should list trainer keys too.
2. **Step 10: PWA / offline.** Web manifest (icons exist in public/icons), a service worker that
   caches the app shell + js/chunks (incl. cubing.js and Chart.js chunks), `.htaccess` already
   serves `sw.js` / the manifest no-cache. Acceptance 9: offline reload, time a solve, it's saved.
3. **Step 11: Stackmat (AudioWorklet decoder + status pill), smart cube (Web Bluetooth, GAN first,
   behind "Experimental"; auto phases), Tools** (scramble batch + print stylesheet, cross/EOLine
   solver hints via IDA* in a worker, metronome, BLD memo helper with Speffz). The Tools view is a
   placeholder saying it comes after the pre-release; Settings → Timer has Stackmat / Smart cube
   input buttons disabled.
4. **Full acceptance pass** (inphner-prompt.md Part C, items 1–10), including: 60 fps while
   timing and smooth list scrolling at 50k (needs the pane VISIBLE: rAF doesn't run hidden),
   csTimer numbers on 3 real imported sessions, the screenshot comparison with 01/02, reduced
   transparency everywhere, and the owner's manual checks below.

**Handed to the owner (manual checks):** real keyboard and touch feel of hold-to-start, voice/beep
alerts, Wake Lock on a real phone, a real csTimer export import (multi-phase split encoding is
implemented from memory: `[penalty, total, …earlier phase ends latest first]`, unverified),
Firefox (the dual key registration), the 3D preview (cubing.js twisty), and naming the 50 unnamed
OLL slots / adding algs.

**Also:** COLL is 42 cases by the owner's decision; the shells don't enumerate cases yet.

## Build status

- [x] **1. Shell + design system + appearance settings.** Sidebar/drawer, topbar (greeting,
  title, clock, theme), `g x` hotkeys, the `?` sheet, toasts, modal/bottom sheet, the Settings →
  Appearance card, the first-run card, placeholder views, icons.
- [x] **2. Timer.** `TimerEngine` (idle/inspecting/running × none/tap/armed/ready), keyboard (space,
  both Ctrls, any key stops) + touch/pen/mouse on the stage, WCA inspection with auto +2/DNF and
  8/12 s beep/voice alerts, focus mode (`<html data-focus>` fades chrome, `data-running` pauses the
  drift), landing spring, post-solve row + keys, typing mode, multi-phase splits, wake lock,
  aria-live. Settings → Timer and Inspection cards.
- [x] **3. Scrambles.** All 28 events (WCA + training) with random-state scrambles in cubing.js's
  worker, prefetched one ahead; subset states solved + inverted; span-per-move text that fits 5
  lines; ← → copy edit lock; our SVG net for N×N, twisty 2D/3D otherwise (click toggles 3D);
  collapsible preview on phones; event picker pill (becomes the session picker in step 4).
  FMC (60-min countdown + solution check) and Multi-BLD entry need the data layer → step 4.
- [x] **4. Data layer.** Stats engine + tests first; IndexedDB store (write before showing, unsaved
  retry toast); session picker pill (grouped by event, counts, ao12, New session); stat strip;
  virtualised solve list (50k solves → ~11 rows in the DOM); solve modal (penalty, scramble + net,
  splits, comment, move, delete); Sessions view (drag reorder, rename, use, archive, merge, delete
  with confirm, bulk select → move/delete); undo toasts for every destructive action; FMC and
  Multi-BLD entry; phone bottom sheet (peek = strip + 5 solves, swipe/tap to open).
- [x] **5. Incremental stats, PBs, goals.** `SessionStats` keeps each window sorted: a new solve is
  ~0.02 ms for mo3…ao1000 (tested at 50k); the store's per-session revision lets the UI apply it
  without diffing, so stop → stats + strip + list takes 2–4 ms at 50k solves. PB detection
  (single, ao5/12/50/100) with inphub's flash ring + "New PB · ao12 14.83 (−0.41)" toast; PB
  badges in the list; number roll on the strip; average detail modal (trimmed in parentheses,
  current vs best with its range, csTimer-style copy); session goals (sub-X single/ao5/ao12/ao100,
  progress + "s to go", marked done once reached).
- [x] **6. Stats view.** Chart.js (lazy chunk, tree-shaken registration in `views/charts.ts`):
  trend (dots + ao5/ao12/ao100, drag to zoom, scroll to pan, double-click / button resets, range
  last 100 · 1000 · all · dates), distribution (auto bucket, mean ±σ markers), PB progression
  (steps), practice heatmap (all sessions, 12 months, local days), by hour / weekday, splits
  (stacked). Summary card. Mini "last 100" trend beside the Timer's solve list (≥1100px).
  Pure data prep in `stats/chart-data.ts` (tested).
- [x] **7. Import / export.** `io/cstimer.ts` (csTimer `.txt` JSON in and out, splits, scrType →
  event with name fallbacks for OH/BLD), `io/csv.ts` (delimiter detection, csTimer CSV, "+" in a
  CSV = displayed total), `io/backup.ts` (full inphner JSON, merge by id + updatedAt). UI in
  `views/data-io.ts`: preview with counts before anything is written, Undo after import;
  Settings → Data card (export, import, backup reminder, erase everything behind typing "delete");
  Import/Export buttons in Sessions.
- [x] **8. Trainer + Algorithms.** See "Trainer" below.
- [ ] 9. Command palette + shortcuts sheet
- [ ] 10. PWA/offline
- [ ] 11. Stackmat, smart cube, tools
