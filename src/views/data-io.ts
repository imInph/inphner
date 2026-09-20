/**
 * inphner: import / export (inphner-prompt.md §A6, §A10 "Data").
 *
 * Import detects the file: inphner backup JSON (merged by id + updatedAt),
 * a csTimer export (.txt JSON), or a CSV. It always shows a preview with the
 * counts first; nothing is written until "Import", and an import can be
 * undone while its toast shows.
 * Export: inphner JSON (full fidelity), CSV, csTimer-compatible JSON; all
 * sessions or just the current one.
 */
import { EVENTS } from '../events.ts';
import { parseBackup, buildBackup } from '../io/backup.ts';
import { buildCsTimer, parseCsTimer, type ImportedSession, type ImportedSolve } from '../io/cstimer.ts';
import { buildCsv, parseCsv } from '../io/csv.ts';
import { prefs, setPrefs } from '../prefs.ts';
import {
  currentSession, eraseEverything, everything, importIntoSession, importSessions, loadSolves, mergeBackup,
  orderedSessions, removeSessions, sessionLabel, deleteSolves,
  storageProtectedNow,
} from '../store.ts';
import { localDay } from '../stats/chart-data.ts';
import { esc } from '../ui/dom.ts';
import { openModal } from '../ui/modal.ts';
import { toast } from '../ui/toast.ts';

/* ------------------------------------------------------------------ files */

function download(name: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.json,.csv,text/plain,application/json,text/csv';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

const eventOptions = (selected: string) => `
  <optgroup label="WCA">${EVENTS.filter((e) => e.group === 'wca').map((e) => `<option value="${e.id}" ${e.id === selected ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>
  <optgroup label="Training">${EVENTS.filter((e) => e.group === 'training').map((e) => `<option value="${e.id}" ${e.id === selected ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>`;

function dateSpan(solves: ImportedSolve[]): string {
  const ts = solves.map((s) => s.createdAt).filter((t) => t > 0);
  if (!ts.length) return 'no dates';
  const a = localDay(Math.min(...ts));
  const b = localDay(Math.max(...ts));
  return a === b ? a : `${a} → ${b}`;
}

const strip = (s: ImportedSolve) => ({
  timeMs: s.timeMs, penalty: s.penalty, scramble: s.scramble, createdAt: s.createdAt,
  ...(s.comment ? { comment: s.comment } : {}), ...(s.splits ? { splits: s.splits } : {}), ...(s.solution ? { solution: s.solution } : {}),
});

/* ----------------------------------------------------------------- import */

export async function openImport(): Promise<void> {
  const file = await pickFile();
  if (!file) return;
  if (file.size > 60 * 1024 * 1024) {
    toast('That file is over 60 MB; is it the right one?', { kind: 'bad' });
    return;
  }
  const text = await file.text();
  const trimmed = text.trimStart();
  try {
    if (trimmed.startsWith('{')) {
      const backup = parseBackup(text);
      if (backup) return previewBackup(backup, file.name);
      const cs = parseCsTimer(text);
      return previewCsTimer(cs.sessions, cs.skipped, file.name);
    }
    const csv = parseCsv(text);
    if (!csv.solves.length) throw new Error('No times found in this file.');
    return previewCsv(csv.solves, csv.skipped, file.name);
  } catch (err) {
    toast(err instanceof Error ? err.message : 'Could not read that file.', { kind: 'bad' });
  }
}

function previewCsTimer(list: ImportedSession[], skipped: number, fileName: string): void {
  const nonEmpty = list.filter((s) => s.solves.length);
  const total = nonEmpty.reduce((a, s) => a + s.solves.length, 0);
  openModal({
    title: 'Import from csTimer',
    size: 'lg',
    confirmLabel: `Import ${total} solves`,
    bodyHtml: `
      <p class="text-dim import-file">${esc(fileName)} · ${nonEmpty.length} session${nonEmpty.length === 1 ? '' : 's'} with solves${skipped ? ` · ${skipped} unreadable entr${skipped === 1 ? 'y' : 'ies'} skipped` : ''}</p>
      <p class="text-dim" style="margin-top:0">Each becomes a new session. Check the events: csTimer doesn't record OH or BLD for 3x3, so those are guessed from the session name.</p>
      <div class="import-list">${nonEmpty.map((s, i) => `
        <div class="import-row">
          <input type="checkbox" data-i="${i}" checked aria-label="Import ${esc(s.name)}">
          <input name="name-${i}" value="${esc(s.name)}" maxlength="60" aria-label="Session name">
          <select name="event-${i}" aria-label="Event">${eventOptions(s.event)}</select>
          <span class="num import-count">${s.solves.length}</span>
          <small class="text-dim import-dates">${esc(dateSpan(s.solves))}</small>
        </div>`).join('')}
      </div>`,
    onConfirm: async (m) => {
      const chosen = nonEmpty.map((s, i) => ({ s, i })).filter(({ i }) => m.querySelector<HTMLInputElement>(`[data-i="${i}"]`)!.checked);
      if (!chosen.length) return false;
      const ids = await importSessions(chosen.map(({ s, i }) => ({
        name: m.querySelector<HTMLInputElement>(`[name="name-${i}"]`)!.value,
        event: m.querySelector<HTMLSelectElement>(`[name="event-${i}"]`)!.value,
        solves: s.solves.map(strip),
      })));
      const n = chosen.reduce((a, { s }) => a + s.solves.length, 0);
      toast(`Imported ${n} solves into ${ids.length} session${ids.length === 1 ? '' : 's'}.`, {
        kind: 'good', action: { label: 'Undo', run: () => { void removeSessions(ids).then(() => toast('Import undone.')); } },
      });
    },
  });
}

function previewCsv(solves: ImportedSolve[], skipped: number, fileName: string): void {
  const cur = currentSession();
  const sample = solves.slice(0, 5).map((s) => `${(s.timeMs / 1000).toFixed(2)}${s.penalty === 2000 ? '+2' : s.penalty === 'DNF' ? ' DNF' : ''}`).join(' · ');
  openModal({
    title: 'Import CSV',
    confirmLabel: `Import ${solves.length} solves`,
    bodyHtml: `
      <p class="text-dim import-file">${esc(fileName)} · ${solves.length} times${skipped ? ` · ${skipped} rows skipped` : ''} · ${esc(dateSpan(solves))}</p>
      <p class="text-dim" style="margin-top:0">First: <span class="num">${esc(sample)}</span></p>
      <div class="segmented" role="group" aria-label="Where to"><button type="button" data-to="new" class="on">New session</button><button type="button" data-to="existing">Existing session</button></div>
      <div data-where="new" style="margin-top:12px" class="field-row">
        <label><span>Name</span><input name="name" value="${esc(fileName.replace(/\.[^.]+$/, '').slice(0, 60))}" maxlength="60"></label>
        <label><span>Event</span><select name="event">${eventOptions(cur.event)}</select></label>
      </div>
      <div data-where="existing" style="margin-top:12px" hidden>
        <label><span>Session</span><select name="into">${orderedSessions().map((x) => `<option value="${esc(x.id)}" ${x.id === cur.id ? 'selected' : ''}>${esc(sessionLabel(x))}</option>`).join('')}</select></label>
      </div>`,
    onConfirm: async (m) => {
      const toNew = !m.querySelector<HTMLElement>('[data-where="new"]')!.hidden;
      if (toNew) {
        const ids = await importSessions([{
          name: m.querySelector<HTMLInputElement>('[name="name"]')!.value,
          event: m.querySelector<HTMLSelectElement>('[name="event"]')!.value,
          solves: solves.map(strip),
        }]);
        toast(`Imported ${solves.length} solves.`, { kind: 'good', action: { label: 'Undo', run: () => { void removeSessions(ids); } } });
      } else {
        const into = m.querySelector<HTMLSelectElement>('[name="into"]')!.value;
        const ids = await importIntoSession(into, solves.map(strip));
        toast(`Imported ${ids.length} solves.`, {
          kind: 'good',
          action: { label: 'Undo', run: () => { void deleteSolves(ids).then((removed) => { if (removed.length) toast('Import undone.'); }); } },
        });
      }
    },
  });
  const modal = document.querySelector<HTMLElement>('.modal')!;
  modal.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-to]');
    if (!b) return;
    modal.querySelectorAll<HTMLElement>('[data-to]').forEach((x) => x.classList.toggle('on', x === b));
    modal.querySelector<HTMLElement>('[data-where="new"]')!.hidden = b.dataset.to !== 'new';
    modal.querySelector<HTMLElement>('[data-where="existing"]')!.hidden = b.dataset.to !== 'existing';
  });
}

function previewBackup(b: NonNullable<ReturnType<typeof parseBackup>>, fileName: string): void {
  openModal({
    title: 'Restore an inphner backup',
    confirmLabel: 'Merge',
    bodyHtml: `
      <p class="text-dim import-file">${esc(fileName)} · ${b.sessions.length} sessions · ${b.solves.length} solves${b.dropped ? ` · ${b.dropped} malformed records skipped` : ''}</p>
      <p>Records are matched by their id: new ones are added, and ones you already have are replaced only if the backup's copy is newer. Nothing is duplicated or deleted.</p>`,
    onConfirm: async () => {
      const r = await mergeBackup(b);
      toast(`Backup merged: ${r.sessions} sessions and ${r.solves} solves added or updated.`, { kind: 'good' });
    },
  });
}

/* ----------------------------------------------------------------- export */

export function openExport(): void {
  const cur = currentSession();
  openModal({
    title: 'Export',
    confirmLabel: 'Download',
    bodyHtml: `
      <div class="appearance-row"><span>Format</span>
        <div class="segmented" role="group" data-group="format">
          <button type="button" data-v="inphner" class="on">inphner backup</button><button type="button" data-v="csv">CSV</button><button type="button" data-v="cstimer">csTimer</button>
        </div>
        <small class="text-dim format-note" style="display:block;margin-top:6px">Everything, exactly: use this to back up or move to another browser.</small>
      </div>
      <div class="appearance-row" style="margin-top:14px"><span>Sessions</span>
        <div class="segmented" role="group" data-group="scope">
          <button type="button" data-v="all" class="on">All sessions</button><button type="button" data-v="current">${esc(sessionLabel(cur))}</button>
        </div>
      </div>`,
    onConfirm: async (m) => {
      const val = (g: string) => m.querySelector<HTMLElement>(`[data-group="${g}"] .on`)!.dataset.v!;
      const format = val('format');
      const scope = val('scope');
      const all = await everything();
      const sessions = scope === 'all' ? all.sessions : [cur];
      const ids = new Set(sessions.map((s) => s.id));
      const solves = scope === 'all' ? all.solves : await loadSolves(cur.id);
      const day = localDay(Date.now());
      const tag = scope === 'all' ? 'all' : cur.name.replace(/[^\w-]+/g, '-').toLowerCase();
      if (format === 'inphner') {
        download(`inphner-${tag}-${day}.json`, buildBackup(sessions, solves.filter((x) => ids.has(x.sessionId))), 'application/json');
      } else if (format === 'csv') {
        const byId = new Map(sessions.map((s) => [s.id, s]));
        download(`inphner-${tag}-${day}.csv`, buildCsv(solves.map((x) => ({
          session: byId.get(x.sessionId)?.name ?? '', event: x.event, timeMs: x.timeMs, penalty: x.penalty,
          scramble: x.scramble, createdAt: x.createdAt, ...(x.comment ? { comment: x.comment } : {}),
        }))), 'text/csv');
      } else {
        download(`cstimer-${tag}-${day}.txt`, buildCsTimer(sessions.map((s) => ({
          name: s.name, event: s.event, solves: solves.filter((x) => x.sessionId === s.id),
        }))), 'text/plain');
      }
      if (scope === 'all' && format === 'inphner') setPrefs({ lastExportAt: Date.now() });
      toast('Export downloaded.', { kind: 'good' });
    },
  });
  const modal = document.querySelector<HTMLElement>('.modal')!;
  const notes: Record<string, string> = {
    inphner: 'Everything, exactly: use this to back up or move to another browser.',
    csv: 'One row per solve: session, event, result, raw ms, penalty, scramble, comment, date.',
    cstimer: 'Opens in csTimer (Export / Import → Import from file).',
  };
  modal.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-v]');
    if (!b) return;
    b.parentElement!.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b));
    if (b.closest('[data-group="format"]')) modal.querySelector('.format-note')!.textContent = notes[b.dataset.v!] ?? '';
  });
}

/* --------------------------------------------------------- settings: data */

export function lastExportText(): string {
  const t = prefs().lastExportAt;
  if (!t) return 'You haven\'t made a backup yet.';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days >= 30) return `You haven't exported in ${days} days.`;
  return days === 0 ? 'Last backup: today.' : `Last backup: ${days} day${days === 1 ? '' : 's'} ago.`;
}

export function backupDue(): boolean {
  const t = prefs().lastExportAt;
  return !t || Date.now() - t > 30 * 86400000;
}

export function dataCard(): string {
  return `
    <section class="card" data-role="data">
      <div class="card-head"><h3>Data</h3><small>Everything lives in this browser.</small></div>
      <p class="${backupDue() ? 'text-warn' : 'text-dim'}" style="margin:0 0 6px">${esc(lastExportText())}</p>
      <p class="${storageProtectedNow() ? 'text-dim' : 'text-warn'}" style="margin:0 0 12px">${esc(storageProtectedNow()
        ? "This browser has marked your solves as protected, so they won't be cleared to free up space."
        : "This browser hasn't promised to keep your solves, so they can be cleared to free up space. Adding inphner to your home screen usually earns that promise.")}</p>
      <div class="data-actions">
        <button type="button" class="btn btn-sm" data-action="data-export">Export / back up…</button>
        <button type="button" class="btn btn-sm" data-action="data-import">Import…</button>
        <span class="grow"></span>
        <button type="button" class="btn btn-danger btn-sm" data-action="data-erase">Erase everything…</button>
      </div>
      <small class="text-dim" style="display:block;margin-top:10px">Import reads csTimer exports (.txt), CSV files and inphner backups.</small>
    </section>`;
}

export function handleDataAction(action: string): boolean {
  if (action === 'data-export') { openExport(); return true; }
  if (action === 'data-import') { void openImport(); return true; }
  if (action === 'data-erase') { eraseDialog(); return true; }
  return false;
}

function eraseDialog(): void {
  openModal({
    title: 'Erase everything?',
    danger: true,
    confirmLabel: 'Erase',
    bodyHtml: `
      <p>Every session and every solve in this browser will be deleted. This can't be undone. Export a backup first if you might want them.</p>
      <label><span>Type <strong>delete</strong> to confirm</span><input name="confirm" autocomplete="off" spellcheck="false"></label>`,
    onConfirm: async (m) => {
      if (m.querySelector<HTMLInputElement>('[name="confirm"]')!.value.trim().toLowerCase() !== 'delete') {
        m.querySelector<HTMLInputElement>('[name="confirm"]')!.focus();
        return false;
      }
      await eraseEverything();
      toast('Everything was erased.');
    },
  });
}
