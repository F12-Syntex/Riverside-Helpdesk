// What is ON each EMIS OneTemplate, searched by page.
//
// THE QUESTION THE CONTRACT LIST CANNOT ANSWER. The Sitrep table
// (nel-contracts.mjs) maps a commissioned NEL contract to the template that
// records it, and that is all it holds. So "which template records the ADHD
// shared pathway" was answered and "which template do I use for a firearms
// request" was not — a firearms request is not a commissioned service and
// appears nowhere in that table, while being exactly the kind of thing somebody
// at the desk needs the template for. Most of a day's work is like that.
//
// Primary Care IT's four OneTemplate page specifications are the other half:
// per launcher, the pages each template carries, and — in the admin and nursing
// documents — a line saying what each page is for. This searches them.
//
// THE SAME RULES AS THE OTHER TWO LISTS, DELIBERATELY. Same fuzzy index, same
// asked-for trimming (ask.mjs), same "one clear winner or a shortlist" bar. A
// reader should not have to learn that one of the three lookups behaves
// differently from the others, and a page name is the same kind of short
// published string as a form name or a contract name.
//
// A PAGE IS NOT A CONTRACT AND THE CARD MUST NOT BLUR THEM. This says where in
// EMIS something is recorded. It says nothing about whether the work is
// commissioned, by whom, or how far PCIT have got building it — that is the
// Sitrep's business, and it carries a date for the reason set out there.
import DATA from './one-templates.data.json' with { type: 'json' };
import { buildIndex, fuzzySearch, tokenize } from '../lookup/fuzzy.js';
import { askedFor } from './ask.mjs';
import { namedOutright } from './nel-tree.mjs';

/** The dataset. */
export function oneTemplates() {
  return DATA;
}

// The bar rises with the number of words that name something, exactly as it
// does for the contracts. See lib/referrals/ask.mjs.
const floorFor = (query) => 50 * Math.max(1, tokenize(askedFor(query)).length);

/** Every page of every template, flattened, each carrying its template. */
export function templatePages(data = null) {
  const all = data || oneTemplates();
  const rows = [];
  for (const template of all.templates) {
    for (const page of template.pages) {
      rows.push({
        page: page.name,
        detail: page.detail,
        heading: page.heading,
        group: page.group,
        template: template.name,
        launcher: template.launcher,
        audience: template.audience,
        documents: page.documents || [],
      });
    }
  }
  return rows;
}

/** The searchable index over those pages. */
export function buildPageIndex(rows = []) {
  return buildIndex(rows.map((row) => ({
    label: row.page,
    // The template's own name is an alias of every page on it, so "what is on
    // OneTemplate Admin" finds its pages rather than nothing, and a page named
    // for its template still resolves. The group is an alias for the same
    // reason: "long-term conditions" is how the reader would say it.
    aliases: [row.template, row.heading, row.group].filter(Boolean),
    category: row.template,
    row,
  })));
}

/** Pages ranked against a query, noise removed. */
export function rankPages(index, query, limit = 6) {
  const floor = floorFor(query);
  const hits = fuzzySearch(index, askedFor(query), limit * 3).filter(({ score }) => score >= floor);
  if (!hits.length) return [];
  const cut = hits[0].score * 0.33;
  return hits
    .filter(({ score }) => score >= cut)
    .slice(0, limit)
    .map(({ entry, score }) => ({ ...entry.row, score }));
}

/**
 * One clear winner, or a shortlist?
 *
 * The same rule as the other two lists, with one addition they do not need: a
 * page name repeats across templates — "Vaccinations" is on four of them, "Mental
 * Health" on three — so several matches that are the SAME page on different
 * templates are still one answer, and the card says which templates carry it.
 */
export function isConfident(matches, query) {
  if (!matches.length) return false;
  if (matches.length === 1) return true;
  if (namedOutright(matches[0].page, query)) return true;
  return matches[0].score >= matches[1].score * 1.35;
}

const same = (a, b) => String(a || '').toLowerCase().trim() === String(b || '').toLowerCase().trim();

/**
 * Find the page(s) for what was asked.
 *
 * @returns {{
 *   query: string, matches: Array, alsoOn: Array, confident: boolean,
 *   capturedAt: string, source: string, documents: Array
 * }}
 */
export function findTemplatePages(query, { limit = 6, data = null } = {}) {
  const all = data || oneTemplates();
  const asked = String(query || '').trim();
  const empty = {
    query: asked,
    matches: [],
    alsoOn: [],
    confident: false,
    capturedAt: all.capturedAt,
    source: all.source,
    documents: all.documents,
  };
  if (!asked) return empty;

  const ranked = rankPages(buildPageIndex(templatePages(all)), asked, limit);
  if (!ranked.length) return empty;

  // The same page on other templates, pulled out of the shortlist: they are one
  // answer with several launchers, not several answers.
  const top = ranked[0];
  const alsoOn = ranked.filter((r) => r !== top && same(r.page, top.page));
  const matches = ranked.filter((r) => r === top || !same(r.page, top.page));
  return { ...empty, matches, alsoOn, confident: isConfident(matches, asked) };
}

/**
 * Where a page sits on a template, for a caller that already has both names —
 * the contract list hands over "OneTemplate NonPrescriber (Treatment Room
 * page)", and the reader still has to be told where Treatment Room is and what
 * is on it.
 *
 * Returns null when this template, or this page of it, is not in the page
 * specifications: a card must be able to say nothing rather than guess.
 */
export function pageOnTemplate(templateName, pageName, { data = null } = {}) {
  const template = templateByName(templateName, { data });
  const wanted = String(pageName || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!template || !wanted) return null;
  const flat = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const page = template.pages.find((p) => flat(p.name) === flat(wanted) && !p.heading)
    || template.pages.find((p) => flat(p.name) === flat(wanted));
  if (!page) return null;
  return {
    template: template.name,
    launcher: template.launcher,
    page: page.name,
    heading: page.heading || '',
    detail: page.detail || '',
    // What is ON that page, in the document's order. This is the part a reader
    // opening the template actually needs: the page name gets them to the tab,
    // the entries tell them the thing they came to record is really there.
    entries: template.pages.filter((p) => p.heading && p.heading === page.name).map((p) => p.name),
  };
}

/** A template by name, for a reader who names one. Null when there is no such template. */
export function templateByName(name, { data = null } = {}) {
  const all = data || oneTemplates();
  const asked = String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!asked) return null;
  const flat = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
  return all.templates.find((t) => flat(t.name) === flat(asked))
    || all.templates.find((t) => flat(t.name) === flat(asked.replace(/\s*\(.*$/, '')))
    || null;
}
