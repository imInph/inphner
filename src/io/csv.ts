/**
 * inphner: CSV import/export. Pure, unit-tested.
 *
 * Import is forgiving: the delimiter is detected (; , or tab), a header row is
 * recognised by its column names (time/result, scramble, date, comment,
 * penalty), and headerless files are read as "time[, scramble[, date]]".
 * csTimer's own CSV ("No.;Time;Comment;Scramble;Date;P.1") works as is.
 *
 * In a CSV a "+" time is a DISPLAYED result, penalty already applied
 * ("14.34+" = raw 12.34 + 2), unlike typing mode where "12.34+" means raw
 * 12.34 with +2. An exact `time_ms` column (our own export) wins over both.
 */
import { parseTypedTime, formatResult, type Penalty } from '../timer/format.ts';
import type { ImportedSolve } from './cstimer.ts';

/** Split CSV text into rows, honouring double quotes. */
export function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const counts = [';', '\t', ','].map((d) => [d, first.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : ',';
}

function parseDate(v: string): number {
  const s = v.trim();
  if (!s) return 0;
  if (/^\d{9,13}$/.test(s)) return Number(s) < 1e11 ? Number(s) * 1000 : Number(s);
  // "2026-09-19 14:03:22" → local time (not UTC, unlike Date.parse of a bare ISO date).
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime();
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

export interface CsvImport { solves: ImportedSolve[]; skipped: number }

export function parseCsv(text: string): CsvImport {
  const delimiter = detectDelimiter(text);
  const rows = csvRows(text, delimiter);
  if (!rows.length) throw new Error('The file is empty.');
  const head = rows[0]!.map((h) => h.trim().toLowerCase());
  const find = (...names: RegExp[]) => head.findIndex((h) => names.some((n) => n.test(h)));
  let col = {
    time: find(/^time$/, /^result$/, /^time\s*\(/, /^single$/),
    scramble: find(/scramble/),
    date: find(/^date/, /timestamp/, /^when$/),
    comment: find(/comment/, /^note/),
    penalty: find(/^penalty$/, /^p$/),
    ms: find(/^time_ms$/),
  };
  let body = rows.slice(1);
  if (col.time < 0) {
    // No recognisable header: time, scramble, date.
    col = { time: 0, scramble: 1, date: 2, comment: -1, penalty: -1, ms: -1 };
    body = rows;
  }
  const solves: ImportedSolve[] = [];
  let skipped = 0;
  for (const r of body) {
    const raw = (r[col.time] ?? '').trim();
    const parsed = parseTypedTime(raw);
    if (!parsed) { skipped++; continue; }
    let timeMs = parsed.timeMs;
    let penalty: Penalty = parsed.penalty;
    const exact = col.ms >= 0 ? Number((r[col.ms] ?? '').trim()) : NaN;
    if (Number.isFinite(exact) && exact >= 0 && (r[col.ms] ?? '').trim() !== '') timeMs = Math.round(exact);
    else if (penalty === 2000) timeMs = Math.max(0, timeMs - 2000); // displayed total → raw
    const penRaw = col.penalty >= 0 ? (r[col.penalty] ?? '').trim().toUpperCase() : '';
    if (penRaw === 'DNF' || penRaw === '-1') penalty = 'DNF';
    else if (penRaw === '+2' || penRaw === '2000' || penRaw === '2') penalty = 2000;
    solves.push({
      timeMs,
      penalty,
      scramble: col.scramble >= 0 ? (r[col.scramble] ?? '').trim() : '',
      comment: col.comment >= 0 ? (r[col.comment] ?? '').trim() : '',
      createdAt: col.date >= 0 ? parseDate(r[col.date] ?? '') : 0,
    });
  }
  return { solves, skipped };
}

function cell(v: string): string {
  return /[",;\n\r\t]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function localStamp(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export interface CsvRow { session: string; event: string; timeMs: number; penalty: Penalty; scramble: string; comment?: string; createdAt: number }

export function buildCsv(rows: CsvRow[]): string {
  const head = ['session', 'event', 'no', 'result', 'time_ms', 'penalty', 'scramble', 'comment', 'date'];
  const counters = new Map<string, number>();
  const lines = rows.map((r) => {
    const no = (counters.get(r.session) ?? 0) + 1;
    counters.set(r.session, no);
    return [r.session, r.event, String(no), formatResult(r.timeMs, r.penalty), String(r.timeMs),
      r.penalty === 'DNF' ? 'DNF' : r.penalty ? '+2' : '', r.scramble, r.comment ?? '', localStamp(r.createdAt)].map(cell).join(',');
  });
  return [head.join(','), ...lines].join('\n') + '\n';
}
