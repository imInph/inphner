/**
 * inphner: the virtualised solve list (newest first). Only the rows in view
 * (plus a small overscan) exist in the DOM, so 50 000 solves scroll smoothly.
 * Columns: # · time · ao5 · ao12 · comment · PB.
 *
 * ao5/ao12 and PB badges come from the session's incremental stats (stats/live.ts).
 */
import { DNF } from '../stats/core.ts';
import { syncStats } from '../stats/live.ts';
import { formatAverage, formatResult } from '../timer/format.ts';
import { prefs } from '../prefs.ts';
import { eventDef } from '../events.ts';
import type { Solve } from '../types.ts';
import { esc } from '../ui/dom.ts';

const ROW_H = 38;
const OVERSCAN = 8;

export interface ListData {
  solves: readonly Solve[];
  ao5: number[];
  ao12: number[];
  /** Solve ids to mark with a PB badge. */
  pbs?: Set<string>;
  /** Selection mode (Sessions view bulk edit): clicking a row toggles it. */
  selected?: Set<string>;
}

/** Rows + ao5/ao12 columns + PB badges, from the session's incremental stats. */
export function listData(solves: readonly Solve[], sessionId: string): ListData {
  if (solves[0]?.event === '333mbf') {
    // Multi-BLD has no averages.
    const none = new Array<number>(solves.length).fill(NaN);
    return { solves, ao5: none, ao12: none };
  }
  const { stats } = syncStats(sessionId, solves);
  const pbs = new Set<string>();
  for (const i of stats.pbIndices) if (solves[i]) pbs.add(solves[i]!.id);
  return { solves, ao5: stats.rolling(5), ao12: stats.rolling(12), pbs };
}

/** A time or average for a table cell. */
export function fmtStat(v: number, event: string): string {
  if (Number.isNaN(v)) return '–';
  if (v === DNF) return 'DNF';
  if (eventDef(event).moves) return (v / 1000).toFixed(2).replace(/\.00$/, '');
  return formatAverage(v, prefs().precision);
}

export function fmtSingle(s: Solve): string {
  if (eventDef(s.event).moves) return s.penalty === 'DNF' ? 'DNF' : String(Math.round(s.timeMs / 1000));
  if (s.multi) {
    // WCA writes Multi-BLD times as whole seconds, m:ss.
    const sec = Math.floor(s.timeMs / 1000);
    const txt = `${s.multi.solved}/${s.multi.attempted} ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    return s.penalty === 'DNF' ? `DNF (${txt})` : txt;
  }
  return formatResult(s.timeMs, s.penalty, prefs().precision);
}

interface Mounted {
  el: HTMLElement;
  scroller: HTMLElement;
  inner: HTMLElement;
  data: ListData;
  frame: number;
  onOpen: (id: string) => void;
  highlight: string | null;
}

const mounted = new WeakMap<HTMLElement, Mounted>();

/** Mount (or update) a list in `el`. Idempotent; call again with new data. */
export function renderSolveList(el: HTMLElement, data: ListData, onOpen: (id: string) => void): void {
  let m = mounted.get(el);
  if (!m) {
    el.innerHTML = `
      <div class="solve-table-head" aria-hidden="true"><span>#</span><span>time</span><span>ao5</span><span>ao12</span><span></span></div>
      <div class="solve-scroll" role="list" tabindex="0" aria-label="Solves, newest first"><div class="solve-inner"></div></div>
      <div class="empty solve-empty" hidden>No solves in this session yet.</div>`;
    const scroller = el.querySelector<HTMLElement>('.solve-scroll')!;
    const inner = el.querySelector<HTMLElement>('.solve-inner')!;
    m = { el, scroller, inner, data, frame: 0, onOpen, highlight: null };
    mounted.set(el, m);
    const mm = m;
    scroller.addEventListener('scroll', () => {
      if (mm.frame) return;
      mm.frame = requestAnimationFrame(() => {
        mm.frame = 0;
        paintRows(mm);
      });
    }, { passive: true });
    scroller.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-solve]');
      if (row) mm.onOpen(row.dataset.solve!);
    });
    scroller.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const row = (e.target as HTMLElement).closest<HTMLElement>('[data-solve]');
        if (row) mm.onOpen(row.dataset.solve!);
      }
    });
  }
  m.data = data;
  m.onOpen = onOpen;
  m.inner.style.height = `${data.solves.length * ROW_H}px`;
  el.querySelector<HTMLElement>('.solve-empty')!.hidden = data.solves.length > 0;
  paintRows(m);
}

/** Briefly highlight a solve's row (after landing / jumping to it). */
export function flashSolve(el: HTMLElement, id: string): void {
  const m = mounted.get(el);
  if (!m) return;
  m.highlight = id;
  paintRows(m);
  window.setTimeout(() => {
    if (m.highlight === id) {
      m.highlight = null;
      paintRows(m);
    }
  }, 1600);
}

function paintRows(m: Mounted): void {
  const { solves, ao5, ao12, pbs } = m.data;
  const n = solves.length;
  const top = m.scroller.scrollTop;
  const height = m.scroller.clientHeight || 300;
  const first = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
  const last = Math.min(n, Math.ceil((top + height) / ROW_H) + OVERSCAN);
  let html = '';
  for (let pos = first; pos < last; pos++) {
    const i = n - 1 - pos; // newest first
    const s = solves[i]!;
    const sel = m.data.selected;
    const cls = (s.penalty === 'DNF' ? 'is-dnf' : s.penalty ? 'is-plus2' : '') + (sel ? ' is-selectable' : '') + (sel?.has(s.id) ? ' is-selected' : '');
    html += `<div class="solve-row ${cls} ${m.highlight === s.id ? 'is-new' : ''}" role="listitem" ${sel ? `aria-selected="${sel.has(s.id)}"` : ''} data-solve="${esc(s.id)}" tabindex="-1" style="transform:translateY(${pos * ROW_H}px)">
      <span class="c-idx">${sel ? `<span class="check ${sel.has(s.id) ? 'done' : ''}" aria-hidden="true"></span>` : ''}${i + 1}</span>
      <span class="c-time">${esc(fmtSingle(s))}</span>
      <span class="c-avg">${fmtStat(ao5[i]!, s.event)}</span>
      <span class="c-avg">${fmtStat(ao12[i]!, s.event)}</span>
      <span class="c-flags">${pbs?.has(s.id) ? '<span class="badge badge-pb">PB</span>' : ''}${s.comment ? '<span class="dot accent" title="Has a comment"></span>' : ''}</span>
    </div>`;
  }
  m.inner.innerHTML = html;
}
