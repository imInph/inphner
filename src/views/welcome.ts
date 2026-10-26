/**
 * inphner: the welcome sheet a first-time visitor sees once.
 *
 * "First time" means nothing recorded yet: no `inphner.welcomed` stamp and no
 * solves in any session. Someone who was using inphner before the sheet
 * existed has solves, so they never get it. The stamp is written as the sheet
 * opens, so a reload or a closed tab doesn't bring it back.
 *
 * It says what inphner is, offers the csTimer import (most visitors are
 * switching from it), says where the solves live, and on a phone that isn't
 * running it installed, how to install it. It waits for a moment after boot
 * and never opens over a solve or a drill.
 */
import { countAll } from '../db/idb.ts';
import { icon } from '../ui/icons.ts';
import { GUIDES, guideHref } from '../guides.ts';
import { openModal } from '../ui/modal.ts';
import { openImport } from './data-io.ts';

const KEY = 'inphner.welcomed';

function seen(): boolean {
  try { return localStorage.getItem(KEY) !== null; } catch { return true; } // No storage: it would show every visit.
}

function markSeen(): void {
  try { localStorage.setItem(KEY, String(Date.now())); } catch { /* see seen() */ }
}

/** A touch device not already running inphner from its home screen. */
function installHint(): string {
  const standalone = matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || !matchMedia('(pointer: coarse)').matches) return '';
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
  const how = ios
    ? 'In Safari, tap Share and then Add to Home Screen.'
    : 'Open the browser menu and pick Install app (or Add to Home screen).';
  return `
    <li>
      <span class="badge-ico tint-teal">${icon('down', 16)}</span>
      <div><strong>Want it on your home screen?</strong> ${how} It opens like an app after that, and works offline.</div>
    </li>`;
}

export async function maybeWelcome(isBusy: () => boolean): Promise<void> {
  if (seen()) return;
  try {
    if (await countAll('solves') > 0) { markSeen(); return; }
  } catch {
    return; // No database: the app can't keep solves anyway, and has bigger things to say.
  }
  // Let the first paint settle; never land on a solve or a drill.
  await new Promise<void>((resolve) => {
    const tick = (): void => {
      if (isBusy() || document.querySelector('.modal-backdrop')) setTimeout(tick, 1500);
      else resolve();
    };
    setTimeout(tick, 700);
  });
  if (seen()) return; // Another tab got there first.
  markSeen();

  const { root, close } = openModal({
    title: 'Welcome to inphner',
    confirmLabel: 'Got it',
    cancelLabel: '',
    bodyHtml: `
      <p class="welcome-lead">It's a free timer for speedcubing. You get WCA scrambles for every event, your averages
        and charts, and a trainer for PLL, OLL and F2L.</p>
      <ul class="welcome-list">
        <li>
          <span class="badge-ico tint-blue">${icon('stack', 16)}</span>
          <div><strong>Using csTimer?</strong> You can bring all your sessions over. It shows you what it found before
            anything gets saved.
            <button type="button" class="btn btn-sm" data-welcome="import">Import from csTimer</button></div>
        </li>
        <li>
          <span class="badge-ico tint-orange">${icon('lock', 16)}</span>
          <div><strong>Your solves only live in this browser.</strong> Nothing gets uploaded, so back them up once in a
            while from Settings → Data. You'll get a reminder.</div>
        </li>${installHint()}
      </ul>
      <div class="welcome-guides">
        <small>Guides, in a new tab</small>
        <div>${GUIDES.map((g) => `<a class="btn btn-sm" href="${guideHref(g.slug)}" target="_blank" rel="noopener">${g.label}</a>`).join('')}</div>
        <small><a href="${guideHref('privacy')}" target="_blank" rel="noopener">Privacy policy</a> · <a href="${guideHref('terms')}" target="_blank" rel="noopener">Terms</a></small>
      </div>`,
  });
  root.querySelector('[data-welcome="import"]')?.addEventListener('click', () => {
    close();
    // Synchronously inside the click: Safari only opens a file picker from a user gesture.
    void openImport();
  });
}
