/**
 * inphner: a calm placeholder card for views that arrive in later build steps.
 */
import { icon } from '../ui/icons.ts';
import { esc } from '../ui/dom.ts';
import type { ViewMeta } from './registry.ts';

/** Which build step (inphner-prompt.md Part C) brings each view to life. */
const ARRIVES: Record<string, string> = {
  tools: 'Coming after the v1.0.0 pre-release: scramble generator, cross solver hints, metronome and a BLD memo helper.',
};

export function renderPlaceholder(container: HTMLElement, meta: ViewMeta): void {
  container.innerHTML = `
    <div class="grid grid-2 stagger">
      <section class="card placeholder" style="--i:0">
        <div class="card-head">
          <span class="badge-ico tint-${meta.tint}">${icon(meta.icon, 16)}</span>
          <h3>${esc(meta.label)}</h3>
        </div>
        <p>${esc(meta.blurb)}</p>
        <p class="text-faint">${esc(ARRIVES[meta.id] ?? '')}</p>
      </section>
    </div>`;
}
