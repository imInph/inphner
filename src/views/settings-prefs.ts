/**
 * inphner: the Timer and Inspection cards in Settings. These save as you
 * change them (no Save button): only Appearance has preview-then-save.
 */
import { inspectionFor, prefs, setPrefs, type Prefs } from '../prefs.ts';
import { currentSession } from '../store.ts';
import { eventDef } from '../events.ts';
import { beep, speak } from '../timer/sounds.ts';
import { esc } from '../ui/dom.ts';

interface SegOptions {
  /** Values that can't be picked yet. */
  disabled?: (string | number)[];
  /** Values that work in theory: built to the published protocol, never met the hardware. */
  experimental?: (string | number)[];
}

const EXPERIMENTAL_TITLE = 'Experimental: built to the published protocol but never tested against the real hardware.';

function seg(key: keyof Prefs, options: [string | number, string][], value: unknown, opts: SegOptions = {}): string {
  return `<div class="segmented" role="group">${options.map(([v, label]) => {
    const experimental = opts.experimental?.includes(v);
    return `
    <button type="button" data-action="pref" data-key="${key}" data-value="${v}" data-type="${typeof v}"
      class="${value === v ? 'on' : ''}${experimental ? ' is-experimental' : ''}" aria-pressed="${value === v}"
      ${experimental ? `title="${EXPERIMENTAL_TITLE}" aria-label="${esc(label)} (experimental, untested)"` : ''}
      ${opts.disabled?.includes(v) ? 'disabled title="Arrives in a later build step"' : ''}>${
      experimental ? '<i class="exp-mark" aria-hidden="true"></i>' : ''}${esc(label)}</button>`;
  }).join('')}</div>`;
}

function row(label: string, control: string, hint = ''): string {
  return `<div class="pref-row"><div class="pref-text"><span>${esc(label)}</span>${hint ? `<small>${esc(hint)}</small>` : ''}</div><div class="pref-control">${control}</div></div>`;
}

function switchRow(key: string, label: string, checked: boolean, hint = ''): string {
  return row(label, `<input type="checkbox" data-pref="${key}" ${checked ? 'checked' : ''} aria-label="${esc(label)}">`, hint);
}

export function prefsCards(): string {
  const p = prefs();
  const event = currentSession().event;
  const inspecting = inspectionFor(p, event);
  return `
    <section class="card" data-role="timer-prefs">
      <div class="card-head"><h3>Timer</h3><small>Saved as you change it.</small></div>
      <div class="pref-list">
        ${row('Hold to start', `
          <div class="range-field"><input type="range" min="0" max="1000" step="50" value="${p.holdMs}" data-pref="holdMs" aria-label="Hold threshold in milliseconds">
          <output class="num" data-out="holdMs">${p.holdMs} ms</output></div>`, 'How long space must be held before the time turns green.')}
        ${row('Precision', seg('precision', [[2, '0.01'], [3, '0.001']], p.precision))}
        ${row('While running', seg('live', [['full', 'Full'], ['tenths', '0.1'], ['seconds', 'Seconds'], ['off', 'Hidden']], p.live), '"Hidden" shows only "solving".')}
        ${row('Input', seg('input', [['keyboard', 'Timer'], ['typing', 'Typing'], ['stackmat', 'Stackmat'], ['smartcube', 'Smart cube']], p.input,
          { experimental: ['stackmat', 'smartcube'] }), 'Stackmat and Smart cube are experimental.')}
        ${p.input === 'stackmat' || p.input === 'smartcube' ? `
        <p class="pref-note"><span class="exp-mark" aria-hidden="true"></span>
          <span><strong>Experimental and untested.</strong> ${p.input === 'stackmat'
            ? 'The Stackmat decoder is built to the published 1200-baud packet format and has only ever been fed synthesised audio — it has never met a real timer. If it stays silent, the timer\'s signal may differ.'
            : 'Smart cube support speaks GAN\'s Bluetooth protocol through gan-web-bluetooth, but no cube has been paired with it here. Chrome will ask for the cube\'s MAC address, which is printed in the GAN app.'}
</span></p>` : ''}
        ${row('Phases', `<input type="number" min="1" max="10" step="1" value="${p.phases}" data-pref="phases" class="num-input" aria-label="Number of phases">`, 'More than 1 records a split on each press (e.g. 4: cross / F2L / OLL / PLL).')}
        ${switchRow('focusMode', 'Hide everything while timing', p.focusMode)}
        ${switchRow('confirmDelete', 'Confirm before deleting', p.confirmDelete, 'Off by default: the Undo toast is enough.')}
      </div>
    </section>
    <section class="card" data-role="inspection-prefs">
      <div class="card-head"><h3>Inspection</h3><small>WCA 15 s: +2 from 15 s, DNF past 17 s.</small></div>
      <div class="pref-list">
        ${switchRow('inspection', `Inspection for ${eventDef(event).short}`, inspecting, 'On by default for every event except blindfolded and FMC.')}
        ${row('Alerts at 8 s and 12 s', seg('alerts', [['off', 'Off'], ['beep', 'Beep'], ['voice', 'Voice']], p.alerts))}
        ${row('Volume', `
          <div class="range-field"><input type="range" min="0" max="1" step="0.05" value="${p.volume}" data-pref="volume" aria-label="Alert volume">
          <button type="button" class="btn btn-sm" data-action="test-alert" ${p.alerts === 'off' ? 'disabled' : ''}>Test</button></div>`)}
      </div>
    </section>`;
}

/** Wire the cards' controls. `rerender` redraws Settings (e.g. after a segmented pick). */
export function handlePrefAction(action: string, el: HTMLElement, rerender: () => void): boolean {
  if (action === 'pref') {
    const key = el.dataset.key as keyof Prefs;
    const value = el.dataset.type === 'number' ? Number(el.dataset.value) : el.dataset.value;
    setPrefs({ [key]: value } as Partial<Prefs>);
    rerender();
    return true;
  }
  if (action === 'test-alert') {
    if (prefs().alerts === 'beep') beep(false);
    else if (prefs().alerts === 'voice') speak('Eight seconds');
    return true;
  }
  return false;
}

/** input/change events from ranges, numbers and switches. Returns true when handled. */
export function handlePrefInput(e: Event): boolean {
  const t = e.target as HTMLInputElement;
  const key = t.dataset.pref;
  if (!key) return false;
  if (t.type === 'range') {
    const out = t.closest('.pref-row')?.querySelector<HTMLOutputElement>(`[data-out="${key}"]`);
    if (out) out.textContent = `${t.value} ms`;
    if (e.type === 'change' || key === 'volume') setPrefs({ [key]: Number(t.value) } as Partial<Prefs>);
    return true;
  }
  if (e.type !== 'change') return true;
  if (t.type === 'checkbox') {
    if (key === 'inspection') setPrefs({ inspection: { ...prefs().inspection, [currentSession().event]: t.checked } });
    else setPrefs({ [key]: t.checked } as Partial<Prefs>);
    return true;
  }
  if (t.type === 'number') {
    const n = Math.round(Number(t.value));
    const v = setPrefs({ [key]: Number.isFinite(n) ? n : 1 } as Partial<Prefs>);
    t.value = String(v[key as 'phases']);
    return true;
  }
  return false;
}
