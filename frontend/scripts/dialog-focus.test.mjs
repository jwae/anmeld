import test from 'node:test';
import assert from 'node:assert/strict';
import { vDialogFocus } from '../src/directives/dialogFocus.ts';

// Small DOM adapter for behavior tests; does not claim browser/layout coverage.
class Element {
  constructor(children = []) {
    this.children = children;
    this.attributes = new Map();
    this.isConnected = true;
    this.tabIndex = 0;
    this.visible = true;
    this.disabled = false;
    this.clicks = 0;
  }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  removeAttribute(key) { this.attributes.delete(key); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll() { return this.children.flatMap(child => [child, ...child.querySelectorAll()]); }
  querySelector() { return this.querySelectorAll().find(child => child.close) ?? null; }
  matches() { return this.disabled; }
  closest() { return this.hidden ? this : null; }
  getClientRects() { return this.visible ? [{}] : []; }
  click() { this.clicks++; }
  focus() {
    document.activeElement = this;
    const event = new Event('focusin');
    Object.defineProperty(event, 'target', { value: this });
    document.dispatchEvent(event);
  }
}
function setup(t) {
  const previous = { document: globalThis.document, HTMLElement: globalThis.HTMLElement, getComputedStyle: globalThis.getComputedStyle };
  globalThis.document = new EventTarget();
  globalThis.HTMLElement = Element;
  globalThis.getComputedStyle = () => ({ visibility: 'visible' });
  const opener = new Element();
  document.activeElement = opener;
  const mounted = new Set();
  function mount(el) { mounted.add(el); vDialogFocus.mounted(el); }
  function unmount(el) { vDialogFocus.unmounted(el); el.isConnected = false; mounted.delete(el); }
  t.after(async () => {
    for (const el of [...mounted].reverse()) unmount(el);
    await Promise.resolve();
    Object.assign(globalThis, previous);
  });
  function key(key, shiftKey = false) {
    const event = new Event('keydown', { cancelable: true });
    Object.assign(event, { key, shiftKey, isComposing: false });
    document.dispatchEvent(event);
    return event;
  }
  return { opener, mount, unmount, key };
}

test('initial focus is on the dialog, never a destructive action; focus returns to opener', async t => {
  const { opener, mount, unmount } = setup(t);
  const action = new Element(), dialog = new Element([action]);
  mount(dialog);
  await Promise.resolve();
  assert.equal(document.activeElement, dialog);
  assert.equal(action.clicks, 0);
  unmount(dialog);
  await Promise.resolve();
  assert.equal(document.activeElement, opener);
  assert.equal(dialog.getAttribute('tabindex'), null);
});

test('Tab wraps both ways and skips disabled and hidden controls', async t => {
  const { mount, key } = setup(t);
  const first = new Element(), disabled = new Element(), hidden = new Element(), last = new Element();
  disabled.disabled = true;
  hidden.visible = false;
  const dialog = new Element([first, disabled, hidden, last]);
  mount(dialog);
  await Promise.resolve();
  assert.ok(key('Tab').defaultPrevented);
  assert.equal(document.activeElement, first);
  key('Tab', true);
  assert.equal(document.activeElement, last);
  key('Tab');
  assert.equal(document.activeElement, first);
});

test('Escape respects a busy close control and uses only the existing close action', async t => {
  const { mount, key } = setup(t);
  const close = new Element(), destructive = new Element();
  close.close = true;
  close.disabled = true;
  mount(new Element([destructive, close]));
  await Promise.resolve();
  key('Escape');
  assert.equal(close.clicks, 0);
  close.disabled = false;
  key('Escape');
  assert.equal(close.clicks, 1);
  assert.equal(destructive.clicks, 0);
});

test('only the top dialog handles Escape and closing it restores focus within its parent', async t => {
  const { mount, unmount, key } = setup(t);
  const parentClose = new Element(), launch = new Element();
  parentClose.close = true;
  const parent = new Element([parentClose, launch]);
  mount(parent);
  await Promise.resolve();
  launch.focus();
  const childClose = new Element(); childClose.close = true;
  const child = new Element([childClose]);
  mount(child);
  await Promise.resolve();
  key('Escape');
  assert.equal(childClose.clicks, 1);
  assert.equal(parentClose.clicks, 0);
  unmount(child);
  await Promise.resolve();
  assert.equal(document.activeElement, launch);
  key('Escape');
  assert.equal(parentClose.clicks, 1);
});

test('empty dialogs retain focus and wizard updates recover removed focused controls', async t => {
  const { opener, mount, key } = setup(t);
  const dialog = new Element();
  mount(dialog);
  await Promise.resolve();
  assert.ok(key('Tab').defaultPrevented);
  opener.focus();
  assert.equal(document.activeElement, dialog);
  document.activeElement = opener;
  vDialogFocus.updated(dialog);
  assert.equal(document.activeElement, dialog);
});

test('unmount removes the focus trap and does not focus a removed opener', async t => {
  const { opener, mount, unmount, key } = setup(t);
  const dialog = new Element();
  mount(dialog);
  await Promise.resolve();
  opener.isConnected = false;
  unmount(dialog);
  await Promise.resolve();
  const outside = new Element();
  outside.focus();
  assert.equal(document.activeElement, outside);
  assert.equal(key('Tab').defaultPrevented, false);
});
