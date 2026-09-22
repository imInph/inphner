/**
 * inphner: Settings. The Appearance card has exactly inphub's controls:
 * Theme, Accent, Wallpaper (+ custom URL), Logo colour, Reduce transparency.
 * Its changes preview instantly; Save persists; leaving Settings with unsaved
 * changes puts the saved look back. The other cards (settings-prefs.ts) save
 * as you change them.
 */
import {
  type Appearance, type Theme,
  ACCENTS, ACCENT_SWATCH, WALLPAPERS, cssUrl, safeWallpaperUrl, wallpaperHasPalette,
} from '../appearance.ts';
import {
  applyAppearance, applyTheme, currentAppearance, currentTheme,
  revertToSaved, savedAppearance, savedTheme,
} from '../theme.ts';
import { esc, onAction } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { toast } from '../ui/toast.ts';
import { handlePrefAction, handlePrefInput, prefsCards } from './settings-prefs.ts';
import { dataCard, handleDataAction } from './data-io.ts';
import { SOURCE_URL, VERSION } from '../version.ts';

const LABEL: Record<string, string> = {
  blue: 'Blue', indigo: 'Indigo', purple: 'Purple', pink: 'Pink', red: 'Red', orange: 'Orange',
  green: 'Green', teal: 'Teal', graphite: 'Graphite',
  aurora: 'Aurora', sunset: 'Sunset', ocean: 'Ocean', forest: 'Forest', plain: 'Plain', custom: 'Custom',
};

interface Draft {
  theme: Theme;
  look: Appearance;
}

let draft: Draft | null = null;
/** The logo tint the user picked, restored when they leave Plain/Custom again. */
let chosenLogo: Appearance['logo'] = 'accent';
const wired = new WeakSet<HTMLElement>();

function isDirty(): boolean {
  if (!draft) return false;
  const saved = savedAppearance();
  const d = draft.look;
  return draft.theme !== savedTheme()
    || d.accent !== saved.accent || d.wallpaper !== saved.wallpaper || d.transparency !== saved.transparency
    || effectiveLogo(d) !== effectiveLogo(saved) || safeWallpaperUrl(d.url) !== saved.url;
}

function effectiveLogo(a: Appearance): Appearance['logo'] {
  return wallpaperHasPalette(a.wallpaper) ? a.logo : 'accent';
}

function seg<T extends string>(key: string, options: [T, string][], value: T, disabled = false): string {
  return `<div class="segmented" role="group">${options.map(([k, label]) => `
    <button type="button" data-action="pick" data-key="${key}" data-value="${k}" class="${value === k ? 'on' : ''}"
      aria-pressed="${value === k}" ${disabled ? 'disabled' : ''}>${esc(label)}</button>`).join('')}</div>`;
}

function appearanceCard(d: Draft): string {
  const a = d.look;
  const locked = !wallpaperHasPalette(a.wallpaper);
  const url = safeWallpaperUrl(a.url);
  return `
    <section class="card span-all" data-role="appearance" style="--i:0">
      <div class="card-head">
        <h3>Appearance</h3>
        <small>Changes preview instantly, Save keeps them.</small>
      </div>
      <div class="appearance">
        <div class="appearance-row"><span>Theme</span>
          ${seg('theme', [['dark', 'Dark'], ['light', 'Light']], d.theme)}
        </div>
        <div class="appearance-row"><span>Accent color</span>
          <div class="swatches">${ACCENTS.map((k) => `
            <button type="button" class="swatch ${a.accent === k ? 'on' : ''}" data-action="pick" data-key="accent" data-value="${k}"
              style="--sw:${ACCENT_SWATCH[k]}" title="${LABEL[k]}" aria-label="${LABEL[k]}" aria-pressed="${a.accent === k}"></button>`).join('')}
          </div>
        </div>
        <div class="appearance-row"><span>Wallpaper</span>
          <div class="wp-grid">${WALLPAPERS.map((k) => `
            <button type="button" class="wp-thumb ${a.wallpaper === k ? 'on' : ''}" data-action="pick" data-key="wallpaper" data-value="${k}"
              data-wallpaper="${k}" aria-pressed="${a.wallpaper === k}"
              ${k === 'custom' && url ? `style="background-image:${esc(cssUrl(url))}"` : ''}><span>${LABEL[k]}</span></button>`).join('')}
          </div>
          <label data-role="wp-url" style="margin-top:12px" ${a.wallpaper === 'custom' ? '' : 'hidden'}><span>Image URL</span>
            <input name="wp-url" type="url" inputmode="url" value="${esc(a.url)}" placeholder="https://example.com/wallpaper.jpg" autocomplete="off" spellcheck="false"></label>
        </div>
        <div class="appearance-row ${locked ? 'is-locked' : ''}"><span>Logo color</span>
          ${seg('logo', [['accent', 'Accent color'], ['wallpaper', 'Wallpaper']], effectiveLogo(a), locked)}
          <small class="logo-lock-note">Plain and Custom wallpapers don't have colors of their own, so the logo uses your accent color.</small>
        </div>
        <label class="checkbox"><input type="checkbox" data-role="reduce" ${a.transparency === 'reduced' ? 'checked' : ''}>
          <span>Reduce transparency</span></label>
      </div>
      <div class="settings-actions">
        <button type="button" class="btn btn-ghost" data-action="revert" ${isDirty() ? '' : 'disabled'}>Revert</button>
        <button type="button" class="btn btn-primary" data-action="save">${icon('check', 16)}Save</button>
      </div>
    </section>`;
}

/**
 * About, and the source offer.
 *
 * The link is required, not decorative: inphner is AGPL-3.0, and section 13
 * says a version people reach over a network has to prominently offer them its
 * Corresponding Source. Every visitor's browser is handed the whole app, so
 * that obligation is this deployment's too, not only a fork's. Keep it.
 */
function aboutCard(): string {
  return `
    <section class="card span-all" style="--i:9">
      <div class="card-head">
        <h3>About</h3>
        <small>inphner v${esc(VERSION)}</small>
      </div>
      <p>Free software under the
        <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">GNU AGPL-3.0</a>.
        Modify it and run it for others, and you owe them the source too.</p>
      <p><a href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer">Source code</a></p>
    </section>`;
}

function render(container: HTMLElement): void {
  if (!draft) return;
  const focused = document.activeElement as HTMLElement | null;
  const refocus = focused && container.contains(focused)
    ? (focused.getAttribute('name') ? `[name="${focused.getAttribute('name')}"]`
      : focused.dataset.key ? `[data-key="${focused.dataset.key}"][data-value="${focused.dataset.value}"]`
        : focused.dataset.action ? `[data-action="${focused.dataset.action}"]`
          : focused.dataset.role ? `[data-role="${focused.dataset.role}"]` : null)
    : null;
  container.innerHTML = `<div class="grid settings-grid">${appearanceCard(draft)}${prefsCards()}${dataCard()}${aboutCard()}</div>`;
  if (refocus) {
    const el = container.querySelector<HTMLElement>(refocus);
    el?.focus({ preventScroll: true });
    if (el instanceof HTMLInputElement && el.type === 'url') el.setSelectionRange(el.value.length, el.value.length);
  }
}

function preview(): void {
  if (!draft) return;
  applyTheme(draft.theme, false);
  applyAppearance(draft.look, false);
}

export function renderSettings(container: HTMLElement): void {
  // Always start from what is on screen (a borrowed inphub look included).
  draft = { theme: currentTheme(), look: currentAppearance() };
  chosenLogo = draft.look.logo;
  render(container);

  onAction(container, (action, el) => {
    if (!draft) return;
    if (handlePrefAction(action, el, () => render(container))) return;
    if (handleDataAction(action)) return;
    if (action === 'pick') {
      const { key, value } = el.dataset as { key: string; value: string };
      if (key === 'theme') draft.theme = value as Theme;
      else if (key === 'accent') draft.look.accent = value as Appearance['accent'];
      else if (key === 'logo') draft.look.logo = chosenLogo = value as Appearance['logo'];
      else if (key === 'wallpaper') {
        draft.look.wallpaper = value as Appearance['wallpaper'];
        draft.look.logo = wallpaperHasPalette(draft.look.wallpaper) ? chosenLogo : 'accent';
      }
      preview();
      render(container);
      if (key === 'wallpaper' && value === 'custom') container.querySelector<HTMLInputElement>('[name="wp-url"]')?.focus();
    } else if (action === 'save') {
      if (draft.look.wallpaper === 'custom' && !safeWallpaperUrl(draft.look.url)) {
        toast('Add an http(s) image URL for the custom wallpaper first.', { kind: 'bad' });
        container.querySelector<HTMLInputElement>('[name="wp-url"]')?.focus();
        return;
      }
      draft.look.logo = chosenLogo;
      applyTheme(draft.theme, true);
      applyAppearance(draft.look, true);
      toast('Appearance saved.', { kind: 'good' });
      render(container);
    } else if (action === 'revert') {
      revertToSaved();
      draft = { theme: currentTheme(), look: currentAppearance() };
      chosenLogo = draft.look.logo;
      render(container);
    }
  });

  if (wired.has(container)) return;
  wired.add(container);

  container.addEventListener('change', (e) => {
    if (handlePrefInput(e)) return;
    const t = e.target as HTMLInputElement;
    if (!draft || t.dataset.role !== 'reduce') return;
    draft.look.transparency = t.checked ? 'reduced' : 'full';
    preview();
    render(container);
  });

  let urlTimer = 0;
  container.addEventListener('input', (e) => {
    if (handlePrefInput(e)) return;
    const t = e.target as HTMLInputElement;
    if (!draft || t.name !== 'wp-url') return;
    draft.look.url = t.value.trim();
    clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => {
      preview();
      const thumb = container.querySelector<HTMLElement>('.wp-thumb[data-value="custom"]');
      const url = safeWallpaperUrl(draft?.look.url);
      if (thumb) thumb.style.backgroundImage = url ? cssUrl(url) : '';
      container.querySelector<HTMLButtonElement>('[data-action="revert"]')!.disabled = !isDirty();
    }, 350);
  });

  // The theme button in the topbar saves immediately; keep the card in step.
  window.addEventListener('inphner:theme', () => {
    if (!draft || container.hidden) return;
    const theme = currentTheme();
    if (theme === draft.theme) return;
    draft.theme = theme;
    render(container);
  });
}

/** Called by the router when leaving Settings: drop an unsaved preview. */
export function leaveSettings(): void {
  if (draft && isDirty()) {
    revertToSaved();
    toast('Unsaved appearance changes were discarded.');
  }
  draft = null;
}
