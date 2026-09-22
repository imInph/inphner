/**
 * inphner: the version string, and where the source lives.
 *
 * Both are here rather than inline so the About card and main.ts read the same
 * value. The version is still hand-maintained; keep it in step with
 * package.json when you bump one.
 *
 * SOURCE_URL is not decoration. inphner is AGPL-3.0, and section 13 requires a
 * version served over a network to prominently offer its Corresponding Source
 * to the people using it. A static site is delivered to every visitor's
 * browser, so that applies to this deployment as much as to anyone's fork.
 */

export const VERSION = '1.2.0';
export const SOURCE_URL = 'https://github.com/imInph/inphner';
