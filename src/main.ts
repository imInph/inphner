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
import { openModal } from './ui/modal.ts';
import { toast } from './ui/toast.ts';
import { DEFAULT_VIEW, VIEWS, viewMeta } from './views/registry.ts';
import { renderPlaceholder } from './views/placeholder.ts';
import { leaveSettings, renderSettings } from './views/settings.ts';
import { renderSessions } from './views/sessions.ts';
import { renderStats } from './views/stats.ts';
import { leaveTrainer, renderTrainer, trainerBusy } from './views/trainer.ts';
import { renderAlgorithms } from './views/algorithms.ts';
import { initTimer, leaveTimer, renderTimer, timerBusy } from './views/timer.ts';
import { currentSession, initStore } from './store.ts';
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

const VERSION = '1.0.0-pre';

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
  if (document.querySelector('.modal-backdrop')) return;

  // Cmd/Ctrl+K and K: the command palette (arrives in step 9).
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

function showShortcuts(): void {
  const row = (keys: string[], label: string) =>
    `<div class="row-compact" style="justify-content:space-between"><span>${esc(label)}</span>
      <span style="display:flex;gap:4px">${keys.map((k) => `<kbd style="margin:0">${esc(k)}</kbd>`).join('')}</span></div>`;
  openModal({
    title: 'Keyboard shortcuts',
    confirmLabel: 'Done',
    cancelLabel: '',
    bodyHtml: `
      <div class="micro-label" style="margin:0 0 6px 9px">Go to</div>
      ${VIEWS.map((v) => row(['g', v.key], v.label)).join('')}
      <div class="micro-label" style="margin:14px 0 6px 9px">Timer</div>
      ${row(['Space'], 'Hold until green, release to start')}
      ${row(['any key'], 'Stop')}
      ${row(['Esc'], 'Cancel a hold or inspection')}
      ${row(['↵'], 'Keep the last solve')}
      ${row(['2'], 'Toggle +2 on the last solve')}
      ${row(['D'], 'Toggle DNF on the last solve')}
      ${row(['C'], 'Comment on the last solve')}
      ${row(['⌫'], 'Delete the last solve')}
      ${row(['Alt', '1 / 2 / 3'], 'Last solve: OK / +2 / DNF')}
      ${row(['Alt', 'Z'], 'Undo the last delete')}
      <div class="micro-label" style="margin:14px 0 6px 9px">Anywhere</div>
      ${row(['K'], 'Search and commands')}
      ${row(['?'], 'This sheet')}
      ${row(['Esc'], 'Close a drawer or dialog')}`,
  });
}

/* ------------------------------------------------------------------- ambient */

/** Topbar turns to glass once content scrolls under it (≤768px); cards get a pointer-follow glow. */
function alive(): void {
  const topbar = document.getElementById('topbar');
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
  window.inphnerPalette = () => toast('The command palette arrives in a later build step.');
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

  window.__inphnerLoaded = true;
  console.info(`[inphner] v${VERSION} ready`);
}

void boot();
