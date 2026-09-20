# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Part C's build order is finished and shipped as **v1.0.0**; work now is fixes, additions and the
outstanding acceptance pass (see Release status). The rules that still hold:

- Check every change in the browser at desktop size (1378×862, the screenshots' size) **and** at
  375px before calling it done.
- Use Part B's token values exactly. Don't restyle, "modernise" or invent colours, radii, accents
  or wallpapers.
- **Don't invent cubing algorithms.** If unsure of an alg, leave it `""` for the owner to fill in.
  The same goes for hardware protocols: use a library or leave it marked untested, never guess.
- Pure logic gets its tests before its UI; never call a change done with failing tests.
- No commits or pushes unless asked.

### The repo

`git@github.com:imInph/inphner.git`, branch `main`, MIT, owner **imInph**
<aardacanbulat@gmail.com>. Two things about it that bite:

- **The build output is committed** (`public/js/`, `public/sw.js`) so the app can be served
  straight from `public/` with no install step. That means **`npm run build` before committing any
  source change**, or the committed build goes stale against the source it claims to be.
- `.gitattributes` marks `public/js/**` as `linguist-generated=true` so GitHub's language bar
  shows TypeScript rather than the bundles. Don't remove it when touching build output.
- `inphner-prompt/` is **git-ignored on purpose**: the inphub screenshots in it show the owner's
  real financial data. It stays local.

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
npm run build      # tsc (typecheck) → esbuild bundle → stamp ?v= hashes → build sw.js → sync
npm run watch      # rebuild + sync on every change in src/ or public/
npm test           # node --test on src/**/*.test.ts (Node 26 strips types natively)
npm run typecheck  # tsc only
npm run icons      # regenerate public/icons/* (qlmanage rasterises the SVG)
```

Open `http://localhost/inphner/` (Apache must be running in XAMPP). The console logs
`[inphner] v1.0.0 ready` on a good boot. Node 26+ (native TS type stripping) and npm 11.

Dependencies, all dev-only and all lazily loaded at runtime: **cubing.js** (official random-state
scrambles, the 3x3 solver behind trainer setups, `<twisty-player>`), **Chart.js** (the Stats view),
**gan-web-bluetooth** (the GAN protocol — hardware fact, not something to reconstruct),
**esbuild** (bundle + the two worker bundles), **typescript** (type checking only).

### Tests cost session budget — be proportionate

There are 168 tests and `npm test` prints a line for each. Running the whole suite after every
small edit is what burns a session's usage before the actual work gets done; the same goes for
writing tests nobody needs. While iterating, run the one file you touched, and filter the output:

```bash
node --test src/stats/core.test.ts          # one file
node --test --test-name-pattern "aoN"       # one test by name
npm test 2>&1 | grep -E "^ℹ (pass|fail)"    # the whole suite, two lines of output
```

Run the full suite once before calling a change done, not between every edit. Two files are slow
because they build search tables: `src/tools/xcross.test.ts` (~9 s) and `src/tools/solve.test.ts`
(~4 s) — never put those in a loop. `src/pwa/sw.test.ts` runs the **built** `public/sw.js`, so
`npm run build` has to come first after touching `src/sw.ts`.

Where the coverage belongs: the pure maths earns it — stats, the solvers, the memo tracer, the
scramble simulators, the bundled algs — because those are why the numbers can be trusted. UI glue
mostly doesn't. A test that restates what the code already says is a cost with no return.

## Layout

```
public/            what gets served (and synced to htdocs/inphner)
  index.html       the shell + the no-flash head script; ?v= stamps are rewritten by the build
  app.css          the whole design system + components (one file, custom properties)
  js/              build output (main.js + content-hashed chunks/); never edit by hand
  sw.js            build output from src/sw.ts (build hash + precache lists injected)
  manifest.webmanifest   PWA manifest (relative start_url/scope, so any path works)
  icons/           favicon.svg, PNGs (32/180/512), maskable variants
src/
  main.ts          boot: sidebar, router, drawer, global inline-onclick handlers, hotkeys, clock
  sw.ts            the service worker (see Offline); pwa/strategy.ts is PURE and tested,
                   pwa/register.ts registers it and offers the update
  router.ts        hash routes with params (#sessions?focus=<id>); views read params, never consume them
  appearance.ts    PURE: appearance types, allowlists, parse/serialize, URL sanitiser, greeting (+ tests)
  backup-nudge.ts  PURE: when to remind someone their solves live only in this browser (+ tests)
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
  io/              cstimer.ts (csTimer .txt in and out) · csv.ts · backup.ts (full inphner JSON)
  pwa/             strategy.ts (PURE fetch routing) · register.ts (registration + update toast)
  trainer/         ll.ts · f2l.ts · cases.ts · diagram.ts · scramble.ts · select.ts · store.ts
                   (see Trainer: case identities are enumerated, algs are test-verified)
  timer/           engine.ts (PURE state machine, injected clock/scheduler) · format.ts (PURE WCA
                   formatting + typing parser) · sounds.ts (beep / voice alerts)
                   · stackmat.ts (PURE UART + packet decoding) · stackmat-source.ts (mic + worklet)
                   · stackmat-worklet.ts (built to js/stackmat-worklet.js) · phases.ts (PURE
                   cross/F2L/OLL/PLL detection) · smartcube.ts (GAN over Web Bluetooth)
  scramble/        moves.ts (PURE random moves, LSE, tokenising) · nxn.ts (PURE N×N sticker simulator)
                   · states.ts (PURE random 3x3 subset states) · net.ts (PURE SVG net)
                   · generator.ts (cubing.js, lazy, one-ahead prefetch per event)
  tools/           cube.ts (PURE piece-level 3x3, move tables derived from nxn.ts) · solve.ts
                   (PURE optimal cross / EOLine / first block) · memo.ts (PURE Speffz + tracing)
                   · metronome.ts · solver-worker.ts (built to js/solver-worker.js)
  data/            event-icons/*.svg (vendored, MIT) → event-icons.ts (generated)
  ui/              dom.ts (esc, onAction, isTyping) · icons.ts · toast.ts · modal.ts
                   · fuzzy.ts (PURE match/rank behind the palette) · palette.ts (the K overlay)
  views/           registry.ts (views, hotkeys, tints) · commands.ts (what the palette lists)
                   · shortcuts.ts (the ? sheet) · timer.ts · scramble-card.ts · fmc.ts
                   · solve-list.ts (virtualised) · solve-modal.ts · average-modal.ts
                   · session-picker.ts · sessions.ts · stats.ts · charts.ts (Chart.js helpers)
                   · settings.ts (+ settings-prefs.ts) · data-io.ts (import/export UI)
                   · trainer.ts · algorithms.ts · tools.ts · placeholder.ts
  ui/sortable.ts   drag-to-reorder (port of inphub's sortable)
  ui/popover.ts    glass popover under a trigger (the event and session pickers)
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
- **Phone layout is measured against the real viewport.** `main.ts` publishes the topbar's height
  as `--topbar-h` (ResizeObserver: safe-area insets change it), and at ≤768px the view is capped at
  `100dvh - var(--topbar-h)` with a `vh` fallback for older iOS. Without the cap the stage took its
  content's height, the page scrolled, and the fixed bottom sheet covered the time. The sheet's
  peek is `clamp(150px, 30dvh, 350px)` rather than a flat 350px, which on a short screen (an iPhone
  with Safari's toolbars up) is what pushed the time against the scramble.
- **The post-solve row is absolutely positioned** under the time. Reserving 62px for a row that is
  usually absent pushed the time well above centre; out of flow, the time is centred *and* landing
  a solve still shifts nothing.
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
- **Marking a mistake asks first and stays put** (owner's call). M is easy to catch mid-drill, so
  the first press turns the button into "Log a mistake?" (Esc or six seconds cancels) and only the
  second logs it. Logging no longer advances to the next case — being moved off the case you are
  drilling was the worse half of the bug — and the button becomes "Mistake logged · undo". The
  revert uses `run.beforeSolve`, the stats as they were *before* the attempt, so a fast mis-hit
  can't leave a phantom best behind; undo restores `run.beforeMistake`.
- **Recognition mode keeps one layout across all three phases:** the diagram's box is always
  there (`visibility`, never `height: 0`) and the question/answer sit in `.recog-below`, which has
  a min-height. Before that the options jumped up when the picture hid and back down when it
  returned, and the picture itself was a 110px drawing sitting left-aligned in a 160px box, off
  the axis everything else was centred on.
- The trainer's timer is a second `TimerEngine`; keys reach it through `setKeyDelegate()` in
  views/timer.ts so it shares the double registration + dedupe. `trainerBusy()` blocks shortcuts.

## Command palette (`k` / Cmd-K)

- `main.ts` lazily imports `ui/palette.ts` + `views/commands.ts` on the first open (they pull in
  the import/export views), and refuses while `timerBusy()` or `trainerBusy()`.
- `views/commands.ts` rebuilds the list every time it opens, so labels state what will happen
  ("Turn inspection off for 3x3"). Sections: Commands · Go to · Algorithms · Sessions · Events.
  Switching to an event uses its most recent session, or creates one.
- `ui/fuzzy.ts` is PURE and tested: a dynamic-programming subsequence match (greedy matching
  spends the "c" of "csv" on "cstimer" and then can't find "csv"). A run of characters scores far
  above the initials of scattered words. `fuzzyFields` matches the label first, then
  label + keywords at a penalty; **subtitles are never searched** (half of them are boilerplate).
  Rows below `FLOOR × query length` are dropped, and with a query the section holding the best row
  comes first.
- The overlay's tint + blur are on `.palette-overlay::before` (design rule 3). At ≤768px it goes
  full screen, so the input row carries a close button (there is no outside left to tap).

## Offline (PWA)

- `src/sw.ts` → `public/sw.js`, built by `tools/build.mjs` as a separate iife bundle with three
  values injected: `__BUILD__` (a hash of main.js + app.css + every chunk name), `__SHELL__` and
  `__CHUNKS__`. One cache per build (`inphner-<build>`); `activate` deletes our older ones only.
- **Install precaches the shell** (index.html, app.css, js/main.js, the manifest, the icons).
  The rest — cubing.js's scramblers and worker, Chart.js, the trainer, ~3 MB — is warmed when
  the page reports itself idle (`pwa/register.ts` posts `{type:'warm'}`), because timing a solve
  offline needs a scrambler and those megabytes must not compete with first paint.
- Lookups use `ignoreSearch: true`, so `app.css?v=<hash>` hits the precached `app.css`.
- Shell documents are network-first (a new build is seen at once), everything else cache-first
  (it's content-hashed). A 404/500 counts as a failure, so a half-deployed build falls back to
  the cached copy.
- **An update never takes over silently:** the new worker waits, `register.ts` shows the
  "A new version of inphner is ready · Reload" toast, and only then posts `skip-waiting`.
  Reloading mid-solve would be the one unforgivable bug.
- **Testing:** the browser pane cannot register a service worker at all (it fails the same way
  for a script that doesn't exist), so `src/pwa/sw.test.ts` runs the **built** `public/sw.js` in
  `node:vm` with a fake CacheStorage and a fetch that can be switched off: install → warm →
  activate → offline reload. Acceptance item 9 still wants one real offline reload in a browser.

## Tools, Stackmat and smart cube (step 11)

- **`tools/cube.ts`** is a second 3x3 model, piece-level and fast, for searching. Its move tables
  are **read from `scramble/nxn.ts` at load**, never typed in, and a test compares every turn and
  a long scramble against it. `cubeFromFacelets()` reads the Kociemba string smart cubes speak;
  it is checked against gan-web-bluetooth's own documented "F R" example.
- **`tools/solve.ts`** answers with the **optimal** solution from a breadth-first table, not IDA*
  (the spec suggested IDA*; a table over these tiny state spaces is simpler and exact). Cross
  ~70 ms to build, EOLine ~200 ms, Roux first block ~4 s — all lazy, inside the worker. Every
  test checks the answer by applying it to the cube, never against a remembered string.
- **XCross** (cross + one F2L pair) is the exception: six tracked pieces is 24^6 states, far too
  many for a table, so `xcrossSolver()` is **IDA\*** bounded by two 24^5 tables that each leave one
  piece out (cross + the pair's corner, cross + the pair's edge). Each is exact for its own
  subproblem, so the larger is an admissible bound and the answer stays optimal. ~3.9 s to build
  both, then **under 1 ms** per scramble. It always solves the **front-right** slot, so the four
  F2L slots come from the four y rotations the caller passes — the same trick as the front.
  There is no XXCross: eight pieces puts the optimal search out of reach in a browser.
- **The solvers always solve the D layer, so every hint carries a rotation** (`tools/orient.ts`).
  A scramble is applied in the WCA orientation (white top, green front), which leaves **yellow**
  on the bottom — a bare cross solution is unusable and, worse, the wrong colour. The Tools card
  has a cross-colour picker (six colours, or "Any" = colour neutral, which tries all six and
  keeps the shortest) and prints the answer as `x2 F2 R2 B' R F D'` with "white on the bottom,
  blue in front" beside it. The cross is the same whichever way the cube faces; EOLine's line and
  Roux's block are not, so those also try the four y turns. `TO_BOTTOM` is verified against the
  simulator, and a test applies `scramble + rotation + solution` to real stickers and checks the
  D face shows the colour that was asked for, with every cross edge matched to its centre.
  With "Any" the worker returns **one option per colour**, all six shown with their move counts
  (before that, ties went silently to whichever came first in the list, which always looked like
  white). The scramble boxes are wrapping, auto-growing textareas, not single-line inputs: a scramble you
  have to scroll sideways to read is one you will apply wrongly (that is exactly how a correct
  cross hint first looked wrong). Typing in them repaints only the region that depends on them
  (`paintHints()`, `#memo-body`), never the field itself.
  Each hint also draws **two nets** ("now" after the rotation, "after" once the moves are done),
  so a hint can be checked against the cube in hand instead of taken on trust — and if the "now"
  net doesn't match, the scramble or the holding is wrong, not the solution. The state after
  `scramble x2 F2 R2 B' R F D'` was also rendered independently by cubing.js's own
  `<twisty-player>` and agrees with ours sticker for sticker.
- **`tools/memo.ts`**: Speffz is *generated* from the face-grid layout ("each face's four
  stickers, clockwise from the top-left"), not typed from memory. Tracing closes a cycle when the
  next shot would land on the piece it started from; pieces that are home but turned are broken
  into like any other (the usual two shots) and also listed separately. The tests **execute** the
  memo — buffer↔target piece swaps — and require a solved cube afterwards, over 200 random cubes.
- **Stackmat** (`timer/stackmat.ts`): 1200-baud UART on the audio line, nine-byte packets
  (status, m ss mmm, checksum = 64 + digit sum). We cannot know the line's polarity, so **both are
  decoded at once** and only checksummed packets are believed; the one that produces packets wins.
  The decoder runs in an AudioWorklet and posts bytes, not samples. `SolveGate` makes a solve out
  of the first stop after a run (the timer repeats its stopped packet). **Never verified against
  real hardware** — the tests drive it with synthesised audio.
- **Smart cube** (`timer/smartcube.ts`): GAN over Web Bluetooth through **gan-web-bluetooth**
  (MIT, lazily imported, ~74 KB chunk with rxjs + aes-js). The protocol is hardware fact, not
  something to reconstruct, which is why the library earns its place. Chrome hides the cube's MAC
  and the key is derived from it, so inphner asks for it once and remembers it per device name.
  Timing starts on the first move and stops when the cube reads solved; the move stream is saved
  as `solution` and `timer/phases.ts` turns it into cross/F2L/OLL splits.
- **Both are labelled experimental and untested in the UI** (owner's call): an amber dot on the
  Settings → Timer → Input buttons, a note under the row naming exactly what was and wasn't
  tested, and an "Experimental" badge on each status pill. Once real hardware has confirmed them,
  drop `experimental` from the `seg()` call in `views/settings-prefs.ts`, the `.pref-note` block
  beside it, and the two badges in `views/timer.ts`.

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

## Hosting and the backup reminder (v1.1.1)

- **GitHub Pages** serves `public/` on every push to main (`.github/workflows/pages.yml`). It
  publishes the folder **as committed** and never rebuilds, so `npm run build` before committing
  is what keeps the live site honest. Live at `https://iminph.github.io/inphner/`. Every path in
  `index.html`, the manifest and the service-worker registration is **relative**, which is why the
  app works unchanged at `/inphner/` on XAMPP and at the Pages subpath.
- **`navigator.storage.persist()`** is asked for once per boot (`db/idb.ts`, called from
  `initStore`); `persisted()` short-circuits the re-ask. The answer is kept in `store.ts`
  (`storageProtection()` / `storageProtectedNow()`) because it decides both the Data card's
  wording and how soon a backup counts as overdue.
- **`backup-nudge.ts` is PURE and tested.** Solves live in one browser and nowhere else, so the
  reminder has two volumes: an amber dot on the Settings nav item whenever a backup is overdue,
  and a toast at most once every 7 days. It needs ≥ 50 solves (below that there isn't enough to
  lose to justify interrupting anyone), waits 6 s after boot, and **polls until `timerBusy()` and
  `trainerBusy()` are both false** — the reminder must never land on a solve. A browser that
  refused to protect the data drops "overdue" from 30 days to 7.

### Offline must not touch the network (v1.1.1)

Found on a real iPhone: the app opened perfectly from the cache in airplane
mode, and iOS then threw **"Turn Off Airplane Mode or Use Wi-Fi to Access
Data"** over the top of it. Nothing had failed — a home-screen app that *tries*
a request with no network gets that system alert, and we were making three
tries on every launch: the network-first navigation, the manifest, and the
`register()` update check.

`orderFor(strategy, online)` in `pwa/strategy.ts` is PURE and tested: offline,
the shell documents go cache-first like everything else, so a cached launch
makes **zero** requests (`sw.test.ts` counts them and asserts 0). With nothing
cached it still falls through to the network — an alert beats a blank page.
`register.ts` skips registration entirely when offline *and* already
controlled, and re-runs on the `online` event; warming is skipped too.

**Anything added to the offline path must keep that count at zero.**

## Release status (v1.1.1)

Version label in three places, keep them in step: the sidebar chip (index.html), the console
"ready" line (`VERSION` in main.ts) and package.json.

**Done:** steps 1–11 (see Build status). 168 unit tests (`npm test`), each step checked in the
browser pane at desktop size and 375px.

**Next:**
1. **Full acceptance pass** (inphner-prompt.md Part C, items 1–10), including: 60 fps while
   timing and smooth list scrolling at 50k (needs the pane VISIBLE: rAF doesn't run hidden),
   csTimer numbers on 3 real imported sessions, the screenshot comparison with 01/02, reduced
   transparency everywhere, and the owner's manual checks below.

**Handed to the owner (manual checks):** a real Stackmat (the decoder has only ever seen
synthesised audio) and a real GAN cube (including the MAC prompt on macOS Chrome), a printed
scramble sheet, one real offline reload (disconnect, reload, time a
solve — the pane can't register a service worker, so only the harness covers it), installing it
as a PWA on the phone and on macOS, real keyboard and touch feel of hold-to-start, voice/beep
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
- [x] **9. Command palette + shortcuts sheet.** `k` / Cmd-K (and the sidebar's Search button)
  opens the palette: commands (new session, inspection, theme, import, export, shortcuts), Go to,
  the alg sheets, every session and every event. ↑ ↓ Home End move, Enter runs, Esc closes, the
  pointer picks; matched characters are highlighted in the accent. The `?` sheet now lists the
  trainer and palette keys.
- [x] **10. PWA / offline.** `manifest.webmanifest` (relative scope, maskable icon, Timer /
  Trainer / Stats shortcuts), `src/sw.ts` → `public/sw.js` with a per-build cache, shell
  precache, idle warm-up of every chunk, and a polite update toast. See "Offline (PWA)".
- [x] **11. Stackmat, smart cube, Tools.** Tools view (scramble batch + print stylesheet, optimal
  cross / EOLine / Roux first block hints in a worker, metronome with tap tempo, BLD memo helper
  with an editable letter scheme); Stackmat through the microphone with a status pill; GAN smart
  cube with automatic start/stop, the solution and automatic phase splits. See the section above.
