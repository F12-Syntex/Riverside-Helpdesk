// LINKS IN AN ANSWER — which ones are allowed to be links, and the line of
// sources a Notebook answer ends on.
//
// The answer's text comes from a model, so a markdown link in it is untrusted:
// `[Click here](javascript:…)` must never become something that runs. Only two
// kinds of address are ever made clickable:
//
//   - a path on this site, "/notebook/blood-tests-1286" — opened in a new tab,
//     because the chat is not saved and leaving /ask would lose it;
//   - an https:// address — opened in a new tab, rel="noopener noreferrer".
//
// Everything else — javascript:, data:, http:, mailto:, "//host" (another site
// with this one's scheme), "/\host" (which browsers read the same way),
// relative paths, anything with spaces or control characters in it — is shown
// as its words only, with no link.
//
// Pure, so it can be tested without a browser: test/chat-links.test.mjs.

/**
 * `[words](address)` — the words may not span lines or hold brackets; the
 * address may hold one level of balanced parentheses, so a Wikipedia-style
 * address stays whole and "javascript:alert(1)" is recognised (and refused)
 * as one address rather than leaving half of it on screen.
 */
export const LINK_RE = /\[([^[\]\n]+)\]\(\s*((?:[^()\s]|\([^()\s]*\))+)\s*\)/;
const LINK_RE_G = new RegExp(LINK_RE.source, 'g');

/**
 * What an address may become: `{ kind: 'internal' | 'external', href }`, or
 * null when it must stay plain text.
 */
export function linkTarget(href) {
  const raw = String(href == null ? '' : href).trim();
  if (!raw || raw.length > 2048) return null;
  // No whitespace, control characters or backslashes anywhere: browsers drop
  // or rewrite them, and "/\evil.example" is read as "//evil.example".
  // eslint-disable-next-line no-control-regex
  if (/[\s\\\u0000-\u001f\u007f]/.test(raw)) return null;
  if (raw[0] === '/') {
    // "//host/…" leaves the site while looking like a path.
    if (raw[1] === '/') return null;
    return { kind: 'internal', href: raw };
  }
  if (/^https:\/\//i.test(raw)) {
    let url;
    try { url = new URL(raw); } catch (e) { return null; }
    if (url.protocol !== 'https:' || !url.hostname) return null;
    // "https://nhs.uk@evil.example" reads as one site and goes to another.
    if (url.username || url.password) return null;
    return { kind: 'external', href: url.href };
  }
  return null;
}

/** Text with every markdown link reduced to its words — for copies and history. */
export function stripLinks(text) {
  return String(text == null ? '' : text).replace(LINK_RE_G, '$1');
}

// "Sources:" / "**Sources:**" / "**Source**:" / "Source:" at the start of a line.
const SOURCES_HEAD = /^\s*(?:\*\*)?\s*sources?\s*(?:\*\*)?\s*:\s*(?:\*\*)?\s*/i;
// What may sit between the links on a sources line and nothing else.
const SOURCES_GLUE = /^[\s·•,;|]*$/;

/**
 * The sources line a Notebook answer ends on, lifted out of the markdown:
 *
 *   Sources: [Blood tests](/notebook/blood-tests-12) · [Phlebotomy](/notebook/phlebotomy-40)
 *
 * Returns `{ body, sources }` — the markdown without that line, and the links
 * in order as `{ label, target }` (target null when the address is not
 * allowed, so it shows as words). A line that is not only links — "Sources:
 * the practice manager" — is not lifted and stays in the body as written.
 * The last such line wins; the check line the server may add after it stays
 * where it is.
 */
export function splitSources(markdown) {
  const text = String(markdown == null ? '' : markdown);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const head = SOURCES_HEAD.exec(lines[i]);
    if (!head) continue;
    const rest = lines[i].slice(head[0].length);
    const sources = [];
    let m;
    LINK_RE_G.lastIndex = 0;
    while ((m = LINK_RE_G.exec(rest))) {
      sources.push({ label: m[1].replace(/\*\*/g, '').trim(), target: linkTarget(m[2]) });
    }
    if (!sources.length || !SOURCES_GLUE.test(rest.replace(LINK_RE_G, ''))) continue;
    const kept = lines.slice(0, i).concat(lines.slice(i + 1));
    return { body: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), sources };
  }
  return { body: text, sources: [] };
}
