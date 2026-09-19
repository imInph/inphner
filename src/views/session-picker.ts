/**
 * inphner: the session picker, a glass pill in the Timer header
 * ("3x3 · Main ▾") that opens a popover listing sessions grouped by event,
 * each with its solve count and current ao12; plus "New session…".
 */
import { EVENTS, eventDef } from '../events.ts';
import { DNF, effective, statAt } from '../stats/core.ts';
import { createSession, currentSession, sessionSummaries, setCurrentSession } from '../store.ts';
import { prefs } from '../prefs.ts';
import { warm } from '../scramble/generator.ts';
import { esc } from '../ui/dom.ts';
import { eventIcon } from '../ui/event-icon.ts';
import { icon } from '../ui/icons.ts';
import { openModal } from '../ui/modal.ts';
import { openPopover } from '../ui/popover.ts';
import { fmtStat } from './solve-list.ts';

export function renderSessionPill(): void {
  const pill = document.getElementById('event-pill');
  if (!pill) return;
  const s = currentSession();
  const def = eventDef(s.event);
  pill.innerHTML = `${eventIcon(def.id, 18)}<span class="pill-label">${esc(def.short)}<span class="pill-sep"> · </span><span class="pill-name">${esc(s.name)}</span></span>${icon('down', 14)}`;
  pill.title = `Session: ${def.name} · ${s.name}`;
  pill.setAttribute('aria-label', `Session ${def.short} ${s.name}. Change session`);
}

export async function openSessionPicker(trigger: HTMLElement): Promise<void> {
  const summaries = await sessionSummaries();
  const current = currentSession().id;
  const p = prefs().precision;
  const byEvent = new Map<string, typeof summaries>();
  for (const sum of summaries) {
    const list = byEvent.get(sum.session.event) ?? [];
    list.push(sum);
    byEvent.set(sum.session.event, list);
  }
  const groups = EVENTS.filter((e) => byEvent.has(e.id)).map((e) => `
    <div class="micro-label popover-section">${esc(e.short)}</div>
    ${byEvent.get(e.id)!.map(({ session, count, last }) => {
      const ao12 = statAt(last.map((x) => effective(x, p)), 12);
      const on = session.id === current;
      return `<button type="button" class="popover-item session-item" data-pick="${esc(session.id)}" ${on ? 'aria-current="true"' : ''}>
        ${eventIcon(session.event, 18)}
        <span class="grow">${esc(session.name)}</span>
        <span class="session-meta num">${count}${count >= 12 ? ` · ao12 ${ao12 === DNF ? 'DNF' : fmtStat(ao12, session.event)}` : ''}</span>
        ${on ? icon('check', 16) : ''}
      </button>`;
    }).join('')}`).join('');

  openPopover(trigger, `
    <div class="popover-scroll session-picker">
      ${groups}
      <div class="popover-foot">
        <button type="button" class="popover-item" data-pick="__new">${icon('plus', 18)}<span class="grow">New session…</span></button>
        <a class="popover-item" href="#sessions" data-pick="__all"><span class="grow">All sessions</span>${icon('chevron', 16)}</a>
      </div>
    </div>`, (id) => {
    if (id === '__new') newSessionDialog();
    else if (id !== '__all') void setCurrentSession(id).then(() => warm(currentSession().event));
  });
}

export function newSessionDialog(defaultEvent = currentSession().event): void {
  const options = (group: 'wca' | 'training') => EVENTS.filter((e) => e.group === group)
    .map((e) => `<option value="${e.id}" ${e.id === defaultEvent ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  openModal({
    title: 'New session',
    confirmLabel: 'Create',
    bodyHtml: `
      <label><span>Name</span><input name="name" maxlength="60" placeholder="Main, OH practice, Comp sim…" autocomplete="off"></label>
      <label style="margin-top:12px"><span>Event</span><select name="event">
        <optgroup label="WCA">${options('wca')}</optgroup><optgroup label="Training">${options('training')}</optgroup>
      </select></label>`,
    onConfirm: async (m) => {
      const name = m.querySelector<HTMLInputElement>('[name="name"]')!.value.trim() || 'Main';
      const event = m.querySelector<HTMLSelectElement>('[name="event"]')!.value;
      await createSession({ name, event });
      warm(event);
    },
  });
}
