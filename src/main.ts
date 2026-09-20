/**
 * inphner: app shell. Builds the sidebar, routes between views, and wires the
 * global chrome (theme button, drawer, clock, greeting, hotkeys).
 *
 * Global chrome buttons use inline onclick="window.inphner*()" in index.html,
 * not addEventListener: in the owner's Firefox setup listeners on these
 * silently never fired (likely an extension) while DOM level-0 handlers are
 * immune. Keep it that way.
 */
import { greetingFor } from './appearance.ts';
import { parseRoute, routeKey, go, type Route } from './router.ts';
import { toggleTheme } from './theme.ts';
import { esc, isTyping } from './ui/dom.ts';
import { icon } from './ui/icons.ts';
import { toast } from './ui/toast.ts';
import { DEFAULT_VIEW, VIEWS, viewMeta } from './views/registry.ts';
import { renderPlaceholder } from './views/placeholder.ts';
import { showShortcuts } from './views/shortcuts.ts';
import { leaveSettings, renderSettings } from './views/settings.ts';
import { renderSessions } from './views/sessions.ts';
import { renderStats } from './views/stats.ts';
import { leaveTools, renderTools } from './views/tools.ts';
import { leaveTrainer, renderTrainer, trainerBusy } from './views/trainer.ts';
import { renderAlgorithms } from './views/algorithms.ts';
import { initTimer, leaveTimer, renderTimer, timerBusy } from './views/timer.ts';
import { registerServiceWorker } from './pwa/register.ts';
import { countAll } from './db/idb.ts';
import { prefs, setPrefs } from './prefs.ts';
import { backupOverdue, nudgeMessage, shouldNudge, type BackupState } from './backup-nudge.ts';
import { currentSession, initStore, storageProtection } from './store.ts';
import { warm } from './scramble/generator.ts';
import { openSessionPicker, renderSessionPill } from './views/session-picker.ts';

declare global {
  interface Window {
    inphnerToggleTheme?: () => void;
    inphnerDrawer?: (open?: boolean) => void;
    inphnerPalette?: () => void;
    inphnerShortcuts?: () => void;
    inphnerEventPicker?: (trigger: HTMLElement) => void;
    __inphnerLoaded?: boolean;
  }
}

const VERSION = '1.1.1';

/* ------------------------------------------------------------------ sidebar */

function buildSidebar(): void {
  const nav = document.getElementById('nav')!;
  nav.innerHTML = VIEWS.map((v) => `
    <a href="#${v.id}" class="nav-item" data-view="${v.id}" title="${esc(v.label)} (g ${v.key})">
      ${icon(v.icon)}<span class="nav-label">${esc(v.label)}</span>
    </a>`).join('');

  document.getElementById('sidebar-foot')!.innerHTML = `
    <button type="button" class="btn btn-ghost nav-item" onclick="window.inphnerPalette&&window.inphnerPalette()" title="Search (K or ⌘K)">
      ${icon('search')}<span class="nav-label">Search</span><kbd>K</kbd></button>
    <button type="button" class="btn btn-ghost nav-item" onclick="window.inphnerShortcuts&&window.inphnerShortcuts()" title="Keyboard shortcuts (?)">
      ${icon('keyboard')}<span class="nav-label">Shortcuts</span><kbd>?</kbd></button>`;
}

/* ------------------------------------------------------------------- router */

let currentView = '';
let currentRoute = '';

function activate(route: Route): void {
  const meta = viewMeta(route.view) ?? viewMeta(DEFAULT_VIEW)!;
  const previous = currentView;
  currentView = meta.id;
  currentRoute = routeKey(route);

  if (previous === 'settings' && meta.id !== 'settings') leaveSettings();
  if (previous === 'timer' && meta.id !== 'timer') leaveTimer();
  if (previous === 'trainer' && meta.id !== 'trainer') leaveTrainer();
  if (previous === 'tools' && meta.id !== 'tools') leaveTools();

  document.querySelectorAll<HTMLElement>('.view').forEach((el) => {
    el.hidden = el.id !== `view-${meta.id}`;
  });
  document.querySelectorAll<HTMLElement>('.nav-item[data-view]').forEach((el) => {
    const on = el.dataset.view === meta.id;
    el.classList.toggle('active', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });
  document.getElementById('page-title')!.textContent = meta.label;
  document.title = meta.id === DEFAULT_VIEW ? 'inphner' : `${meta.label} · inphner`;

  const container = document.getElementById(`view-${meta.id}`)!;
  if (meta.id === 'timer') renderTimer(container);
  else if (meta.id === 'settings') renderSettings(container);
  else if (meta.id === 'sessions') renderSessions(container);
  else if (meta.id === 'stats') renderStats(container);
  else if (meta.id === 'trainer') void renderTrainer(container);
  else if (meta.id === 'algorithms') void renderAlgorithms(container);
  else if (meta.id === 'tools') renderTools(container);
  else renderPlaceholder(container, meta);

  if (previous && previous !== meta.id) window.scrollTo({ top: 0 });
}

function onRoute(): void {
  const route = parseRoute();
  if (routeKey(route) !== currentRoute) activate(route);
}

/* ----------------------------------------------------------- clock + greeting */

function tick(): void {
  const clock = document.getElementById('clock');
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  const greeting = document.getElementById('greeting');
  if (greeting) {
    const text = greetingFor(new Date().getHours());
    if (greeting.textContent !== text) greeting.textContent = text;
  }
}

/* ----------------------------------------------------------------- shortcuts */

let awaitingG = false;
let gTimer = 0;

function onKey(e: KeyboardEvent): void {
  if (e.defaultPrevented || isTyping(e.target) || timerBusy() || trainerBusy()) return;
  if (document.querySelector('.modal-backdrop, .palette-overlay')) return;

  // Cmd/Ctrl+K and K: the command palette.
  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey) && !e.altKey) {
    e.preventDefault();
    window.inphnerPalette?.();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  if (awaitingG) {
    awaitingG = false;
    clearTimeout(gTimer);
    const dest = VIEWS.find((v) => v.key === e.key.toLowerCase());
    if (dest) {
      e.preventDefault();
      go(dest.id);
    }
    return;
  }
  if (e.key === 'g') {
    awaitingG = true;
    gTimer = window.setTimeout(() => { awaitingG = false; }, 1200);
  } else if (e.key === '?') {
    e.preventDefault();
    window.inphnerShortcuts?.();
  } else if (e.key === 'k') {
    e.preventDefault();
    window.inphnerPalette?.();
  } else if (e.key === 'Escape') {
    window.inphnerDrawer?.(false);
  }
}

/* ----------------------------------------------------------------- palette */

/** The palette and the commands it lists are one lazy chunk: they pull in the
 *  import/export views, which nothing else needs before you ask for them. */
function openPalette(): void {
  if (timerBusy() || trainerBusy()) return;
  void Promise.all([import('./ui/palette.ts'), import('./views/commands.ts')])
    .then(([palette, commands]) => palette.openPalette(commands.paletteItems))
    .catch(() => toast('The command palette could not load.', { kind: 'bad' }));
}

/* ------------------------------------------------------------------- ambient */

/** Topbar turns to glass once content scrolls under it (≤768px); cards get a pointer-follow glow. */
function alive(): void {
  const topbar = document.getElementById('topbar');
  // The Timer view sizes itself against the viewport minus this, so the bottom
  // sheet can never crowd the time. Safe-area insets and font size change it,
  // so it is measured rather than guessed.
  if (topbar) {
    const setTopbar = () => document.documentElement.style.setProperty('--topbar-h', `${Math.round(topbar.getBoundingClientRect().height)}px`);
    setTopbar();
    new ResizeObserver(setTopbar).observe(topbar);
  }
  const onScroll = () => topbar?.classList.toggle('scrolled', window.scrollY > 4);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (!window.matchMedia('(hover: hover)').matches) return;
  let frame = 0;
  let last: PointerEvent | null = null;
  document.addEventListener('pointermove', (e) => {
    last = e;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const card = (last?.target as HTMLElement | null)?.closest?.<HTMLElement>('.card');
      if (!card || !last) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${Math.round(last.clientX - r.left)}px`);
      card.style.setProperty('--my', `${Math.round(last.clientY - r.top)}px`);
    });
  }, { passive: true });
}

/* ---------------------------------------------------------------------- boot */

async function boot(): Promise<void> {
  buildSidebar();
  initTimer();

  const sidebar = document.getElementById('sidebar')!;
  const backdrop = document.getElementById('nav-backdrop')!;
  const setDrawer = (open: boolean) => {
    sidebar.classList.toggle('open', open);
    backdrop.hidden = !open;
    document.body.classList.toggle('drawer-open', open);
    document.getElementById('btn-nav')?.setAttribute('aria-expanded', String(open));
  };

  window.inphnerToggleTheme = toggleTheme;
  window.inphnerDrawer = (open?: boolean) => setDrawer(open ?? !sidebar.classList.contains('open'));
  window.inphnerPalette = openPalette;
  window.inphnerShortcuts = showShortcuts;
  window.inphnerEventPicker = (trigger: HTMLElement) => {
    if (!timerBusy()) void openSessionPicker(trigger);
  };

  // Choosing a destination in the drawer closes it.
  sidebar.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.nav-item')) setDrawer(false);
  });
  // Growing past the drawer breakpoint with the drawer open would leave the scroll lock on.
  window.matchMedia('(max-width: 768px)').addEventListener('change', (m) => { if (!m.matches) setDrawer(false); });

  window.addEventListener('hashchange', onRoute);
  document.addEventListener('keydown', onKey);

  tick();
  setInterval(tick, 1000);
  alive();

  // Sessions + the current session's solves, before any view renders.
  try {
    await initStore();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    document.getElementById('view-timer')!.hidden = false;
    document.getElementById('view-timer')!.innerHTML = `<div class="card empty" style="max-width:520px;margin:40px auto">
      <h3>inphner can't open its database</h3><p>${esc(msg)}</p>
      <p class="text-dim">Private browsing, or storage turned off for this site, can block IndexedDB.</p></div>`;
    return;
  }
  renderSessionPill();
  warm(currentSession().event);
  window.addEventListener('inphner:sessions', renderSessionPill);

  const initial = parseRoute();
  if (!viewMeta(initial.view)) location.replace('#' + DEFAULT_VIEW);
  activate(parseRoute());

  registerServiceWorker();
  void watchBackups();
  window.__inphnerLoaded = true;
  console.info(`[inphner] v${VERSION} ready`);
}

/* ------------------------------------------------------------ backups */

/**
 * The backup reminder. Solves live in this browser and nowhere else, so a
 * cleared cache or an evicted database loses the lot. A dot on Settings says
 * so quietly and permanently; the toast says it out loud at most once a week,
 * and never over a solve — see backup-nudge.ts for when.
 */
let solveCount = 0;

async function watchBackups(): Promise<void> {
  try {
    solveCount = await countAll('solves');
  } catch {
    return; // No database, nothing to protect.
  }
  const protectedStorage = await storageProtection();
  const read = (): BackupState => {
    const p = prefs();
    return { now: Date.now(), lastExportAt: p.lastExportAt, lastNudgeAt: p.lastNudgeAt, solves: solveCount, protectedStorage };
  };

  paintBackupDot(backupOverdue(read()));
  // An export (or an import) changes the answer; repaint without recounting.
  window.addEventListener('inphner:prefs', () => paintBackupDot(backupOverdue(read())));
  window.addEventListener('inphner:solves', () => { solveCount++; });

  const state = read();
  if (!shouldNudge(state)) return;
  await whenIdle();
  if (!shouldNudge(read())) return; // Backed up while we waited.

  setPrefs({ lastNudgeAt: Date.now() });
  toast(nudgeMessage(state), {
    action: {
      label: 'Back up',
      run: () => { void import('./views/data-io.ts').then((m) => m.handleDataAction('data-export')); },
    },
  });
}

/** A warning dot on the Settings item, shown whenever a backup is overdue. */
function paintBackupDot(on: boolean): void {
  const item = document.querySelector<HTMLElement>('.nav-item[data-view="settings"]');
  if (!item) return;
  const existing = item.querySelector('.nav-dot');
  if (!on) { existing?.remove(); return; }
  if (existing) return;
  const dot = document.createElement('span');
  dot.className = 'nav-dot dot warn';
  dot.title = 'A backup is due';
  item.appendChild(dot);
}

/** Settle after boot, and never interrupt a solve or a drill. */
function whenIdle(): Promise<void> {
  return new Promise((resolve) => {
    const tick = (): void => {
      if (timerBusy() || trainerBusy()) setTimeout(tick, 2000);
      else resolve();
    };
    setTimeout(tick, 6000);
  });
}

void boot();
