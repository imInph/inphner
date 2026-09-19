/**
 * inphner: applies theme + appearance to <html> and persists them.
 *
 * Two levels, like inphub:
 *   preview (remember = false): Settings changes the look instantly;
 *   save    (remember = true):  written to localStorage for the head script.
 * The theme button saves immediately; the Appearance card saves on "Save" and
 * reverts to the saved look when you leave Settings without saving.
 */
import {
  type Appearance, type Theme,
  APPEARANCE_KEY, INPHUB_APPEARANCE_KEY, INPHUB_THEME_KEY, THEME_KEY,
  cssUrl, parseAppearance, parseTheme, safeWallpaperUrl, serializeAppearance, wallpaperHasPalette,
} from './appearance.ts';

const root = document.documentElement;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the look still applies for this session */
  }
}

/** Served from the same origin as inphub (XAMPP on localhost)? */
function sameOriginAsInphub(): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
}

/** The saved look: inphner's own, else (on localhost) inphub's, else the defaults. */
export function savedTheme(): Theme {
  return parseTheme(read(THEME_KEY) ?? (sameOriginAsInphub() ? read(INPHUB_THEME_KEY) : null));
}

export function savedAppearance(): Appearance {
  return parseAppearance(read(APPEARANCE_KEY) ?? (sameOriginAsInphub() ? read(INPHUB_APPEARANCE_KEY) : null));
}

/** Whether the current look was borrowed from inphub (nothing saved by inphner yet). */
export function borrowedFromInphub(): boolean {
  return read(APPEARANCE_KEY) === null && sameOriginAsInphub() && read(INPHUB_APPEARANCE_KEY) !== null;
}

/** What is on screen now (may be an unsaved preview). */
export function currentTheme(): Theme {
  return parseTheme(root.getAttribute('data-theme'));
}

export function currentAppearance(): Appearance {
  const url = root.dataset.wpUrl ?? savedAppearance().url;
  return parseAppearance(JSON.stringify({
    accent: root.getAttribute('data-accent'),
    wallpaper: root.getAttribute('data-wallpaper'),
    transparency: root.getAttribute('data-glass'),
    logo: root.getAttribute('data-logo'),
    url,
  }));
}

export function applyTheme(theme: Theme, remember: boolean): void {
  root.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f6fa' : '#0b0d12');
  if (remember) write(THEME_KEY, theme);
  window.dispatchEvent(new CustomEvent('inphner:theme'));
}

export function applyAppearance(a: Appearance, remember: boolean): void {
  root.setAttribute('data-accent', a.accent);
  root.setAttribute('data-wallpaper', a.wallpaper);
  root.setAttribute('data-glass', a.transparency);
  // Plain/Custom have no palette of their own: the logo follows the accent there.
  root.setAttribute('data-logo', wallpaperHasPalette(a.wallpaper) ? a.logo : 'accent');
  const url = safeWallpaperUrl(a.url);
  root.dataset.wpUrl = url;
  if (url) root.style.setProperty('--wp-image', cssUrl(url));
  else root.style.removeProperty('--wp-image');
  if (remember) write(APPEARANCE_KEY, serializeAppearance(a));
  window.dispatchEvent(new CustomEvent('inphner:theme'));
}

/** Put the saved look back (drops an unsaved Settings preview). */
export function revertToSaved(): void {
  applyTheme(savedTheme(), false);
  applyAppearance(savedAppearance(), false);
}

export function toggleTheme(): void {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
}
