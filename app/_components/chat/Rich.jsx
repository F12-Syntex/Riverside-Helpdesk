'use client';

// Safe renderer for the light inline formatting the assistant may use in its
// answers — the same vocabulary as the notebook's AI formatter: **bold** key
// facts, <mark> safety-critical warnings, <u>, <kbd> and the three NHS colour
// spans. The markup is parsed into React elements (never injected as HTML);
// anything outside this whitelist is stripped or shown as plain text.

const COLOURS = new Set(['#d5281b', '#007f3b', '#005eb8']);

const MARK_STYLE = { background: '#fff2ac', borderRadius: 2, padding: '0 2px' };
const KBD_STYLE = {
  font: 'inherit', fontSize: '0.85em', fontWeight: 600, background: '#f0f4f5',
  border: '1px solid #d8dde0', borderBottomWidth: 2, borderRadius: 4, padding: '0 5px',
};

// Each pattern: regex (first capture = inner text unless innerIndex says
// otherwise) and how to wrap the recursively-rendered inner content.
const PATTERNS = [
  { re: /\*\*([^*]+)\*\*/, wrap: (inner, key) => <strong key={key}>{inner}</strong> },
  { re: /<mark>([\s\S]*?)<\/mark>/i, wrap: (inner, key) => <mark key={key} style={MARK_STYLE}>{inner}</mark> },
  { re: /<u>([\s\S]*?)<\/u>/i, wrap: (inner, key) => <u key={key}>{inner}</u> },
  { re: /<kbd>([\s\S]*?)<\/kbd>/i, wrap: (inner, key) => <kbd key={key} style={KBD_STYLE}>{inner}</kbd> },
  {
    re: /<span style="color:\s*(#[0-9a-fA-F]{3,6})\s*;?\s*">([\s\S]*?)<\/span>/i,
    innerIndex: 2,
    wrap: (inner, key, m) => (
      COLOURS.has(m[1].toLowerCase())
        ? <span key={key} style={{ color: m[1], fontWeight: 600 }}>{inner}</span>
        : <span key={key}>{inner}</span>
    ),
  },
];

// Tags outside the whitelist (or left unpaired) are noise, not content — drop
// them from plain segments rather than showing raw angle brackets to reception.
const STRAY_TAG = /<\/?(?:mark|u|kbd|span|strong|b|em|i|br|p|div)\b[^>]*>/gi;

export function renderInline(text, keyBase) {
  const out = [];
  let rest = text;
  let n = 0;
  while (rest) {
    let best = null;
    for (const p of PATTERNS) {
      const m = p.re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { p, m };
    }
    if (!best) { out.push(rest.replace(STRAY_TAG, '')); break; }
    const { p, m } = best;
    if (m.index > 0) out.push(rest.slice(0, m.index).replace(STRAY_TAG, ''));
    const key = keyBase + '-' + n;
    out.push(p.wrap(renderInline(m[p.innerIndex || 1], key), key, m));
    n++;
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

// The same text with all formatting removed — for clipboard copies, the
// save-to-guide prefill and the conversation history sent back to the model.
export function plainText(text) {
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(STRAY_TAG, '')
    .trim();
}

export default function Rich({ text }) {
  return <>{renderInline(String(text || ''), 'r')}</>;
}
