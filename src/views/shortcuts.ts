/**
 * inphner: the `?` sheet. Every shortcut the app has, in the order you meet
 * them: jumping between views, the timer, the trainer, then the global ones.
 */
import { esc } from '../ui/dom.ts';
import { openModal } from '../ui/modal.ts';
import { VIEWS } from './registry.ts';

function row(keys: string[], label: string): string {
  return `<div class="row-compact" style="justify-content:space-between"><span>${esc(label)}</span>
      <span style="display:flex;gap:4px">${keys.map((k) => `<kbd style="margin:0">${esc(k)}</kbd>`).join('')}</span></div>`;
}

export function showShortcuts(): void {
  openModal({
    title: 'Keyboard shortcuts',
    confirmLabel: 'Done',
    cancelLabel: '',
    bodyHtml: `
      <div class="micro-label" style="margin:0 0 6px 9px">Go to</div>
      ${VIEWS.map((v) => row(['g', v.key], v.label)).join('')}
      <div class="micro-label" style="margin:14px 0 6px 9px">Timer</div>
      ${row(['Space'], 'Hold until green, release to start')}
      ${row(['any key'], 'Stop')}
      ${row(['Esc'], 'Cancel a hold or inspection')}
      ${row(['↵'], 'Keep the last solve')}
      ${row(['2'], 'Toggle +2 on the last solve')}
      ${row(['D'], 'Toggle DNF on the last solve')}
      ${row(['C'], 'Comment on the last solve')}
      ${row(['⌫'], 'Delete the last solve')}
      ${row(['Alt', '1 / 2 / 3'], 'Last solve: OK / +2 / DNF')}
      ${row(['Alt', 'Z'], 'Undo the last delete')}
      <div class="micro-label" style="margin:14px 0 6px 9px">Trainer</div>
      ${row(['Space'], 'Time the case (hold, release to start)')}
      ${row(['↵', 'N'], 'Next case')}
      ${row(['M', 'M'], 'Mark the case as a mistake (twice: it asks first)')}
      ${row(['S'], 'Show the alg')}
      ${row(['1 – 4'], 'Answer in recognition mode')}
      ${row(['Esc'], 'Cancel the attempt')}
      <div class="micro-label" style="margin:14px 0 6px 9px">Anywhere</div>
      ${row(['K', '⌘K'], 'Search and commands')}
      ${row(['↑ ↓'], 'Move through the results')}
      ${row(['?'], 'This sheet')}
      ${row(['Esc'], 'Close a drawer or dialog')}`,
  });
}
