// The counter lives in chrome.storage so the number survives the popup closing —
// which is the point of it: a count that resets every time you open the popup
// proves the button works, but not that the extension's own storage does.
//
// Storage is looked up on each call rather than once at import, because the
// module can be loaded before there is a chrome to find — in a plain browser
// tab during development, or in a test. In those it degrades to an in-memory
// count instead of throwing.
const KEY = 'clickCount';

const area = () => globalThis.chrome?.storage?.local ?? null;
let memory = 0;

export async function readCount() {
  const local = area();
  if (!local) return memory;
  const stored = await local.get(KEY);
  return Number(stored?.[KEY]) || 0;
}

export async function bumpCount() {
  const next = (await readCount()) + 1;
  const local = area();
  if (local) await local.set({ [KEY]: next });
  else memory = next;
  return next;
}
