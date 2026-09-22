# Third-party notices

inphner itself is AGPL-3.0 (see `LICENSE`). It has no runtime `dependencies`,
but the build inlines the libraries below into the shipped bundle, so they are
distributed with every copy of the app and their notices travel with it. Each is
compatible with AGPL-3.0.

The build tools (esbuild, TypeScript, `@types/node`) are not listed: they run at
build time and no part of them ends up in the bundle.

## cubing.js — MPL-2.0 OR GPL-3.0-or-later

Copyright (c) the cubing.js contributors
<https://github.com/cubing/cubing.js>

Dual-licensed. inphner takes it under **GPL-3.0-or-later**, which combines
cleanly with AGPL-3.0. (MPL-2.0 would also serve, via its Secondary Licenses
clause; the election is recorded here so the choice is not left to the reader.)

Per MPL-2.0 section 3.2 and GPL-3.0 section 6, the Corresponding Source for this
library is available at the URL above and from the version pinned in
`package-lock.json`.

## Chart.js — MIT

Copyright (c) 2014-2022 Chart.js Contributors
<https://github.com/chartjs/Chart.js>

## gan-web-bluetooth — MIT

Copyright (c) Andy Fedotov
<https://github.com/afedotov/gan-web-bluetooth>

---

Full licence texts ship with each package under `node_modules/<name>/LICENSE`
and are available at the URLs above.

inphner is an independent reimplementation. It contains no code from csTimer or
any other timer.
