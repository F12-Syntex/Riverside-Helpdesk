// HOW MUCH OF A STREAMING ANSWER TO SHOW, a frame at a time.
//
// The server sends the whole draft so far every 120ms or more (lib/agent/
// draft.mjs), so left alone the answer lands in lumps of a line or two. The
// reveal releases it at an even reading pace instead — see useSmoothText.js —
// and this file decides where each frame may stop.
//
// The rule is that a frame never stops anywhere the markdown would read as
// something it is not. Cut in the middle of a word, the reader sees half a
// word; cut inside **bold**, they see two asterisks; cut half way along a
// table row, Md has no table row to draw and shows "| HCA | Sa" as a
// paragraph under the table for a frame, which is exactly the kind of
// flicker the reveal exists to remove. So the cut is pushed forward to the
// next place the text is whole: the end of the word, the close of the
// markup, the end of a line that only makes sense whole.
//
// Pure, so it can be tested without a browser: test/chat-smooth.test.mjs.

// Lines Md only understands whole: a table row, and the closing line of
// sources that Md lifts out as chips (see splitSources in ./links.mjs).
const WHOLE_LINE = /^\s*(\||sources?\s*:)/i;
const TABLE_SEP = /^\s*\|?[\s:|-]+\|?\s*$/;
const TAGS = 'mark|u|kbd|span|b|strong|em|i';
const OPEN_TAG = new RegExp('<(' + TAGS + ')\\b[^>]*>', 'g');
const CLOSE_TAG = new RegExp('</(' + TAGS + ')>', 'g');
// How far a cut may be pushed to make the text whole. Past this the text is
// shown as it is — a run with no end in sight is not worth waiting for.
const REACH = 200;

const count = (s, re) => (s.match(re) || []).length;

/**
 * The first index at or after `end` where `text` can be cut without showing
 * broken markdown.
 */
export function snapEnd(text, end) {
  const t = String(text || '');
  if (end >= t.length) return t.length;
  if (end <= 0) return 0;

  // The word in hand is finished.
  const ws = t.slice(end).search(/\s/);
  if (ws === -1) return t.length - end <= 80 ? t.length : end;
  if (ws > 0 && ws <= 80) end += ws;

  // A line just completed has nothing partial left in it.
  if (t[end - 1] === '\n') return end;
  const ls = t.lastIndexOf('\n', end - 1) + 1;
  let le = t.indexOf('\n', end);
  if (le === -1) le = t.length;
  const line = t.slice(ls, le);

  if (WHOLE_LINE.test(line)) {
    // A table header is not a table until the separator under it arrives,
    // so the two are shown together.
    if (line.trim().startsWith('|') && le < t.length) {
      let ne = t.indexOf('\n', le + 1);
      if (ne === -1) ne = t.length;
      const next = t.slice(le + 1, ne);
      if (TABLE_SEP.test(next) && next.includes('-') && next.includes('|')) return ne;
    }
    return le;
  }

  // A list marker on its own ("1.") is a paragraph until its words follow.
  if (/^\s*(\d+[.)]|[-*+])$/.test(t.slice(ls, end).trimEnd())) {
    const more = /^\s+\S+/.exec(t.slice(end));
    if (more) end += more[0].length;
  }

  // Inline markup opened on this line is closed before the cut.
  for (let guard = 0; guard < 6; guard += 1) {
    const head = t.slice(ls, end);
    let to = -1;
    if (count(head, /\*\*/g) % 2 === 1) {
      const j = t.indexOf('**', end);
      if (j !== -1 && j - end <= REACH) to = j + 2;
    } else if (head.lastIndexOf('<') > head.lastIndexOf('>')) {
      const j = t.indexOf('>', end);
      if (j !== -1 && j - end <= REACH) to = j + 1;
    } else if (count(head, OPEN_TAG) > count(head, CLOSE_TAG)) {
      const m = new RegExp('</(' + TAGS + ')>').exec(t.slice(end));
      if (m && m.index <= REACH) to = end + m.index + m[0].length;
    } else if (head.lastIndexOf('[') > head.lastIndexOf(']')) {
      // Inside a link's words: on to the end of its address, if it is a link.
      const k = t.indexOf('](', end);
      const p = k === -1 ? -1 : t.indexOf(')', k);
      if (k !== -1 && k - end <= REACH && p !== -1 && p - end <= REACH * 2) to = p + 1;
    } else if (head.lastIndexOf('](') > head.lastIndexOf(')')) {
      const p = t.indexOf(')', end);
      if (p !== -1 && p - end <= REACH) to = p + 1;
    }
    if (to <= end) break;
    end = Math.min(to, le);
  }
  return end;
}

/**
 * The next frame of the reveal: `shown` moved toward `target` by `ms` of
 * reading time. The pace rises with the backlog so the reveal is never more
 * than about a second behind what has arrived; when the target was rewritten
 * under it, it keeps the part that still stands rather than starting again.
 */
export function nextShown(shown, target, ms) {
  const t = String(target || '');
  let s = String(shown || '');
  if (!t.startsWith(s)) {
    let i = 0;
    const n = Math.min(t.length, s.length);
    while (i < n && t.charCodeAt(i) === s.charCodeAt(i)) i += 1;
    s = t.slice(0, i);
  }
  const backlog = t.length - s.length;
  if (backlog <= 0) return t;
  // A frame's worth of time is capped at a quarter of a second, so a tab
  // coming back from the background catches up in a few frames rather than
  // in one lump — but a slow machine drawing ten frames a second still
  // reveals at the full pace.
  const perSecond = Math.max(120, backlog / 1.1);
  const step = Math.max(1, Math.round(perSecond * Math.min(250, Math.max(0, ms)) / 1000));
  return t.slice(0, snapEnd(t, s.length + step));
}
