/**
 * inphner: glass modal (a bottom sheet at ≤768px, via CSS). The dim + blur is
 * on .modal-backdrop::before, never on the backdrop element itself, or the
 * glass box inside would blur only the flat tint.
 */
import { esc } from './dom.ts';

export interface ModalOptions {
  title: string;
  /** Raw HTML: build it with esc() around every user value. */
  bodyHtml: string;
  confirmLabel?: string;
  /** '' hides the cancel button. */
  cancelLabel?: string;
  danger?: boolean;
  size?: 'lg';
  /** Return false to keep the modal open. */
  onConfirm?: (root: HTMLElement) => boolean | void | Promise<boolean | void>;
  onClose?: () => void;
}

export function openModal(opts: ModalOptions): { root: HTMLElement; close: () => void } {
  const titleId = 'modal-title-' + Math.random().toString(36).slice(2, 8);
  const returnTo = document.activeElement as HTMLElement | null;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal${opts.size === 'lg' ? ' modal-lg' : ''}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <h3 id="${titleId}">${esc(opts.title)}</h3>
      <div class="modal-body">${opts.bodyHtml}</div>
      <div class="modal-actions">
        ${opts.cancelLabel === '' ? '' : `<button type="button" class="btn" data-act="cancel">${esc(opts.cancelLabel ?? 'Cancel')}</button>`}
        <button type="button" class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-act="confirm">${esc(opts.confirmLabel ?? 'Save')}</button>
      </div>
    </div>`;
  const modal = backdrop.querySelector<HTMLElement>('.modal')!;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    opts.onClose?.();
    returnTo?.focus?.();
  };
  const confirm = async () => {
    const keep = (await opts.onConfirm?.(modal)) === false;
    if (!keep) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  backdrop.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === backdrop) return close();
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'cancel') close();
    else if (act === 'confirm') void confirm();
  });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(backdrop);
  (modal.querySelector<HTMLElement>('input, textarea, select') ?? modal.querySelector<HTMLElement>('[data-act="confirm"]'))?.focus();
  return { root: modal, close };
}
