/**
 * inphner: the static guide pages in public/<slug>/ (see CLAUDE.md, "Search and sharing").
 * The app links them from Settings → About, the command palette and the welcome sheet,
 * always in a new tab so a guide never replaces a running session.
 */
export interface Guide { slug: string; label: string; blurb: string }

export const GUIDES: readonly Guide[] = [
  { slug: 'cstimer-alternative', label: 'Switching from csTimer', blurb: 'Bring your csTimer sessions over' },
  { slug: 'pll-oll-trainer', label: 'The PLL, OLL and F2L trainer', blurb: 'How the drills pick your cases' },
  { slug: 'offline-cube-timer', label: 'Using it offline on your phone', blurb: 'Put it on your home screen' },
];

/** Relative, so it works at the domain root and under /inphner/ on XAMPP alike. */
export const guideHref = (slug: string): string => `${slug}/`;

/** An <a> that opens the guide in a new tab. `text` is trusted (it comes from GUIDES). */
export const guideLink = (slug: string, text: string): string =>
  `<a href="${guideHref(slug)}" target="_blank" rel="noopener">${text}</a>`;

export function openGuide(slug: string): void {
  window.open(guideHref(slug), '_blank', 'noopener');
}
