/**
 * inphner: the solve detail modal (inphner-prompt.md §A12): time, penalty
 * segmented control, scramble with its preview, splits, comment, date,
 * move to another session, delete (with Undo).
 */
import { eventDef } from '../events.ts';
import { netSvg } from '../scramble/net.ts';
import { applyScramble, cubeSize, solvedCube } from '../scramble/nxn.ts';
import { scrambleRows } from '../scramble/moves.ts';
import {
  deleteSolves, moveSolves, orderedSessions, restoreSolves, sessionById, sessionLabel, solveById, updateSolve,
} from '../store.ts';
import { formatSingle, type Penalty } from '../timer/format.ts';
import { prefs } from '../prefs.ts';
import { esc } from '../ui/dom.ts';
import { openModal } from '../ui/modal.ts';
import { toast } from '../ui/toast.ts';
import { fmtSingle } from './solve-list.ts';

export function deleteWithUndo(ids: string[], label?: string): void {
  void deleteSolves(ids).then((removed) => {
    if (!removed.length) return;
    const what = label ?? (removed.length === 1 ? `Deleted ${fmtSingle(removed[0]!)}.` : `Deleted ${removed.length} solves.`);
    toast(what, { action: { label: 'Undo', run: () => { void restoreSolves(removed).then(() => toast('Restored.', { kind: 'good' })); } } });
  });
}

export function openSolveModal(id: string, index?: number): void {
  const s = solveById(id);
  if (!s) return;
  const p = prefs();
  const n = cubeSize(s.event);
  const date = new Date(s.createdAt);
  const when = date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const preview = s.scramble && n && applyScramble(solvedCube(n), s.scramble) ? netSvg(n, s.scramble, 220) : '';
  const splits = s.splits?.length
    ? `<div class="modal-section"><div class="micro-label">Splits</div><div class="split-list">${s.splits.map((ms, i) => {
      const prev = i ? s.splits![i - 1]! : 0;
      return `<span class="chip num">${i + 1}: ${formatSingle(ms - prev, p.precision)}</span>`;
    }).join('')}</div></div>` : '';
  const moveOptions = orderedSessions().map((x) => `<option value="${esc(x.id)}" ${x.id === s.sessionId ? 'selected' : ''}>${esc(sessionLabel(x))}</option>`).join('');
  const seg = (v: Penalty, label: string) => `<button type="button" data-pen="${v}" class="${s.penalty === v ? 'on' : ''}" aria-pressed="${s.penalty === v}">${label}</button>`;

  const { root, close } = openModal({
    title: index ? `Solve #${index}` : 'Solve',
    size: 'lg',
    confirmLabel: 'Done',
    cancelLabel: '',
    bodyHtml: `
      <div class="solve-detail">
        <div class="solve-detail-top">
          <div>
            <div class="solve-detail-time num" data-role="time">${esc(fmtSingle(s))}</div>
            <div class="text-dim solve-detail-meta">${esc(eventDef(s.event).name)} · ${esc(when)}${s.source && s.source !== 'timer' ? ` · ${esc(s.source)}` : ''}</div>
          </div>
          <div class="segmented" role="group" aria-label="Penalty">${seg(0, 'OK')}${seg(2000, '+2')}${seg('DNF', 'DNF')}</div>
        </div>
        ${s.scramble ? `
        <div class="modal-section solve-detail-scramble">
          <div class="scramble-text is-long">${scrambleRows(s.scramble, s.event).map((row) => `<div class="scramble-row">${row.map((m) => `<span class="mv">${esc(m)}</span>`).join(' ')}</div>`).join('')}</div>
          ${preview ? `<div class="solve-detail-net">${preview}</div>` : ''}
        </div>` : ''}
        ${s.solution ? `<div class="modal-section"><div class="micro-label">Solution</div><div class="mono">${esc(s.solution)}</div></div>` : ''}
        ${splits}
        <label class="modal-section"><span>Comment</span><textarea name="comment" rows="2" maxlength="500" placeholder="Anything worth remembering…">${esc(s.comment ?? '')}</textarea></label>
        <div class="field-row modal-section">
          <label><span>Session</span><select name="session">${moveOptions}</select></label>
        </div>
        <div class="solve-detail-actions">
          <button type="button" class="btn btn-danger btn-sm" data-act-local="delete">Delete solve</button>
        </div>
      </div>`,
    onConfirm: async (m) => {
      const comment = m.querySelector<HTMLTextAreaElement>('[name="comment"]')!.value.trim();
      if (comment !== (s.comment ?? '')) await updateSolve(s.id, { comment: comment || undefined });
      const target = m.querySelector<HTMLSelectElement>('[name="session"]')!.value;
      if (target !== s.sessionId) {
        const from = s.sessionId;
        const moved = await moveSolves([s.id], target);
        if (moved.length) {
          toast(`Moved to ${sessionLabel(sessionById(target)!)}.`, {
            action: { label: 'Undo', run: () => { void moveSolves(moved, from); } },
          });
        }
      }
    },
  });

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const pen = t.closest<HTMLElement>('[data-pen]');
    if (pen) {
      const v = pen.dataset.pen === 'DNF' ? 'DNF' : (Number(pen.dataset.pen) as 0 | 2000);
      void updateSolve(s.id, { penalty: v }).then((u) => {
        if (!u) return;
        root.querySelectorAll<HTMLElement>('[data-pen]').forEach((b) => {
          const on = b.dataset.pen === String(v);
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', String(on));
        });
        root.querySelector('[data-role="time"]')!.textContent = fmtSingle(u);
      });
    }
    if (t.closest('[data-act-local="delete"]')) {
      close();
      deleteWithUndo([s.id]);
    }
  });
}
