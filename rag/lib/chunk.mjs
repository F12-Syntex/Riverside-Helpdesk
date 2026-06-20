// Turning cleaned text into retrieval-sized chunks, plus small id/token helpers.
// One chunking strategy for every source type keeps the data standard uniform.
import crypto from 'node:crypto';

export function estTokens(text) {
  return Math.ceil((text || '').length / 4);
}

// Content-addressing: a stable fingerprint of a chunk's *meaning-bearing* text,
// so the same passage appearing in several documents shares a single embedding
// instead of bloating the index. Normalised (lowercased, whitespace collapsed)
// so trivial formatting differences fold together — but nothing semantic is
// guessed at; only text that is identical after normalisation is merged.
export function normalizeForHash(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function contentHashOf(text) {
  return crypto.createHash('sha256').update(normalizeForHash(text)).digest('hex');
}

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'doc';
}

export function makeChunkId(docId, idx) {
  return `${docId}__c${idx}`;
}

function overlapTail(s, n) {
  if (!s || n <= 0) return '';
  const t = s.slice(-n);
  const sp = t.indexOf(' ');
  return (sp > 0 ? t.slice(sp + 1) : t) + '\n\n';
}

// Split on paragraph boundaries into ~maxTokens windows with a little overlap so
// context isn't lost at the seams. Over-long paragraphs are split by sentence.
export function chunkText(text, { maxTokens = 320, overlap = 50 } = {}) {
  const clean = (text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  const maxChars = maxTokens * 4;
  const overlapChars = overlap * 4;
  const paras = clean.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let buf = '';
  const flush = () => { if (buf.trim()) chunks.push(buf.trim()); };

  for (const p of paras) {
    if (p.length > maxChars) {
      flush();
      buf = '';
      let sb = '';
      for (const seg of p.split(/(?<=[.!?])\s+/)) {
        if ((sb + ' ' + seg).length > maxChars) { if (sb) chunks.push(sb.trim()); sb = seg; }
        else sb = sb ? sb + ' ' + seg : seg;
      }
      if (sb) chunks.push(sb.trim());
      continue;
    }
    if ((buf + '\n\n' + p).length > maxChars) { flush(); buf = overlapTail(buf, overlapChars) + p; }
    else buf = buf ? buf + '\n\n' + p : p;
  }
  flush();
  return chunks;
}
