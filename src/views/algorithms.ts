/**
 * inphner: the Algorithms view, your personal alg sheet (inphner-prompt.md §A2).
 * Per case: the diagram, the bundled alg (if any), YOUR alg (used by the
 * trainer's "Show alg"), notes, and the learning status. The Custom set is
 * where you add your own cases (a name + an alg). Route: #algorithms?set=oll.
 */
import { getSet, type SetId, type TrainerCase } from '../trainer/cases.ts';
import { f2lDiagram, llDiagram } from '../trainer/diagram.ts';
import { f2lState } from '../trainer/f2l.ts';
import { cycleStatus } from '../trainer/select.ts';
import {
  caseStats, customCases, loadTrainer, setCaseStats, setCustomCases, setUserAlg, userAlg,
} from '../trainer/store.ts';
import { applyScramble, solvedCube } from '../scramble/nxn.ts';
import { parseRoute, go } from '../router.ts';
import { uuid } from '../store.ts';
import { esc, onAction } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { toast } from '../ui/toast.ts';

const SETS: { id: SetId; label: string }[] = [
  { id: 'pll', label: 'PLL' }, { id: 'oll', label: 'OLL' }, { id: 'f2l', label: 'F2L' }, { id: 'custom', label: 'Custom' },
];
const wired = new WeakSet<HTMLElement>();
let host: HTMLElement | null = null;

function currentSetId(): SetId {
  const s = parseRoute().params.get('set');
  return (SETS.some((x) => x.id === s) ? s : 'pll') as SetId;
}

function diagram(c: TrainerCase): string {
  if (c.kind === 'll' && c.ll) return llDiagram(c.ll, c.style ?? 'pll', c.name);
  if (c.kind === 'f2l' && c.f2l) return f2lDiagram(f2lState(c.f2l, Math.random, 0), c.name);
  return `<div class="case-diagram no-diagram">${icon('cube', 24)}</div>`;
}

function row(c: TrainerCase): string {
  const mine = userAlg(c.key);
  const s = caseStats(c.key);
  const label = { new: 'Not learned', learning: 'Learning', learned: 'Learned' }[s.status];
  return `
    <div class="alg-row" data-key="${esc(c.key)}">
      <div class="alg-diagram">${diagram(c)}</div>
      <div class="alg-main">
        <div class="alg-title"><strong class="${c.unnamed ? 'is-unnamed' : ''}">${esc(c.name)}</strong>
          <button type="button" class="status-dot s-${s.status}" data-action="status" data-key="${esc(c.key)}" title="${label}: tap to change" aria-label="${label}: tap to change"></button>
          ${c.set === 'custom' ? `<button type="button" class="btn btn-ghost btn-sm btn-icon" data-action="remove" data-key="${esc(c.key)}" aria-label="Remove ${esc(c.name)}">${icon('trash', 16)}</button>` : ''}
        </div>
        ${c.alg ? `<div class="mono alg-default" title="Bundled alg">${esc(c.alg)}</div>` : '<div class="text-faint alg-default">No bundled alg.</div>'}
        <label class="alg-field"><span>Your alg</span><input class="mono" data-field="alg" data-key="${esc(c.key)}" value="${esc(mine.alg ?? '')}" placeholder="${c.alg ? 'Same as above' : 'Add the alg you use'}" spellcheck="false" autocomplete="off"></label>
        <label class="alg-field"><span>Notes</span><input data-field="note" data-key="${esc(c.key)}" value="${esc(mine.note ?? '')}" placeholder="Recognition cues, fingertricks…" autocomplete="off"></label>
      </div>
    </div>`;
}

function paint(): void {
  if (!host) return;
  const id = currentSetId();
  const set = getSet(id, customCases());
  const tab = (s: { id: SetId; label: string }) => `<button type="button" data-action="tab" data-value="${s.id}" class="${s.id === id ? 'on' : ''}" aria-pressed="${s.id === id}">${s.label}</button>`;
  host.innerHTML = `
    <div class="stats-toolbar">
      <div class="segmented" role="group" aria-label="Set">${SETS.map(tab).join('')}</div>
      <span class="grow"></span>
      <small class="text-dim">${set.cases.length} cases · your algs are what the trainer shows</small>
    </div>
    ${id === 'custom' ? `
    <section class="card custom-add">
      <div class="card-head"><span class="badge-ico tint-purple">${icon('plus', 16)}</span><h3>Add a case</h3></div>
      <form class="field-row" data-role="add">
        <label><span>Name</span><input name="name" maxlength="40" placeholder="e.g. My ZBLL T1" autocomplete="off"></label>
        <label style="flex:3 1 260px"><span>Alg (the case is set up with its inverse)</span><input name="alg" class="mono" placeholder="R U R' U' …" spellcheck="false" autocomplete="off"></label>
        <button class="btn btn-primary" type="submit" style="align-self:flex-end">Add</button>
      </form>
    </section>` : ''}
    ${set.groups.map((g) => {
      const cases = set.cases.filter((c) => c.group === g.id);
      if (!cases.length) return '';
      return `<section class="card alg-group"><div class="card-head"><span class="badge-ico tint-purple">${icon('book', 16)}</span><h3>${esc(g.name)}</h3><small class="num">${cases.length}</small></div>
        <div class="alg-list">${cases.map(row).join('')}</div></section>`;
    }).join('') || (id === 'custom' ? '<div class="empty">No custom cases yet.</div>' : '')}`;
}

export async function renderAlgorithms(el: HTMLElement): Promise<void> {
  host = el;
  el.innerHTML = '<div class="skeleton"></div>';
  await loadTrainer();
  if (host !== el) return;
  paint();
  onAction(el, (action, t) => {
    if (action === 'tab') go('algorithms', { set: t.dataset.value! });
    else if (action === 'status') {
      const k = t.dataset.key!;
      const s = caseStats(k);
      setCaseStats(k, { ...s, status: cycleStatus(s.status) });
      paint();
    } else if (action === 'remove') {
      const id = t.dataset.key!.replace(/^custom:/, '');
      const before = customCases();
      setCustomCases(before.filter((c) => c.id !== id));
      paint();
      toast('Case removed.', { action: { label: 'Undo', run: () => { setCustomCases(before); paint(); } } });
    }
  });
  if (!wired.has(el)) {
    wired.add(el);
    el.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      const key = t.dataset.key;
      const field = t.dataset.field;
      if (!key || !field) return;
      if (field === 'alg' && t.value.trim() && !applyScramble(solvedCube(3), t.value.trim())) {
        toast('That alg has notation the cube doesn\'t understand (R U F L D B, w, M E S, x y z).', { kind: 'bad' });
        return;
      }
      setUserAlg(key, { [field]: t.value.trim() });
    });
    el.addEventListener('submit', (e) => {
      const form = (e.target as HTMLElement).closest<HTMLFormElement>('[data-role="add"]');
      if (!form) return;
      e.preventDefault();
      const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
      const alg = (form.elements.namedItem('alg') as HTMLInputElement).value.trim();
      if (!name || !alg) {
        toast('Give the case a name and an alg.', { kind: 'bad' });
        return;
      }
      if (!applyScramble(solvedCube(3), alg)) {
        toast('That alg has notation the cube doesn\'t understand.', { kind: 'bad' });
        return;
      }
      setCustomCases([...customCases(), { id: uuid(), name, alg }]);
      paint();
      toast(`Added "${name}".`, { kind: 'good' });
    });
  }
}
