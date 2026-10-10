// What the working card shows while the Notebook is being read.
//
// The card draws the Notebook as one cell per page, in its sections, and
// lights the pages this turn's shortlist put in front of the model
// (lib/search/notebook.mjs): the pages search ranked as likeliest to answer,
// which the model reads in full, while every other page reaches it by title
// only. That is real work on the real Notebook, and it is what the card
// animates.
//
// DISPLAY ONLY. Nothing here feeds the picker or the answer — the shortlist
// does that directly. The model can still name a page outside the shortlist
// from the titles list, so a lit page is "shortlisted", never "the answer".

const STOP = new Set(('the and for with what how who where when why which that this from have has '
  + 'can could would should will does did are was were been being into onto about there their them '
  + 'they you your our its not but all any per via out get got need needs want wants please '
  + 'tell give find know patient patients someone somebody').split(' '));

const stem = (word) => {
  const w = word.replace(/(ings|ing|ies|ed|es|s)$/, '');
  return w.length >= 3 ? w : word;
};

const wordsOf = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// The question's own words, as stems: three letters or more, not the glue.
// What the card quotes as "looking for"; search itself is handed the whole
// message (lib/search/query.mjs), stop words and all.
export function scanTerms(question) {
  const out = [];
  for (const word of wordsOf(question)) {
    if (word.length < 3 || STOP.has(word)) continue;
    const s = stem(word);
    if (!out.includes(s)) out.push(s);
  }
  return out.slice(0, 12);
}

const sectionOf = (page) => (Array.isArray(page.path) && page.path.length > 1 ? page.path[0] : 'Notebook');
const titleOf = (page) => (Array.isArray(page.path) && page.path.length
  ? page.path[page.path.length - 1]
  : String(page.docTitle || '').replace(/^Notebook:\s*/, ''));
const bare = (title) => String(title || '').replace(/^Notebook:\s*/, '').trim().toLowerCase();

/**
 * The shortlist, placed on a grid of every page.
 *
 * Every page, in section order, with the order kept so the card can draw one
 * cell per page and light the shortlisted ones where they sit. `matches` are
 * the shortlisted pages in the shortlist's own order — best first — and
 * `matched` is how many there are.
 *
 * A WHOLE-NOTEBOOK SHORTLIST LIGHTS NOTHING. When search could not narrow it
 * down (no words to search with, search down, nothing found) every page goes
 * to the model, so `matched` is the total and no page is singled out.
 */
export function scanShortlist(shortlist, pages, { question = '', top = 6 } = {}) {
  const list = (Array.isArray(pages) ? pages : [])
    .map((page) => ({ page, section: sectionOf(page), title: titleOf(page) }))
    .sort((a, b) => a.section.localeCompare(b.section) || a.title.localeCompare(b.title));

  const sections = [];
  for (const row of list) {
    const last = sections[sections.length - 1];
    if (last && last.name === row.section) last.count += 1;
    else sections.push({ name: row.section, count: 1 });
  }

  const terms = scanTerms(question);
  const at = new Map(list.map((row, index) => [row.page.docId, index]));
  const shortlisted = shortlist && !shortlist.full ? shortlist.pages || [] : [];
  const matches = [];
  for (const page of shortlisted) {
    const index = at.get(page.docId);
    if (index === undefined) continue;
    const row = list[index];
    // Which of the question's words the page uses, for the card. A page the
    // semantic arm found in other words, or one edited in the last hour, may
    // use none of them.
    const own = new Set(wordsOf(row.page.docTitle).concat(wordsOf(row.page.text)).map(stem));
    matches.push({ index, title: row.title, section: row.section, terms: terms.filter((t) => own.has(t)) });
  }

  return {
    total: list.length,
    sections,
    terms,
    matched: shortlist && shortlist.full ? list.length : matches.length,
    matches: matches.slice(0, top),
    // Server-side only (not sent): place a chosen page on the same grid. The
    // picker copies a title from the prompt — the full "Notebook: A / B" or,
    // now and then, only the page's own name — so both are tried.
    find: (title) => {
      const want = bare(title);
      if (!want) return -1;
      const full = list.findIndex((row) => bare(row.page.docTitle) === want);
      return full >= 0 ? full : list.findIndex((row) => row.title.trim().toLowerCase() === want);
    },
    rowAt: (index) => list[index],
  };
}

// What goes on the wire: the scan without its server-side helpers.
export function scanEvent(scan) {
  const { find, rowAt, ...wire } = scan;
  return { type: 'progress', stage: 'notes', ...wire };
}

// The pages the picker settled on, placed on the scan's grid.
export function chosenOnScan(scan, titles) {
  if (!scan) return [];
  const out = [];
  for (const title of Array.isArray(titles) ? titles : []) {
    const index = scan.find(title);
    if (index < 0 || out.some((c) => c.index === index)) continue;
    const row = scan.rowAt(index);
    out.push({ index, title: row.title, section: row.section });
  }
  return out;
}
