// What the working card shows while the Notebook is being read.
//
// The picker reads every page in one model call, so there is no "page 40 of
// 130" happening inside it to report. What CAN be reported honestly is this:
// a pass over every page, here, in code, for the words of the question —
// how many pages there are, which sections they sit in, and which of them
// mention what was asked. That is real work on the real Notebook, and it is
// what the card animates.
//
// DISPLAY ONLY. Nothing here feeds the picker, the router or the answer; a
// page this pass ranks first can lose to the page the model chooses, and the
// card says "mentions your words", not "the answer is here", for that reason.

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

// Every page, in section order, with the order kept so the card can draw one
// cell per page and light the ones that matched in the place they sit.
export function scanNotes(question, pages, { top = 6 } = {}) {
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
  const matches = [];
  if (terms.length) {
    list.forEach((row, index) => {
      const titleStems = new Set(wordsOf(row.page.docTitle).map(stem));
      const bodyStems = new Set(wordsOf(row.page.text).map(stem));
      const inTitle = terms.filter((t) => titleStems.has(t));
      const inBody = terms.filter((t) => !titleStems.has(t) && bodyStems.has(t));
      const score = inTitle.length * 3 + inBody.length;
      if (score) matches.push({ index, title: row.title, section: row.section, terms: inTitle.concat(inBody), score });
    });
    matches.sort((a, b) => b.score - a.score || a.index - b.index);
  }

  return {
    total: list.length,
    sections,
    terms,
    matched: matches.length,
    matches: matches.slice(0, top).map(({ score, ...m }) => m),
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

// The pages the picker or the router settled on, placed on the scan's grid.
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
