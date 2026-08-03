// Choosing what the expensive model is allowed to read.
//
// The research phase is deliberately greedy: it searches several ways at once
// and keeps everything, because a search that finds nothing costs almost
// nothing. The writing phase is the opposite — it runs on the best model in the
// configuration, and every character it is given is paid for at that model's
// input rate.
//
// So the two are separated. Everything gathered stays in the evidence registry,
// which is what validation checks quotes against; only what actually bears on
// the question is put in front of the writer. A source that no search ranked
// against this question is not evidence the writer is missing — it is a page
// that happened to share a word with a different part of the conversation.
import { lexicalScore, terms } from './score.mjs';

// Generous by design. These bite only when a fan-out gathered far more than any
// answer could use; a normal question comes back under both and nothing is cut.
const MAX_SOURCES = 8;
const MAX_CHARS = 24_000;

// Pure, and exported for tests: score every source against the question and put
// them in the order the writer should see them.
export function rankSources(sources, question) {
  const want = terms(question);
  return sources
    .map((source) => {
      const base = lexicalScore(source.text, source.docTitle, want);
      // The Notebook is the practice's live working instruction and outranks a
      // formal document that merely mentions the same words. An EMIS guide is
      // the same sort of thing — a walkthrough written for one task — so it
      // outranks a policy that happens to name that task in passing.
      const bonus = source.kind === 'notebook' || source.kind === 'guide' ? 1.5 : 0;
      return { source, score: base + bonus };
    })
    .sort((a, b) => b.score - a.score);
}

// Which references the writer is shown. Returns the kept set and what was left
// out, so the turn can say plainly how much it trimmed.
export function selectSources(sources, question, { maxSources = MAX_SOURCES, maxChars = MAX_CHARS } = {}) {
  const ranked = rankSources(sources, question);
  const kept = [];
  const dropped = [];
  let chars = 0;

  for (const { source, score } of ranked) {
    const size = String(source.text || '').length;
    // The single best source is always kept, however long it is: an answer with
    // no sources at all is worse than an expensive one.
    const full = kept.length >= maxSources || (kept.length > 0 && chars + size > maxChars);
    if (full) {
      dropped.push({ ref: source.ref, title: source.docTitle, score });
      continue;
    }
    kept.push(source.ref);
    chars += size;
  }

  return { refs: new Set(kept), kept, dropped, chars };
}
