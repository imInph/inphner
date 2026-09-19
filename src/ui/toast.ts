/**
 * inphner: toasts (bottom-right glass stack, inphub's look). A toast with an
 * action (Undo) lingers longer; `persistent` toasts stay until dismissed (used
 * for "could not save this solve" errors).
 */

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastOptions {
  kind?: 'good' | 'bad' | '';
  action?: ToastAction;
  persistent?: boolean;
}

const TOAST_MAX = 4;

export function toast(message: string, opts: ToastOptions = {}): () => void {
  const host = document.getElementById('toasts');
  if (!host) return () => {};
  while (host.children.length >= TOAST_MAX) host.firstElementChild?.remove();

  const el = document.createElement('div');
  el.className = 'toast' + (opts.kind ? ' ' + opts.kind : '');
  if (opts.kind === 'bad') el.setAttribute('role', 'alert');

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;
  el.appendChild(text);

  let timer = 0;
  const dismiss = () => {
    clearTimeout(timer);
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 200);
  };

  if (opts.action) {
    const { label, run } = opts.action;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      dismiss();
      run();
    });
    el.appendChild(btn);
  }

  host.appendChild(el);
  if (!opts.persistent) {
    timer = window.setTimeout(dismiss, opts.action ? 7000 : opts.kind === 'bad' ? 4200 : 2600);
  }
  return dismiss;
}
