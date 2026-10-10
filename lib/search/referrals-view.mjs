// The Referrals page's own state rules (app/_components/ReferralsPage.jsx):
// what the address bar says, how it changes, and what a key does.
//
// The page is master–detail. The list never opens anything by itself: a
// referral opens only when it is clicked, or Enter is pressed on the row the
// arrow keys are on. Which one is open is in the URL — `/?q=skin&r=1964` — so
// Back closes it and a link to a referral opens it.
//
// Pure: no window, no React. The component calls these and does the side
// effects, so the rules are tested as they are.

/** The search text a URL may carry. Matches the API's own cap. */
export const MAX_Q = 200;

/** A row's id ("note:1964") as the `r` parameter ("1964"). Anything else is passed through. */
export function paramFromId(id) {
  const text = String(id ?? '').trim();
  if (!text) return '';
  const m = text.match(/^note:(\d+)$/);
  return m ? m[1] : text;
}

/** The `r` parameter ("1964") as a row id ("note:1964"), or null. */
export function idFromParam(param) {
  const text = String(param ?? '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return 'note:' + Number(text);
  return text.slice(0, 120);
}

/** `{ q, id }` from a location's search string ("?q=skin&r=1964"). */
export function readReferralUrl(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return {
    q: String(params.get('q') || '').slice(0, MAX_Q),
    id: idFromParam(params.get('r')),
  };
}

/** The address for `{ q, id }`: "/", "/?q=skin", "/?q=skin&r=1964", "/?r=1964". */
export function referralUrl({ q = '', id = null } = {}, path = '/') {
  const params = new URLSearchParams();
  const text = String(q || '').trim().slice(0, MAX_Q);
  if (text) params.set('q', text);
  const r = paramFromId(id);
  if (r) params.set('r', r);
  const query = params.toString();
  return path + (query ? '?' + query : '');
}

/**
 * How the address bar moves from `prev` to `next` (both `{ q, id }`), or null
 * when it already says `next`.
 *
 *   - OPENING a referral from the list is a new entry ('push'), so Back
 *     closes it again;
 *   - everything else REPLACES the entry: typing (a history entry a letter is
 *     a Back button that does nothing visible), switching from one open
 *     referral to another (Back still goes to the list, not through every row
 *     looked at), and closing.
 */
export function historyStep(prev, next) {
  const before = prev || { q: '', id: null };
  const after = next || { q: '', id: null };
  const url = referralUrl(after);
  if (url === referralUrl(before)) return null;
  if (after.id && !before.id) return { method: 'push', url };
  return { method: 'replace', url };
}

/**
 * What a key in the search box does. `idx` is the highlighted row (-1 for
 * none), `count` the rows the arrows move through, `open` whether a referral
 * is open, `hasQuery` whether anything is typed.
 *
 * Returns one of:
 *   { type: 'move', idx }  — the highlight moves; NOTHING OPENS
 *   { type: 'open', idx }  — Enter on the highlighted row
 *   { type: 'close' }      — Esc with a referral open: back to the list, search kept
 *   { type: 'clear' }      — Esc with the list showing: empty the box
 *   null                   — not ours; let the key do what it does
 */
export function keyAction({ key, idx = -1, count = 0, open = false, hasQuery = false } = {}) {
  if (key === 'Escape') {
    if (open) return { type: 'close' };
    return hasQuery ? { type: 'clear' } : null;
  }
  if (!count) return null;
  if (key === 'ArrowDown') return { type: 'move', idx: Math.min(Math.max(idx, -1) + 1, count - 1) };
  if (key === 'ArrowUp') return { type: 'move', idx: idx < 0 ? 0 : Math.max(idx - 1, 0) };
  if (key === 'Enter' && idx >= 0 && idx < count) return { type: 'open', idx };
  return null;
}

/** Where the highlight starts for a search: the top row when something is typed (Enter then opens it), none otherwise. */
export function startHighlight(query) {
  return String(query || '').trim() ? 0 : -1;
}

/**
 * The row to show for `id`: from the full list first (it carries every
 * referral), then the search's own rows. Null when it is not there — a deep
 * link to a page since deleted or moved out of Referrals.
 */
export function findReferral(id, ...lists) {
  if (!id) return null;
  for (const list of lists) {
    const hit = (Array.isArray(list) ? list : []).find((row) => row && row.id === id);
    if (hit) return hit;
  }
  return null;
}
