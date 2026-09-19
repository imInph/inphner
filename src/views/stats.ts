/**
 * inphner: the Stats view (inphner-prompt.md §A7). For the current session:
 *   1. time trend: every solve as a faint dot + ao5 / ao12 / ao100 lines;
 *      drag across it to zoom, scroll to pan, double-click to reset; range
 *      selector (last 100 / 1000 / all / dates)
 *   2. distribution histogram with the mean and ±σ marked
 *   3. PB progression (best single / ao5 / ao12 as steps)
 *   4. practice heatmap: solves per day over the last 12 months (all sessions)
 *   5. split breakdown (when splits exist)
 *   6. average by hour of day and by weekday
 * Charts read their colours from the CSS tokens at draw time and redraw on a
 * theme change; each chart is destroyed before it's drawn again.
 */
import type { Chart as ChartType, Plugin } from 'chart.js';
import { eventDef } from '../events.ts';
import { DNF, effective, summarize } from '../stats/core.ts';
import { byHourAndWeekday, bucketWidth, downsample, heatmap, histogram, pbSteps, phaseAverages, phaseDurations } from '../stats/chart-data.ts';
import { syncStats } from '../stats/live.ts';
import { currentSession, currentSolves, loadSolves, orderedSessions } from '../store.ts';
import { prefs } from '../prefs.ts';
import type { Solve } from '../types.ts';
import { esc, onAction } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { alpha, baseOptions, destroyWithin, draw, palette } from './charts.ts';
import { fmtStat } from './solve-list.ts';

type Range = 'last100' | 'last1000' | 'all' | 'dates';
const RANGE_KEY = 'inphner.statsRange';

let host: HTMLElement | null = null;
let range: Range = readRange();
let fromDay = '';
let toDay = '';
let drawToken = 0;
const wired = new WeakSet<HTMLElement>();

function readRange(): Range {
  try {
    const r = localStorage.getItem(RANGE_KEY);
    if (r === 'last100' || r === 'last1000' || r === 'all' || r === 'dates') return r;
  } catch { /* storage blocked */ }
  return 'last1000';
}

const sec = (ms: number) => ms / 1000;

export function renderStats(el: HTMLElement): void {
  host = el;
  destroyWithin(el);
  const session = currentSession();
  const def = eventDef(session.event);
  const solves = currentSolves();
  const today = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (!toDay) toDay = iso(today);
  if (!fromDay) { const f = new Date(today); f.setDate(f.getDate() - 30); fromDay = iso(f); }

  const card = (key: string, title: string, tint: string, ico: Parameters<typeof icon>[0], body: string, extra = '', head = '') => `
    <section class="card ${extra}" data-card="${key}">
      <div class="card-head"><span class="badge-ico tint-${tint}">${icon(ico, 16)}</span><h3>${title}</h3>${head}</div>
      ${body}
    </section>`;
  const seg = (v: Range, l: string) => `<button type="button" data-action="range" data-value="${v}" class="${range === v ? 'on' : ''}" aria-pressed="${range === v}">${l}</button>`;

  if (!solves.length) {
    el.innerHTML = `<div class="grid grid-2"><section class="card placeholder">
      <div class="card-head"><span class="badge-ico tint-teal">${icon('chart', 16)}</span><h3>No solves yet</h3></div>
      <p>Charts appear once ${esc(session.name)} (${esc(def.short)}) has a few solves.</p></section></div>`;
    return;
  }

  const timeCharts = session.event !== '333mbf';
  el.innerHTML = `
    <div class="stats-toolbar">
      <div class="segmented" role="group" aria-label="Range">${seg('last100', 'Last 100')}${seg('last1000', 'Last 1000')}${seg('all', 'All')}${seg('dates', 'Dates')}</div>
      <span class="date-range" ${range === 'dates' ? '' : 'hidden'}>
        <input type="date" name="from" value="${fromDay}" aria-label="From"><span class="text-dim">–</span><input type="date" name="to" value="${toDay}" aria-label="To">
      </span>
      <span class="grow"></span>
      <small class="text-dim">${esc(def.short)} · ${esc(session.name)}</small>
    </div>
    <div class="grid stats-grid">
      ${card('summary', 'Summary', 'teal', 'chart', '<div class="summary-grid" data-role="summary"></div>', 'span-all')}
      ${timeCharts ? `
      ${card('trend', 'Time trend', 'blue', 'chart', `<div class="chart-box tall"><canvas data-chart="trend" aria-label="Time trend"></canvas><div class="zoom-sel" hidden></div></div>`, 'span-all',
        `<span class="legend"><i style="--c:var(--text-faint)"></i>single <i style="--c:var(--accent)"></i>ao5 <i style="--c:var(--purple)"></i>ao12 <i style="--c:var(--good)"></i>ao100</span>
         <button type="button" class="btn btn-ghost btn-sm" data-action="reset-zoom" hidden>Reset zoom</button>`)}
      ${card('dist', 'Distribution', 'indigo', 'chart', '<div class="chart-box"><canvas data-chart="dist" aria-label="Distribution"></canvas></div><p class="chart-note" data-role="dist-note"></p>')}
      ${card('pb', 'PB progression', 'orange', 'target', '<div class="chart-box"><canvas data-chart="pb" aria-label="PB progression"></canvas></div>', '',
        `<span class="legend"><i style="--c:var(--text-dim)"></i>single <i style="--c:var(--accent)"></i>ao5 <i style="--c:var(--purple)"></i>ao12</span>`)}` : ''}
      ${card('heat', 'Practice', 'green', 'clock', '<div class="heat-wrap" data-role="heat"></div>', 'span-all', '<small class="text-dim">All sessions · last 12 months</small>')}
      ${timeCharts ? `
      ${card('hour', 'By time of day', 'purple', 'clock', '<div class="chart-box short"><canvas data-chart="hour" aria-label="Average by hour"></canvas></div>')}
      ${card('weekday', 'By weekday', 'graphite', 'chart', '<div class="chart-box short"><canvas data-chart="weekday" aria-label="Average by weekday"></canvas></div>')}
      <div data-role="splits" class="span-all" hidden></div>` : ''}
    </div>`;

  onAction(el, (action, target) => {
    if (action === 'range') {
      range = target.dataset.value as Range;
      try { localStorage.setItem(RANGE_KEY, range); } catch { /* blocked */ }
      renderStats(el);
    } else if (action === 'reset-zoom') {
      resetZoom();
    }
  });
  if (!wired.has(el)) {
    wired.add(el);
    el.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === 'from' || t.name === 'to') {
        if (t.name === 'from') fromDay = t.value;
        else toDay = t.value;
        renderStats(el);
      }
    });
    const again = () => { if (host && !host.hidden) renderStats(host); };
    window.addEventListener('inphner:theme', again);
    window.addEventListener('inphner:sessions', again);
    window.addEventListener('inphner:solves', (e) => {
      if ((e as CustomEvent<{ sessionId: string }>).detail?.sessionId === currentSession().id) again();
    });
  }
  void fill(el);
}

/** [start, end) of the solves in range. */
function rangeBounds(solves: readonly Solve[]): [number, number] {
  const n = solves.length;
  if (range === 'last100') return [Math.max(0, n - 100), n];
  if (range === 'last1000') return [Math.max(0, n - 1000), n];
  if (range === 'all') return [0, n];
  const from = new Date(`${fromDay}T00:00:00`).getTime();
  const to = new Date(`${toDay}T23:59:59.999`).getTime();
  const lo = solves.findIndex((s) => s.createdAt >= from);
  if (lo < 0) return [n, n];
  let hi = lo;
  while (hi < n && solves[hi]!.createdAt <= to) hi++;
  return [lo, hi];
}

async function fill(el: HTMLElement): Promise<void> {
  const token = ++drawToken;
  const session = currentSession();
  const solves = currentSolves();
  const p = prefs();
  const event = session.event;
  const [start, end] = rangeBounds(solves);
  const inRange = solves.slice(start, end);
  const values = inRange.map((s) => effective(s, p.precision));
  const fmt = (ms: number) => fmtStat(ms, event);
  const moves = !!eventDef(event).moves;
  const unit = moves ? '' : ' s';

  /* Summary */
  const sum = summarize(inRange, { dnfInMean: p.dnfInMean, precision: p.precision });
  const multi = event === '333mbf';
  const { stats } = multi ? { stats: null } : syncStats(session.id, solves);
  const total = sum.totalMs;
  const hours = Math.floor(total / 3600000);
  const mins = Math.round((total % 3600000) / 60000);
  const items: [string, string][] = [
    ['solves', String(sum.count)],
    ...(multi ? [] : [
      ['mean', fmt(sum.mean)], ['σ', fmt(sum.sd)], ['best', fmt(sum.best)], ['worst', fmt(sum.worst)],
      ['best ao5', fmt(stats!.best(5)?.value ?? NaN)], ['best ao12', fmt(stats!.best(12)?.value ?? NaN)],
      ['best ao100', fmt(stats!.best(100)?.value ?? NaN)],
    ] as [string, string][]),
    ['DNF rate', sum.count ? `${((sum.dnfs / sum.count) * 100).toFixed(1)}%` : '–'],
    ['time cubing', moves ? '–' : hours ? `${hours} h ${mins} min` : `${mins} min`],
  ];
  const summary = el.querySelector<HTMLElement>('[data-role="summary"]');
  if (summary) {
    summary.innerHTML = items.map(([l, v]) => `<div><small ${l === 'σ' ? 'style="text-transform:none"' : ''}>${esc(l)}</small><span class="num">${esc(v)}</span></div>`).join('');
  }

  /* Heatmap (all sessions) */
  const all: number[] = [];
  for (const s of orderedSessions(true)) (await loadSolves(s.id)).forEach((x) => all.push(x.createdAt));
  if (token !== drawToken) return;
  renderHeatmap(el.querySelector<HTMLElement>('[data-role="heat"]'), heatmap(all));

  if (multi) return;
  const pal = palette();
  const base = baseOptions(pal);
  const yTick = { callback: (v: string | number) => (moves ? String(v) : fmt(Number(v) * 1000)) };

  /* 1. Trend */
  const trendCanvas = el.querySelector<HTMLCanvasElement>('[data-chart="trend"]');
  if (trendCanvas) {
    const pts = (arr: number[]) => downsample(arr.slice(start, end).map((v, i) => ({ x: start + i + 1, y: v })).filter((q) => !Number.isNaN(q.y) && q.y !== DNF).map((q) => ({ x: q.x, y: sec(q.y) })), 2400);
    const singles = downsample(values.map((v, i) => ({ x: start + i + 1, y: v })).filter((q) => q.y !== DNF).map((q) => ({ x: q.x, y: sec(q.y) })), 4000);
    const line = (data: { x: number; y: number }[], color: string, label: string) => ({
      type: 'line' as const, label, data, borderColor: color, backgroundColor: color, borderWidth: 1.8, pointRadius: 0, tension: 0.25, spanGaps: true,
    });
    const chart = await draw(trendCanvas, {
      type: 'scatter',
      data: {
        datasets: [
          { type: 'scatter', label: 'single', data: singles, backgroundColor: alpha(pal.faint, 0.55), pointRadius: singles.length > 1500 ? 1.2 : 2, pointHoverRadius: 4 },
          line(pts(stats!.rolling(5)), pal.accent, 'ao5'),
          line(pts(stats!.rolling(12)), pal.purple, 'ao12'),
          line(pts(stats!.rolling(100)), pal.good, 'ao100'),
        ],
      },
      options: {
        ...base,
        scales: {
          x: { ...base.scales.x, type: 'linear', min: start + 1, max: Math.max(start + 2, end), ticks: { ...base.scales.x.ticks, precision: 0 } },
          y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, ...yTick } },
        },
        plugins: {
          ...base.plugins,
          tooltip: { ...base.plugins.tooltip, callbacks: { title: (items) => `#${items[0]?.parsed.x}`, label: (c) => `${c.dataset.label} ${moves ? c.parsed.y : fmt((c.parsed.y ?? 0) * 1000)}` } },
        },
      },
    });
    if (token !== drawToken) return;
    wireZoom(trendCanvas, chart, start + 1, Math.max(start + 2, end));
  }

  /* 2. Distribution */
  const distCanvas = el.querySelector<HTMLCanvasElement>('[data-chart="dist"]');
  if (distCanvas) {
    const width = moves ? 1000 : bucketWidth(values);
    const h = histogram(values, width);
    const labels = h.counts.map((_, i) => (moves ? String((h.start + i * width) / 1000) : fmt(h.start + i * width)));
    const mean = sum.mean;
    const sd = sum.sd;
    const markers: Plugin = {
      id: 'meanSd',
      afterDatasetsDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const xs = scales.x!;
        const at = (ms: number) => {
          const f = (ms - h.start) / width - 0.5; // category centres sit at +0.5 of a bucket
          const i = Math.floor(f);
          const a = xs.getPixelForValue(Math.max(0, i));
          const b = xs.getPixelForValue(Math.max(0, i + 1));
          return a + (b - a) * (f - i);
        };
        const mark = (ms: number, color: string, dash: number[]) => {
          if (!Number.isFinite(ms)) return;
          const x = at(ms);
          if (x < chartArea.left || x > chartArea.right) return;
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash(dash);
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.stroke();
          ctx.restore();
        };
        mark(mean, pal.accent, []);
        mark(mean - sd, alpha(pal.accent, 0.6), [4, 4]);
        mark(mean + sd, alpha(pal.accent, 0.6), [4, 4]);
      },
    };
    await draw(distCanvas, {
      type: 'bar',
      data: { labels, datasets: [{ data: h.counts, backgroundColor: alpha(pal.accent, 0.35), hoverBackgroundColor: alpha(pal.accent, 0.6), borderRadius: 4, barPercentage: 0.92, categoryPercentage: 1 }] },
      options: {
        ...base,
        scales: { x: { ...base.scales.x, grid: { display: false } }, y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, precision: 0 } } },
        plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { title: (items) => `${items[0]?.label}${unit}+`, label: (c) => `${c.parsed.y} solves` } } },
      },
      plugins: [markers],
    });
    const note = el.querySelector<HTMLElement>('[data-role="dist-note"]');
    if (note) note.innerHTML = `<i class="mk"></i>mean ${esc(fmt(mean))}${unit} · <i class="mk dashed"></i>±σ ${esc(fmt(sd))}${unit} · buckets of ${moves ? '1 move' : `${width / 1000} s`}`;
  }

  /* 3. PB progression */
  const pbCanvas = el.querySelector<HTMLCanvasElement>('[data-chart="pb"]');
  if (pbCanvas) {
    const n = solves.length;
    const allValues = solves.map((s) => effective(s, p.precision));
    const stepsOf = (arr: number[]) => {
      const steps = pbSteps(arr).map((q) => ({ x: q.index + 1, y: sec(q.value) }));
      if (steps.length) steps.push({ x: n, y: steps[steps.length - 1]!.y });
      return steps;
    };
    const stepLine = (data: { x: number; y: number }[], color: string, label: string) => ({
      label, data, borderColor: color, backgroundColor: color, stepped: 'before' as const, borderWidth: 2, pointRadius: 2.5, pointHoverRadius: 5,
    });
    await draw(pbCanvas, {
      type: 'line',
      data: { datasets: [stepLine(stepsOf(allValues), pal.dim, 'single'), stepLine(stepsOf(stats!.rolling(5)), pal.accent, 'ao5'), stepLine(stepsOf(stats!.rolling(12)), pal.purple, 'ao12')] },
      options: {
        ...base,
        scales: {
          x: { ...base.scales.x, type: 'linear', min: 1, max: Math.max(2, n), ticks: { ...base.scales.x.ticks, precision: 0 } },
          y: { ...base.scales.y, ticks: { ...base.scales.y.ticks, ...yTick } },
        },
        plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { title: (items) => `after solve #${items[0]?.parsed.x}`, label: (c) => `${c.dataset.label} ${moves ? c.parsed.y : fmt((c.parsed.y ?? 0) * 1000)}` } } },
      },
    });
  }

  /* 6. Hour / weekday */
  const bw = byHourAndWeekday(inRange.map((s, i) => ({ value: values[i]!, createdAt: s.createdAt })));
  const barChart = async (canvas: HTMLCanvasElement | null, labels: string[], b: { average: number[]; count: number[] }, color: string) => {
    if (!canvas) return;
    await draw(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ data: b.average.map((v) => (Number.isNaN(v) ? null : sec(v))), backgroundColor: alpha(color, 0.4), hoverBackgroundColor: alpha(color, 0.7), borderRadius: 5 }] },
      options: {
        ...base,
        scales: { x: { ...base.scales.x, grid: { display: false } }, y: { ...base.scales.y, beginAtZero: false, ticks: { ...base.scales.y.ticks, ...yTick } } },
        plugins: { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { label: (c) => `average ${moves ? c.parsed.y : fmt((c.parsed.y ?? 0) * 1000)} · ${b.count[c.dataIndex]} solves` } } },
      },
    });
  };
  await barChart(el.querySelector('[data-chart="hour"]'), Array.from({ length: 24 }, (_, i) => String(i)), bw.hour, pal.purple);
  await barChart(el.querySelector('[data-chart="weekday"]'), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], bw.weekday, pal.accent);

  /* 5. Splits */
  const splitsHost = el.querySelector<HTMLElement>('[data-role="splits"]');
  const phases = Math.max(0, ...inRange.map((s) => s.splits?.length ?? 0));
  if (splitsHost && phases > 1) {
    const durations = phaseDurations(inRange.map((s) => s.splits), phases).slice(-60);
    const avgs = phaseAverages(durations);
    const colors = [pal.accent, pal.purple, pal.good, pal.warn, pal.bad, pal.dim];
    splitsHost.hidden = false;
    splitsHost.innerHTML = `<section class="card">
      <div class="card-head"><span class="badge-ico tint-pink">${icon('stack', 16)}</span><h3>Splits</h3>
        <small class="text-dim">${durations.length} solves with ${phases} phases</small></div>
      <div class="split-list">${avgs.map((a, i) => `<span class="chip num" style="--c:${colors[i % colors.length]}"><i class="swatch"></i>phase ${i + 1} · ${esc(fmt(a))}</span>`).join('')}</div>
      <div class="chart-box"><canvas data-chart="splits" aria-label="Split breakdown"></canvas></div></section>`;
    await draw(splitsHost.querySelector('canvas')!, {
      type: 'bar',
      data: {
        labels: durations.map((_, i) => String(i + 1)),
        datasets: Array.from({ length: phases }, (_, k) => ({
          label: `phase ${k + 1}`, data: durations.map((d) => sec(d[k]!)), backgroundColor: alpha(colors[k % colors.length]!, 0.6), borderRadius: 3,
        })),
      },
      options: {
        ...base,
        scales: { x: { ...base.scales.x, stacked: true, grid: { display: false } }, y: { ...base.scales.y, stacked: true, ticks: { ...base.scales.y.ticks, ...yTick } } },
      },
    });
  }
}

function renderHeatmap(el: HTMLElement | null, days: ReturnType<typeof heatmap>): void {
  if (!el) return;
  const total = days.reduce((a, d) => a + d.count, 0);
  const active = days.filter((d) => d.count).length;
  const fmtDay = (k: string) => new Date(`${k}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  // Month labels over the first column of each month.
  const months: string[] = [];
  for (let c = 0; c < Math.ceil(days.length / 7); c++) {
    const d = days[c * 7];
    const first = d && days.slice(c * 7, c * 7 + 7).some((x) => x.day.endsWith('-01'));
    months.push(first || c === 0 ? new Date(`${(days.slice(c * 7, c * 7 + 7).find((x) => x.day.endsWith('-01')) ?? d!).day}T12:00`).toLocaleDateString(undefined, { month: 'short' }) : '');
  }
  el.innerHTML = `
    <div class="heat-months" style="--cols:${months.length}">${months.map((m) => `<span>${esc(m)}</span>`).join('')}</div>
    <div class="heat-body">
      <div class="heat-days"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div>
      <div class="heatmap" role="img" aria-label="${total} solves on ${active} days in the last 12 months">
        ${days.map((d) => `<i class="l${d.level}" title="${esc(fmtDay(d.day))}: ${d.count} solve${d.count === 1 ? '' : 's'}"></i>`).join('')}
      </div>
    </div>
    <p class="chart-note">${total} solves on ${active} days</p>`;
}

/* ------------------------------------------------------------ trend zoom */

let zoomChart: ChartType | null = null;
let zoomFull: [number, number] = [0, 1];

function resetZoom(): void {
  if (!zoomChart) return;
  const x = zoomChart.options.scales!.x!;
  x.min = zoomFull[0];
  x.max = zoomFull[1];
  zoomChart.update('none');
  host?.querySelector<HTMLElement>('[data-action="reset-zoom"]')?.setAttribute('hidden', '');
}

/** Drag across the trend to zoom into that range; scroll / trackpad pans; double-click resets. */
function wireZoom(canvas: HTMLCanvasElement, chart: ChartType, fullMin: number, fullMax: number): void {
  zoomChart = chart;
  zoomFull = [fullMin, fullMax];
  const sel = canvas.parentElement!.querySelector<HTMLElement>('.zoom-sel')!;
  const resetBtn = host?.querySelector<HTMLElement>('[data-action="reset-zoom"]');
  let startX: number | null = null;
  const xOf = (e: PointerEvent) => e.clientX - canvas.getBoundingClientRect().left;
  canvas.onpointerdown = (e) => {
    if (e.button !== 0) return;
    startX = xOf(e);
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (startX === null) return;
    const x = xOf(e);
    sel.hidden = Math.abs(x - startX) < 4;
    sel.style.left = `${Math.min(x, startX)}px`;
    sel.style.width = `${Math.abs(x - startX)}px`;
  };
  canvas.onpointerup = (e) => {
    if (startX === null) return;
    const x = xOf(e);
    const a = Math.min(x, startX);
    const b = Math.max(x, startX);
    startX = null;
    sel.hidden = true;
    if (b - a < 8) return;
    const scale = chart.scales.x!;
    const lo = scale.getValueForPixel(a) ?? fullMin;
    const hi = scale.getValueForPixel(b) ?? fullMax;
    if (hi - lo < 3) return;
    chart.options.scales!.x!.min = Math.max(fullMin, Math.floor(lo));
    chart.options.scales!.x!.max = Math.min(fullMax, Math.ceil(hi));
    chart.update('none');
    resetBtn?.removeAttribute('hidden');
  };
  canvas.ondblclick = () => resetZoom();
  canvas.onwheel = (e) => {
    const x = chart.options.scales!.x!;
    const min = Number(x.min);
    const max = Number(x.max);
    if (min <= fullMin && max >= fullMax) return; // not zoomed: let the page scroll
    e.preventDefault();
    const span = max - min;
    const shift = ((e.deltaX || e.deltaY) / canvas.clientWidth) * span;
    const nMin = Math.max(fullMin, Math.min(fullMax - span, min + shift));
    x.min = nMin;
    x.max = nMin + span;
    chart.update('none');
  };
}
