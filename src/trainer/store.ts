/**
 * inphner: trainer persistence in IndexedDB's `meta` store:
 *   trainer:stats   { [caseKey]: CaseStats }
 *   trainer:algs    { [caseKey]: { alg?, note? } }   the user's own alg + notes
 *   trainer:custom  CustomCase[]
 *   trainer:prefs   { set, selected: { [set]: caseKey[] }, order, mode, recog }
 * Loaded once when the Trainer or Algorithms view opens; saved (debounced) on change.
 */
import { get, write } from '../db/idb.ts';
import { emptyStats, type CaseStats } from './select.ts';
import type { CustomCase, SetId } from './cases.ts';

export interface TrainerPrefs {
  set: SetId;
  selected: Partial<Record<SetId, string[]>>;
  order: 'weighted' | 'deck';
  mode: 'timer' | 'recog';
  recog: 'choice' | 'type';
}

const state = {
  loaded: false,
  stats: {} as Record<string, CaseStats>,
  algs: {} as Record<string, { alg?: string; note?: string }>,
  custom: [] as CustomCase[],
  prefs: { set: 'pll', selected: {}, order: 'weighted', mode: 'timer', recog: 'choice' } as TrainerPrefs,
};

let loading: Promise<void> | null = null;

export function loadTrainer(): Promise<void> {
  loading ??= (async () => {
    const [stats, algs, custom, prefs] = await Promise.all([
      get<Record<string, CaseStats>>('meta', 'trainer:stats'),
      get<Record<string, { alg?: string; note?: string }>>('meta', 'trainer:algs'),
      get<CustomCase[]>('meta', 'trainer:custom'),
      get<Partial<TrainerPrefs>>('meta', 'trainer:prefs'),
    ]);
    state.stats = stats ?? {};
    state.algs = algs ?? {};
    state.custom = Array.isArray(custom) ? custom : [];
    state.prefs = { ...state.prefs, ...(prefs ?? {}) };
    state.loaded = true;
  })();
  return loading;
}

const timers = new Map<string, number>();
const pending = new Map<string, unknown>();
function save(key: string, value: unknown): void {
  clearTimeout(timers.get(key));
  pending.set(key, value);
  timers.set(key, window.setTimeout(() => {
    pending.delete(key);
    void write([{ store: 'meta', putKeyed: [[key, value]] }]);
  }, 300));
}

/** Write anything still waiting on its debounce (the page is going away). */
function flush(): void {
  if (!pending.size) return;
  const entries = [...pending.entries()] as [IDBValidKey, unknown][];
  pending.clear();
  timers.forEach((t) => clearTimeout(t));
  void write([{ store: 'meta', putKeyed: entries }]);
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

export function caseStats(key: string): CaseStats {
  return state.stats[key] ?? emptyStats();
}

export function setCaseStats(key: string, s: CaseStats): void {
  state.stats[key] = s;
  save('trainer:stats', state.stats);
}

export function userAlg(key: string): { alg?: string; note?: string } {
  return state.algs[key] ?? {};
}

export function setUserAlg(key: string, patch: { alg?: string; note?: string }): void {
  const next = { ...state.algs[key], ...patch };
  if (!next.alg) delete next.alg;
  if (!next.note) delete next.note;
  if (Object.keys(next).length) state.algs[key] = next;
  else delete state.algs[key];
  save('trainer:algs', state.algs);
}

export function customCases(): CustomCase[] {
  return state.custom;
}

export function setCustomCases(list: CustomCase[]): void {
  state.custom = list;
  save('trainer:custom', list);
}

export function trainerPrefs(): TrainerPrefs {
  return state.prefs;
}

export function setTrainerPrefs(patch: Partial<TrainerPrefs>): void {
  state.prefs = { ...state.prefs, ...patch };
  save('trainer:prefs', state.prefs);
}
