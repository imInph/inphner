# inphner

A speedcubing timer, session tracker, stats suite and algorithm trainer: csTimer rebuilt with a
calmer interface, clearer stats and a proper case trainer. Local-first (everything lives in
IndexedDB in your browser), in a frosted "Glass" design.

**Status: v1.0.0-pre.** The pre-release ends at the Trainer. Next: command palette, PWA/offline,
Stackmat / smart cube input and the Tools view.

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
- WCA event icons from [cubing/icons](https://github.com/cubing/icons) (MIT).

## License

[MIT](LICENSE) © imInph
