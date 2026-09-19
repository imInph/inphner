/**
 * inphner: the Sessions view. Left: every session (drag to reorder, rename,
 * use, archive, merge, delete); archived ones folded below. Right: the
 * focused session's full, virtualised solve list with bulk select → move /
 * delete. Route: #sessions?focus=<sessionId> (read, never consumed).
 * Import / export: views/data-io.ts.
 */
import { EVENTS, eventDef } from '../events.ts';
import { DNF, effective, statAt, summarize } from '../stats/core.ts';
import {
  currentSession, deleteSession, loadSolves, mergeSessions, moveSolves, orderedSessions, reorderSessions,
  restoreSession, sessionById, sessionLabel, sessionSummaries, setCurrentSession, unmerge, updateSession,
  type Session, type SessionSummary,
} from '../store.ts';
import { prefs } from '../prefs.ts';
import { go, parseRoute } from '../router.ts';
import { esc, onAction } from '../ui/dom.ts';
import { eventIcon } from '../ui/event-icon.ts';
import { icon } from '../ui/icons.ts';
import { openModal } from '../ui/modal.ts';
import { sortable } from '../ui/sortable.ts';
import { toast } from '../ui/toast.ts';
import { newSessionDialog } from './session-picker.ts';
import { fmtStat, listData, renderSolveList } from './solve-list.ts';
import { formatSingle, parseTypedTime } from '../timer/format.ts';
import { deleteWithUndo, openSolveModal } from './solve-modal.ts';
import { openExport, openImport } from './data-io.ts';

let host: HTMLElement | null = null;
let focusId = '';
let selecting = false;
const selected = new Set<string>();
let renderToken = 0;
const wired = new WeakSet<HTMLElement>();

export function renderSessions(el: HTMLElement): void {
  host = el;
  const want = parseRoute().params.get('focus') ?? '';
  const nextFocus = sessionById(want) ? want : currentSession().id;
  if (nextFocus !== focusId) {
    selecting = false;
    selected.clear();
  }
  focusId = nextFocus;
  void draw();
  onAction(el, (action, target) => void act(action, target));
  if (!wired.has(el)) {
    wired.add(el);
    el.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.name === 'bulk-move' && t.value) void bulkMove(t.value).finally(() => { t.value = ''; });
    });
    const redraw = () => { if (host && !host.hidden) void draw(); };
    window.addEventListener('inphner:sessions', redraw);
    window.addEventListener('inphner:solves', (e) => {
      const sid = (e as CustomEvent<{ sessionId: string }>).detail?.sessionId;
      if (!host || host.hidden) return;
      if (sid === focusId) void drawSolves();
      void drawSessionList();
    });
  }
}

async function draw(): Promise<void> {
  if (!host) return;
  host.innerHTML = `
    <div class="grid sessions-grid">
      <section class="card sessions-card" style="--i:0">
        <div class="card-head">
          <span class="badge-ico tint-indigo">${icon('stack', 16)}</span><h3>Sessions</h3>
          <button type="button" class="btn btn-ghost btn-sm" data-action="import">Import</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="export">Export</button>
          <button type="button" class="btn btn-sm" data-action="new">${icon('plus', 16)}New</button>
        </div>
        <div data-role="session-list"><div class="skeleton"></div></div>
      </section>
      <section class="card session-solves-card" style="--i:1" data-role="solves"></section>
    </div>`;
  await Promise.all([drawSessionList(), drawSolves()]);
}

function row(sum: SessionSummary, archived = false): string {
  const { session: s, count, last } = sum;
  const ao12 = statAt(last.map((x) => effective(x, prefs().precision)), 12);
  const isCurrent = s.id === currentSession().id;
  const isFocus = s.id === focusId;
  return `
    <li class="pick-row session-row ${isFocus ? 'is-focus' : ''}" ${archived ? '' : 'data-sort'} data-id="${esc(s.id)}">
      ${archived ? '' : `<button type="button" class="pick-handle" data-handle aria-label="Drag to reorder ${esc(s.name)}">${icon('grip', 18)}</button>`}
      <button type="button" class="session-main" data-action="focus" data-id="${esc(s.id)}" aria-pressed="${isFocus}">
        <span class="session-ico">${eventIcon(s.event, 18)}</span>
        <span class="pick-text">
          <strong>${esc(s.name)}${isCurrent ? ' <span class="chip is-current">in use</span>' : ''}</strong>
          <small class="num">${esc(eventDef(s.event).short)} · ${count} solve${count === 1 ? '' : 's'}${count >= 12 ? ` · ao12 ${ao12 === DNF ? 'DNF' : fmtStat(ao12, s.event)}` : ''}</small>
        </span>
      </button>
      <span class="row-actions">
        ${archived ? '' : `<button type="button" class="btn btn-ghost btn-sm btn-icon kbd-only" data-move="-1" aria-label="Move up">${icon('left', 16).replace('<svg', '<svg style="transform:rotate(90deg)"')}</button>
        <button type="button" class="btn btn-ghost btn-sm btn-icon kbd-only" data-move="1" aria-label="Move down">${icon('right', 16).replace('<svg', '<svg style="transform:rotate(90deg)"')}</button>`}
        ${isCurrent || archived ? '' : `<button type="button" class="btn btn-sm" data-action="use" data-id="${esc(s.id)}">Use</button>`}
        <button type="button" class="btn btn-ghost btn-sm btn-icon" data-action="menu" data-id="${esc(s.id)}" aria-label="More for ${esc(s.name)}" title="Rename, archive, merge, delete">${icon('edit', 16)}</button>
      </span>
    </li>`;
}

async function drawSessionList(): Promise<void> {
  const target = host?.querySelector<HTMLElement>('[data-role="session-list"]');
  if (!target) return;
  const token = ++renderToken;
  const live = await sessionSummaries();
  const archived = orderedSessions(true).filter((s) => s.archived);
  if (token !== renderToken || !target.isConnected) return;
  target.innerHTML = `
    <ul class="pick-list" data-role="sortable">${live.map((x) => row(x)).join('')}</ul>
    ${archived.length ? `
      <details class="archived">
        <summary class="micro-label">Archived · ${archived.length}</summary>
        <ul class="pick-list">${archived.map((s) => row({ session: s, count: 0, last: [] }, true)).join('')}</ul>
      </details>` : ''}
    <p class="pick-hint">${icon('grip', 14)} Drag to reorder. The order is used by the session picker.</p>`;
  const list = target.querySelector<HTMLElement>('[data-role="sortable"]')!;
  sortable(list, () => {
    const ids = [...list.querySelectorAll<HTMLElement>('[data-sort]')].map((li) => li.dataset.id!);
    void reorderSessions(ids);
  });
}

async function drawSolves(): Promise<void> {
  const card = host?.querySelector<HTMLElement>('[data-role="solves"]');
  const s = sessionById(focusId);
  if (!card || !s) return;
  const solves = await loadSolves(s.id);
  if (!card.isConnected) return;
  const p = prefs();
  const sum = summarize(solves, { dnfInMean: p.dnfInMean, precision: p.precision });
  const values = solves.map((x) => effective(x, p.precision));
  const head = card.querySelector('.card-head');
  const headHtml = `
    <div class="card-head">
      <span class="badge-ico tint-blue">${eventIcon(s.event, 16)}</span>
      <h3>${esc(s.name)} <small class="text-dim">${esc(eventDef(s.event).name)}</small></h3>
      ${solves.length ? `<button type="button" class="btn btn-sm ${selecting ? 'btn-primary' : ''}" data-action="select">${selecting ? 'Done' : 'Select'}</button>` : ''}
    </div>
    <div class="session-stats">
      ${[['solves', String(sum.count)], ['best', fmtStat(sum.best, s.event)], ['ao5', fmtStat(statAt(values, 5), s.event)],
        ['ao12', fmtStat(statAt(values, 12), s.event)], ['ao100', fmtStat(statAt(values, 100), s.event)],
        ['mean', fmtStat(sum.mean, s.event)], ['σ', fmtStat(sum.sd, s.event)], ['DNF', sum.count ? `${Math.round((sum.dnfs / sum.count) * 100)}%` : '–']]
        .map(([l, v]) => `<div><small ${l === 'σ' ? 'style="text-transform:none" title="Standard deviation"' : ''}>${l}</small><span class="num">${v}</span></div>`).join('')}
    </div>
    ${selecting ? `
    <div class="bulk-bar">
      <span class="num">${selected.size} selected</span>
      <button type="button" class="btn btn-ghost btn-sm" data-action="select-all">${selected.size === solves.length ? 'Select none' : 'Select all'}</button>
      <span class="grow"></span>
      <select name="bulk-move" aria-label="Move selected to" ${selected.size ? '' : 'disabled'}>
        <option value="">Move to…</option>
        ${orderedSessions().filter((x) => x.id !== s.id).map((x) => `<option value="${esc(x.id)}">${esc(sessionLabel(x))}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-danger btn-sm" data-action="bulk-delete" ${selected.size ? '' : 'disabled'}>Delete</button>
    </div>` : ''}`;
  if (!head) {
    card.innerHTML = `${headHtml}<div class="solve-list" data-role="list"></div>`;
  } else {
    // Keep the list node (and its scroll position); swap only the header part.
    card.querySelectorAll(':scope > :not([data-role="list"])').forEach((n) => n.remove());
    card.insertAdjacentHTML('afterbegin', headHtml);
  }
  const listEl = card.querySelector<HTMLElement>('[data-role="list"]')!;
  const data = listData(solves, s.id);
  if (selecting) data.selected = selected;
  renderSolveList(listEl, data, (id) => {
    if (selecting) {
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      void drawSolves();
      return;
    }
    const i = solves.findIndex((x) => x.id === id);
    openSolveModal(id, i + 1);
  });
}

async function bulkMove(target: string): Promise<void> {
  const ids = [...selected];
  const from = focusId;
  const moved = await moveSolves(ids, target);
  selected.clear();
  toast(`Moved ${moved.length} solve${moved.length === 1 ? '' : 's'} to ${sessionLabel(sessionById(target)!)}.`, {
    action: { label: 'Undo', run: () => { void moveSolves(moved, from); } },
  });
  void drawSolves();
}

async function act(action: string, target: HTMLElement): Promise<void> {
  const id = target.dataset.id ?? '';
  switch (action) {
    case 'new': newSessionDialog(); break;
    case 'import': void openImport(); break;
    case 'export': openExport(); break;
    case 'focus': go('sessions', { focus: id }); break;
    case 'use':
      await setCurrentSession(id);
      toast(`Now timing into ${sessionLabel(sessionById(id)!)}.`, { kind: 'good' });
      break;
    case 'menu': sessionMenu(sessionById(id)!); break;
    case 'select':
      selecting = !selecting;
      selected.clear();
      void drawSolves();
      break;
    case 'select-all': {
      const all = await loadSolves(focusId);
      if (selected.size === all.length) selected.clear();
      else all.forEach((x) => selected.add(x.id));
      void drawSolves();
      break;
    }
    case 'bulk-delete': {
      const ids = [...selected];
      selected.clear();
      deleteWithUndo(ids);
      break;
    }
    default: break;
  }
}

/** Rename · archive / unarchive · merge into… · delete, in one small sheet. */
function sessionMenu(s: Session): void {
  const others = orderedSessions().filter((x) => x.id !== s.id);
  const sameEvent = others.filter((x) => x.event === s.event);
  const { root, close } = openModal({
    title: s.name,
    cancelLabel: '',
    confirmLabel: 'Save',
    bodyHtml: `
      <label><span>Name</span><input name="name" maxlength="60" value="${esc(s.name)}" autocomplete="off"></label>
      <label style="margin-top:12px"><span>Event</span><select name="event">
        ${EVENTS.map((e) => `<option value="${e.id}" ${e.id === s.event ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
      </select></label>
      <div class="field-row" style="margin-top:12px">
        <label><span>Goal</span><select name="goalStat">
          ${[['', 'None'], ['single', 'Single'], ['ao5', 'ao5'], ['ao12', 'ao12'], ['ao100', 'ao100']].map(([v, l]) => `<option value="${v}" ${(s.goalStat ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select></label>
        <label><span>Under (seconds)</span><input name="goalTime" inputmode="decimal" placeholder="15.00" value="${s.goalMs ? esc(formatSingle(s.goalMs)) : ''}" autocomplete="off"></label>
      </div>
      ${s.goalReachedAt ? `<small class="text-good">Reached ${esc(new Date(s.goalReachedAt).toLocaleDateString())}.</small>` : ''}
      <div class="error-block" data-role="goal-err" hidden style="margin-top:8px"></div>
      <div class="menu-actions">
        <button type="button" class="btn btn-sm" data-m="archive">${icon('archive', 16)}${s.archived ? 'Unarchive' : 'Archive'}</button>
        ${others.length ? `<button type="button" class="btn btn-sm" data-m="merge">${icon('merge', 16)}Merge into…</button>` : ''}
        ${orderedSessions(true).length > 1 ? `<button type="button" class="btn btn-danger btn-sm" data-m="delete">${icon('trash', 16)}Delete</button>` : ''}
      </div>
      <div class="merge-pick" hidden>
        <label><span>Move every solve of "${esc(s.name)}" into</span><select name="into">
          ${(sameEvent.length ? sameEvent : others).map((x) => `<option value="${esc(x.id)}">${esc(sessionLabel(x))}</option>`).join('')}
          ${sameEvent.length && others.length > sameEvent.length ? `<optgroup label="Other events">${others.filter((x) => x.event !== s.event).map((x) => `<option value="${esc(x.id)}">${esc(sessionLabel(x))}</option>`).join('')}</optgroup>` : ''}
        </select></label>
        <button type="button" class="btn btn-primary btn-sm" data-m="merge-go" style="margin-top:10px">Merge</button>
      </div>`,
    onConfirm: async (m) => {
      const name = m.querySelector<HTMLInputElement>('[name="name"]')!.value.trim();
      const event = m.querySelector<HTMLSelectElement>('[name="event"]')!.value;
      const goalStat = m.querySelector<HTMLSelectElement>('[name="goalStat"]')!.value as Session['goalStat'] | '';
      const goalRaw = m.querySelector<HTMLInputElement>('[name="goalTime"]')!.value.trim();
      const patch: Partial<Session> = {};
      if (name && name !== s.name) patch.name = name;
      if (event !== s.event) patch.event = event;
      if (goalStat) {
        const parsed = parseTypedTime(goalRaw.includes('.') || goalRaw.includes(':') ? goalRaw : goalRaw ? `${goalRaw}.00` : '');
        if (!parsed || parsed.penalty) {
          const err = m.querySelector<HTMLElement>('[data-role="goal-err"]')!;
          err.hidden = false;
          err.textContent = 'Enter the goal time, e.g. 15 or 14.50.';
          return false;
        }
        if (goalStat !== s.goalStat || parsed.timeMs !== s.goalMs) {
          patch.goalStat = goalStat;
          patch.goalMs = parsed.timeMs;
          patch.goalReachedAt = undefined;
        }
      } else if (s.goalStat) {
        patch.goalStat = undefined;
        patch.goalMs = undefined;
        patch.goalReachedAt = undefined;
      }
      if (Object.keys(patch).length) await updateSession(s.id, patch);
    },
  });
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]');
    if (!b) return;
    const m = b.dataset.m;
    if (m === 'archive') {
      close();
      const archived = !s.archived;
      void updateSession(s.id, { archived }).then(() => toast(archived ? `Archived "${s.name}".` : `"${s.name}" is back.`, {
        action: { label: 'Undo', run: () => { void updateSession(s.id, { archived: !archived }); } },
      }));
    } else if (m === 'merge') {
      root.querySelector<HTMLElement>('.merge-pick')!.hidden = false;
    } else if (m === 'merge-go') {
      const into = root.querySelector<HTMLSelectElement>('[name="into"]')!.value;
      close();
      void mergeSessions(s.id, into).then((res) => {
        if (!res) return;
        if (focusId === s.id) go('sessions', { focus: into });
        toast(`Merged ${res.moved.length} solve${res.moved.length === 1 ? '' : 's'} into ${sessionLabel(sessionById(into)!)}.`, {
          action: { label: 'Undo', run: () => { void unmerge(res); } },
        });
      });
    } else if (m === 'delete') {
      close();
      void confirmDelete(s);
    }
  });
}

async function confirmDelete(s: Session): Promise<void> {
  const count = (await loadSolves(s.id)).length;
  openModal({
    title: 'Delete session?',
    danger: true,
    confirmLabel: 'Delete',
    bodyHtml: `<p>"${esc(s.name)}" (${esc(eventDef(s.event).short)}) and its <strong class="num">${count}</strong> solve${count === 1 ? '' : 's'} will be deleted.</p>
      <p class="text-dim">You can undo this for a few seconds afterwards.</p>`,
    onConfirm: async () => {
      const gone = await deleteSession(s.id);
      if (!gone) return;
      if (focusId === s.id) go('sessions');
      toast(`Deleted "${s.name}" (${count} solves).`, {
        action: { label: 'Undo', run: () => { void restoreSession(gone).then(() => toast('Session restored.', { kind: 'good' })); } },
      });
    },
  });
}
