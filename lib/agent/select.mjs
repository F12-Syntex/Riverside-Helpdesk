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

// How many sources are worth showing the writer before an off-topic one is
// better than nothing. A page that shares not one word with the question is the
// raw material of an answer about something adjacent — correctly quoted, fluent,
// and about a question nobody asked. Held back once there is enough that does
// bear on the question, and kept below that, because a thin answer from a weak
// source still beats no answer at all.
const MIN_SOURCES = 3;

// Pure, and exported for tests: score every source against the question and put
// them in the order the writer should see them. `base` is the score before the
// Notebook bonus — it is zero exactly when the page covers none of the
// question's words, which is what selection needs to know.
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
      return { source, base, score: base + bonus };
    })
    .sort((a, b) => b.score - a.score);
}

// Which references the writer is shown. Returns the kept set and what was left
// out, so the turn can say plainly how much it trimmed.
export function selectSources(sources, question, { maxSources = MAX_SOURCES, maxChars = MAX_CHARS } = {}) {
  const ranked = rankSources(sources, question);
  // On topic first, then the rest. A research loop that fans out four wordings
  // brings back pages that matched a different one of them; those are not
  // evidence this question is missing, and putting them in front of the writer
  // is how "the practice's material does not cover this" turns into two
  // hundred confident words about the nearest thing that it does.
  const onTopic = ranked.filter((r) => r.base > 0);
  const offTopic = ranked.filter((r) => r.base <= 0);
  const kept = [];
  const dropped = [];
  let chars = 0;

  for (const { source, score, base } of onTopic.concat(offTopic)) {
    const size = String(source.text || '').length;
    // The single best source is always kept, however long it is: an answer with
    // no sources at all is worse than an expensive one.
    const full = kept.length >= maxSources || (kept.length > 0 && chars + size > maxChars);
    // …and an off-topic one only fills a gap the on-topic ones left.
    const spare = base <= 0 && kept.length >= MIN_SOURCES;
    if (full || spare) {
      dropped.push({ ref: source.ref, title: source.docTitle, score });
      continue;
    }
    kept.push(source.ref);
    chars += size;
  }

  return { refs: new Set(kept), kept, dropped, chars };
}
