// The evidence a single agent turn has actually gathered.
//
// Every tool the agent runs deposits what it found here, and nothing else is
// allowed to become a source. The registry hands out stable reference labels
// ("P1" for a practice passage, "W1" for a web result) which the model must
// quote back when it writes the answer — that is what makes the validation
// pass possible: a section claiming P3 is checked against the actual text of
// P3, and a section claiming a web page is checked against a URL a search
// really returned. Anything that does not resolve here is not evidence.
import { normForMatch, quoteContainment } from '../ai/quote-match.js';

// A quote shorter than this cannot verify anything — it would match by
// accident. Same threshold the single-shot pipeline used.
const MIN_QUOTE = 12;
// A quote is accepted as backing a passage at this containment, and shown to
// the reader as a verbatim quotation only at full containment.
const MIN_CONTAINMENT = 0.5;
// How much of a web source is kept: a search snippet is a couple of sentences
// and stays that; a page the agent went and read is kept at length, because the
// point of reading it was that the snippet did not say enough.
const WEB_SNIPPET = 600;
const WEB_PAGE = 5_000;

function chunkKey(chunk) {
  return String(chunk.id || `${chunk.docId || ''}:${chunk.section || ''}`);
}

export function createEvidence() {
  const practice = new Map(); // ref -> chunk
  const practiceByKey = new Map(); // chunk key -> ref
  const web = new Map(); // ref -> { title, url, snippet }
  const webByUrl = new Map(); // url -> ref

  function addPractice(chunk) {
    if (!chunk || !String(chunk.text || '').trim()) return null;
    const key = chunkKey(chunk);
    if (practiceByKey.has(key)) return practiceByKey.get(key);
    const ref = 'P' + (practice.size + 1);
    practice.set(ref, { ...chunk, id: key, ref });
    practiceByKey.set(key, ref);
    return ref;
  }

  // A web source, from a search result or from the page itself.
  //
  // `full` marks the second of those: the page was fetched and read rather than
  // summarised by a search engine, so far more of it is kept. A page first seen
  // as a snippet and later read properly keeps its reference and has its text
  // upgraded — the model already cited W2, and W2 must now be the whole of what
  // was read, not the two sentences the search returned.
  function addWeb(result) {
    const url = String(result?.url || '').trim();
    if (!url) return null;
    const limit = result.full ? WEB_PAGE : WEB_SNIPPET;
    const snippet = String(result.snippet || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, limit);
    const known = webByUrl.get(url);
    if (known) {
      const held = web.get(known);
      if (held && snippet.length > String(held.snippet || '').length) held.snippet = snippet;
      return known;
    }
    const ref = 'W' + (web.size + 1);
    web.set(ref, {
      ref,
      url,
      title: String(result.title || url).trim(),
      snippet,
    });
    webByUrl.set(url, ref);
    return ref;
  }

  // Find the practice passage a quote actually came from. The model's claimed
  // ref only breaks ties: if it quoted P2 but the words live in P5, the answer
  // is still grounded — it is the quote that is checked, not the label.
  function verifyPractice(quote, claimedRef = '') {
    const quoteN = normForMatch(quote);
    if (quoteN.length < MIN_QUOTE) return null;
    let best = null;
    let bestScore = 0;
    for (const [ref, chunk] of practice) {
      const score = quoteContainment(quoteN, normForMatch(chunk.text)) + (ref === claimedRef ? 0.001 : 0);
      if (score > bestScore) { bestScore = score; best = chunk; }
    }
    if (!best || bestScore < MIN_CONTAINMENT) return null;
    return { chunk: best, ref: best.ref, exact: quoteContainment(quoteN, normForMatch(best.text)) >= 1 };
  }

  function getWeb(ref) {
    return web.get(String(ref || '').trim().toUpperCase()) || null;
  }

  return {
    addPractice,
    addWeb,
    verifyPractice,
    getWeb,
    practiceList: () => Array.from(practice.values()),
    webList: () => Array.from(web.values()),
    get practiceCount() { return practice.size; },
    get webCount() { return web.size; },
  };
}
