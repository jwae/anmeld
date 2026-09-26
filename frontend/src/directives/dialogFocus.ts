import type { ObjectDirective } from 'vue';

const stack: HTMLElement[] = [];
const cleanup = new WeakMap<HTMLElement, () => void>();
const candidates = 'button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]';

function focusable(el: HTMLElement) {
  return [...el.querySelectorAll<HTMLElement>(candidates)].filter(node =>
    node.tabIndex >= 0 && !node.matches(':disabled') &&
    !node.closest('[inert], [hidden], [aria-hidden="true"]') &&
    node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden',
  );
}

// Presentation only: Escape clicks the existing close control, including its
// disabled state and existing handler. Never execute a submit/delete action.
export const vDialogFocus: ObjectDirective<HTMLElement> = {
  mounted(el) {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalTabindex = el.getAttribute('tabindex');
    el.setAttribute('tabindex', '-1');
    stack.push(el);
    const isTop = () => stack.at(-1) === el;
    const focusRoot = () => el.focus({ preventScroll: true });
    const onFocus = (event: FocusEvent) => {
      if (isTop() && !el.contains(event.target as Node)) focusRoot();
    };
    const onKey = (event: KeyboardEvent) => {
      if (!isTop() || event.defaultPrevented || event.isComposing) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        const close = el.querySelector<HTMLButtonElement>('button[data-dialog-close]');
        if (close && !close.matches(':disabled') && close.getAttribute('aria-disabled') !== 'true') close.click();
      } else if (event.key === 'Tab') {
        const items = focusable(el);
        const active = document.activeElement;
        const first = items[0];
        const last = items.at(-1);
        if (!first || !last) {
          event.preventDefault();
          focusRoot();
        } else if (event.shiftKey && (active === first || !items.includes(active as HTMLElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !items.includes(active as HTMLElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    queueMicrotask(() => { if (el.isConnected && isTop()) focusRoot(); });
    cleanup.set(el, () => {
      const wasTop = isTop();
      stack.splice(stack.indexOf(el), 1);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      if (originalTabindex === null) el.removeAttribute('tabindex');
      else el.setAttribute('tabindex', originalTabindex);
      queueMicrotask(() => {
        if (!wasTop) return;
        const parent = stack.at(-1);
        if (previous?.isConnected && (!parent || parent.contains(previous))) previous.focus({ preventScroll: true });
        else parent?.focus({ preventScroll: true });
      });
    });
  },
  updated(el) {
    // Wizard steps can remove the focused button without firing focusin.
    if (stack.at(-1) === el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  },
  unmounted(el) {
    cleanup.get(el)?.();
    cleanup.delete(el);
  },
};
