'use client';

// Tiny app-wide notification store. Any client component can call notify(...)
// and the single <Notifications/> host (rendered in the root layout) shows it.
// Kept framework-light: a module-level list with subscribers, no context.

let _id = 0;
let _items = [];
const _subs = new Set();

function emit() { _subs.forEach((fn) => fn(_items)); }

// notify('Saved.')  |  notify('Failed', 'error')  |  notify('Hi', { type:'success', duration:8000 })
export function notify(message, opts = {}) {
  if (!message) return null;
  const o = typeof opts === 'string' ? { type: opts } : (opts || {});
  const type = o.type || 'info';
  const duration = o.duration != null ? o.duration : 5000;
  const id = ++_id;
  _items = [..._items, { id, message: String(message), type }];
  emit();
  if (duration > 0 && typeof setTimeout !== 'undefined') setTimeout(() => dismiss(id), duration);
  return id;
}

export function dismiss(id) {
  _items = _items.filter((i) => i.id !== id);
  emit();
}

export function subscribe(fn) {
  _subs.add(fn);
  fn(_items);
  return () => _subs.delete(fn);
}
