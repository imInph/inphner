/**
 * inphner: appearance values and their validation. Pure (no DOM), so it can
 * be unit-tested; theme.ts applies the result to <html>.
 *
 * The localStorage shape matches inphub's `inphub.appearance` exactly, which is
 * what lets a first launch borrow inphub's look (see the head script in
 * public/index.html, which mirrors parseAppearance() in plain ES5).
 */

export const ACCENTS = ['blue', 'indigo', 'purple', 'pink', 'red', 'orange', 'green', 'teal', 'graphite'] as const;
export const WALLPAPERS = ['aurora', 'sunset', 'ocean', 'forest', 'graphite', 'plain', 'custom'] as const;

export type Theme = 'dark' | 'light';
export type Accent = (typeof ACCENTS)[number];
export type Wallpaper = (typeof WALLPAPERS)[number];
export type Transparency = 'full' | 'reduced';
export type LogoTint = 'accent' | 'wallpaper';

export interface Appearance {
  accent: Accent;
  wallpaper: Wallpaper;
  transparency: Transparency;
  logo: LogoTint;
  /** Custom wallpaper URL (http/https only), '' when unset. */
  url: string;
}

export const DEFAULT_APPEARANCE: Appearance = {
  accent: 'blue',
  wallpaper: 'aurora',
  transparency: 'full',
  logo: 'accent',
  url: '',
};

/** Accent swatch colours for the picker (inphub's values: graphite is a mid grey so the dot reads). */
export const ACCENT_SWATCH: Record<Accent, string> = {
  blue: '#3d8bff', indigo: '#7a78ff', purple: '#bf5af2', pink: '#ff5ea8', red: '#ff5a5f',
  orange: '#ff9f0a', green: '#30d158', teal: '#40c8e0', graphite: '#9aa0ab',
};

export const THEME_KEY = 'inphner.theme';
export const APPEARANCE_KEY = 'inphner.appearance';
export const INPHUB_THEME_KEY = 'inphub.theme';
export const INPHUB_APPEARANCE_KEY = 'inphub.appearance';

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** http(s) only; anything else (javascript:, data:, relative paths) is dropped. */
export function safeWallpaperUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const url = value.trim();
  return /^https?:\/\/\S+$/i.test(url) ? url : '';
}

/**
 * `url("…")` for CSS, with the characters that could break out of url()
 * percent-encoded (the same encoding as inphub's cssUrl()/css_url()).
 */
export function cssUrl(url: string): string {
  return `url("${url.replace(/[\\"'()\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))}")`;
}

export function parseTheme(value: unknown): Theme {
  return value === 'light' ? 'light' : 'dark';
}

/**
 * Parse a stored appearance JSON string (inphner's or inphub's). Unknown or
 * malformed values fall back to the defaults field by field. inphub stores the
 * URL in `url` and the ready-made CSS value in `image`; either is accepted.
 */
export function parseAppearance(raw: string | null): Appearance {
  let obj: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed as Record<string, unknown>;
  } catch {
    /* malformed: defaults */
  }
  let url = safeWallpaperUrl(obj.url);
  if (!url && typeof obj.image === 'string') {
    const m = /^url\("(https?:\/\/[^"\\]*)"\)$/i.exec(obj.image);
    if (m) url = safeWallpaperUrl(m[1]);
  }
  return {
    accent: pick(obj.accent, ACCENTS, DEFAULT_APPEARANCE.accent),
    wallpaper: pick(obj.wallpaper, WALLPAPERS, DEFAULT_APPEARANCE.wallpaper),
    transparency: pick(obj.transparency, ['full', 'reduced'] as const, DEFAULT_APPEARANCE.transparency),
    logo: pick(obj.logo, ['accent', 'wallpaper'] as const, DEFAULT_APPEARANCE.logo),
    url,
  };
}

/** The JSON stored under inphner.appearance (inphub-compatible, plus `url`). */
export function serializeAppearance(a: Appearance): string {
  const url = safeWallpaperUrl(a.url);
  return JSON.stringify({
    accent: a.accent,
    wallpaper: a.wallpaper,
    transparency: a.transparency,
    logo: a.logo,
    image: url ? cssUrl(url) : '',
    url,
  });
}

/** Plain and Custom wallpapers have no palette, so the logo always follows the accent there. */
export function wallpaperHasPalette(w: Wallpaper): boolean {
  return w !== 'plain' && w !== 'custom';
}

/** Time-of-day greeting for the topbar (local time). */
export function greetingFor(hour: number): string {
  return hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}
