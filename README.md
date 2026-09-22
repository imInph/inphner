# inphner

You can access inphner [here](https://iminph.github.io/inphner/).

A speedcubing timer, session tracker, stats suite and algorithm trainer: csTimer rebuilt with a
calmer interface, clearer stats and a proper case trainer. Local-first (everything lives in
IndexedDB in your browser), in a frosted "Glass" design.

**Status: v1.2.0.** Everything in the build order is in: timer, scrambles, sessions, stats,
trainer, import/export, command palette, offline/PWA, Tools, and Stackmat / smart cube input
(both marked experimental until they've met real hardware).

## Features

- **Timer:** hold space (or touch) until green, release to start, any key stops. WCA inspection
  with automatic +2 / DNF and optional 8 s / 12 s alerts, focus mode, typing mode, multi-phase
  splits, and a post-solve row (OK · +2 · DNF · comment · delete, with undo).
- **Scrambles:** random-state scrambles for every WCA event (cubing.js, in a worker, prefetched)
  plus training events (2GEN, 3GEN, LSE, last layer, F2L-only, custom length…), with a 2D net or
  3D preview. FMC (60-minute countdown, validated solution) and Multi-BLD entry.
- **Sessions:** unlimited sessions per event, reorder / rename / archive / merge, bulk move or
  delete, a virtualised solve list that handles 50 000+ solves.
- **Stats:** WCA-correct mo3 / aoN (trimmed, DNF rules, 9f rounding), incremental (a new solve
  updates everything in a few ms at 50k solves), PB detection, goals, charts (trend with zoom,
  distribution, PB progression, practice heatmap, time of day, splits).
- **Trainer:** PLL (21), OLL (57, 7 named so far), F2L (41) and your own custom cases. Case-setting
  scrambles you can't read the case from, weighted spaced repetition or "once per round",
  recognition mode, per-case stats, and a personal alg sheet. Every bundled algorithm is checked
  by unit tests.
- **Tools:** batches of scrambles with a print sheet; *optimal* cross, XCross, EOLine and Roux
  first-block hints in any cross colour (or all six at once, with what each would cost), each one
  telling you how to hold the cube and drawing the state before and after; a metronome with tap
  tempo; and a BLD memo helper with an editable letter scheme (Speffz by default).
- **Other timers:** a Stackmat through the microphone, or a GAN smart cube over Bluetooth
  (experimental) that starts on the first move, stops when the cube is solved, and saves the
  solution with automatic cross / F2L / OLL splits.
- **Offline:** installs as an app and runs with no network — the whole build is cached, so you can
  time solves on a plane.
- **Import / export:** csTimer (.txt), CSV and full inphner backups.
- Dark / light, 9 accents, 7 wallpapers, reduced transparency, keyboard-first, phone-friendly.

## Run it

The built app is committed in `public/`, so you can serve that folder as it is with any static
web server. No install or build step is needed.

To work on it (Node 26+): the build script copies `public/` to XAMPP
(`/Applications/XAMPP/htdocs/inphner`); set `INPHNER_DEPLOY_DIR` to use another folder.

```bash
npm install
npm run build   # typecheck, bundle, copy public/ to the deploy folder
npm test        # unit tests
```

Then open `http://localhost/inphner/` (or wherever `public/` is served). `npm run watch` rebuilds
on every change. See `CLAUDE.md` for architecture and conventions.

## Credits

- [cubing.js](https://github.com/cubing/cubing.js) (MPL-2.0 / GPL-3.0) for scrambles, solving and 3D previews.
- [Chart.js](https://www.chartjs.org/) (MIT) for charts.
- [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth) (MIT) for GAN smart cubes.
- WCA event icons from [cubing/icons](https://github.com/cubing/icons) (MIT).

## License

[AGPL-3.0](LICENSE) © imInph
