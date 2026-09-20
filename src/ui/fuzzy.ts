/**
 * inphner: the fuzzy matcher behind the command palette. PURE (no DOM), so it
 * has tests. A query matches a string when its characters appear in order;
 * the score rewards the start of the text, the start of a word and runs of
 * consecutive characters, so "gt" finds "Go to Timer" and "sess" beats
 * "Settings" with "Sessions". Spaces split the query into terms that are each
 * matched separately, so "timer go" finds "Go to Timer" too.
 */

export interface FuzzyMatch {
  score: number;
  /** Matched positions in the text, ascending and unique (for highlighting). */
  indices: number[];
}

const ALNUM = /[a-z0-9]/i;

/** A word start: index 0, or a letter/digit after something that isn't one. */
function isWordStart(text: string, i: number): boolean {
  if (i === 0) return true;
  return ALNUM.test(text[i]!) && !ALNUM.test(text[i - 1]!);
}

const START = 18;   // the very first character
const WORD = 10;    // the first character of a word
const CONSEC = 20;  // a character right after the previous match
const GAP_CAP = 8;  // the worst a gap can cost

function charBonus(text: string, i: number): number {
  if (i === 0) return START;
  return isWordStart(text, i) ? WORD : 0;
}

/**
 * The best-scoring way to spread `term` over `text`, by dynamic programming:
 * best[j][i] is the best score for term[0..j] with term[j] landing on text[i].
 * Greedy left-to-right matching gets this wrong often enough to matter — it
 * spends the "c" of "csv" on "cstimer" and then can't find "csv" any more.
 */
function matchTerm(term: string, text: string, lower: string): FuzzyMatch | null {
  const n = text.length;
  const m = term.length;
  if (!m) return { score: 0, indices: [] };
  if (m > n) return null;

  let prev: number[] = [];
  const parents: number[][] = [];
  for (let j = 0; j < m; j++) {
    const cur = new Array<number>(n).fill(-Infinity);
    const par = new Array<number>(n).fill(-1);
    // The best predecessor far enough back that the gap penalty has saturated.
    let farBest = -Infinity;
    let farAt = -1;
    for (let i = 0; i < n; i++) {
      const far = i - 2 - GAP_CAP;
      if (j > 0 && far >= 0 && prev[far]! > farBest) { farBest = prev[far]!; farAt = far; }
      if (lower[i] !== term[j]) continue;
      const here = 1 + charBonus(text, i);
      if (j === 0) { cur[i] = here; continue; }
      let best = -Infinity;
      let at = -1;
      if (prev[i - 1] !== undefined && prev[i - 1]! > -Infinity) { best = prev[i - 1]! + CONSEC; at = i - 1; }
      for (let k = i - 2; k >= Math.max(0, i - 1 - GAP_CAP); k--) {
        const v = prev[k]! - (i - k - 1);
        if (v > best) { best = v; at = k; }
      }
      if (farBest - GAP_CAP > best) { best = farBest - GAP_CAP; at = farAt; }
      if (at < 0) continue;
      cur[i] = best + here;
      par[i] = at;
    }
    parents.push(par);
    prev = cur;
  }

  let end = -1;
  let score = -Infinity;
  for (let i = 0; i < n; i++) if (prev[i]! > score) { score = prev[i]!; end = i; }
  if (end < 0 || score === -Infinity) return null;

  const indices: number[] = [];
  for (let j = m - 1, i = end; j >= 0 && i >= 0; i = parents[j]![i]!, j--) indices.unshift(i);
  if (lower.startsWith(term)) score += 30;
  return { score, indices };
}

/** null when the query doesn't match at all. An empty query matches everything at 0. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return { score: 0, indices: [] };
  const lower = text.toLowerCase();
  const hits = new Set<number>();
  let score = 0;
  for (const term of terms) {
    const m = matchTerm(term, text, lower);
    if (!m) return null;
    score += m.score;
    for (const i of m.indices) hits.add(i);
  }
  // Shorter labels win a tie: "Timer" over "Toggle inspection for 3x3".
  return { score: score - text.length * 0.05, indices: [...hits].sort((a, b) => a - b) };
}

/**
 * A row's own label first: when it matches, that's the score and the
 * highlight. Only if it doesn't do we fall back to its subtitle and keywords,
 * at a penalty, so "stat" finds "Go to Stats" before a row that merely
 * mentions statistics further down.
 */
export function fuzzyFields(query: string, label: string, everything: string, penalty = 15): FuzzyMatch | null {
  const first = fuzzyMatch(query, label);
  if (first) return first;
  const rest = fuzzyMatch(query, everything);
  return rest ? { score: rest.score - penalty, indices: [] } : null;
}

/** Matching items, best first; ties keep their original order. */
export function rank<T>(
  query: string,
  items: readonly T[],
  match: (item: T, query: string) => FuzzyMatch | null,
): { item: T; match: FuzzyMatch }[] {
  const out: { item: T; match: FuzzyMatch; i: number }[] = [];
  items.forEach((item, i) => {
    const m = match(item, query);
    if (m) out.push({ item, match: m, i });
  });
  out.sort((a, b) => b.match.score - a.match.score || a.i - b.i);
  return out.map(({ item, match: m }) => ({ item, match: m }));
}
