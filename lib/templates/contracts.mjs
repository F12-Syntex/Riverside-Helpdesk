// The contract-template card.
//
// "Which template do I use for the ADHD shared pathway?" is a question with an
// exact answer that nobody can hold in their head: PCIT name the contract one way
// and the EMIS template another, and there are forty-two of them.
//
// EVERY CARD LEADS WITH THE DATE, and that is the design rather than a caveat.
// The status column comes from a daily mobilisation bulletin which says of itself
// that the position "will change through the week". A build status presented as
// current, weeks after it was written, is worse than no status at all: it is fast,
// it looks authoritative, and it is wrong. So the subtitle carries the date, a
// status that is not "For Release" carries a warning to check with PCIT, and the
// support details are on the card so checking is one call rather than a hunt.
import { PRACTICE_AREAS, findContracts } from '../referrals/nel-contracts.mjs';
import { normalize, tokenize } from '../lookup/fuzzy.js';
import { answer, bullets, field, fields, note, table } from './blocks.mjs';
import { notebookPageAnswer } from './notebook.mjs';

function saidDate(iso) {
  const [y, m, d] = String(iso || '').split('-');
  if (!y || !m || !d) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

// A contract is often carried by several templates at once — a prescriber page, a
// non-prescriber page, a procedure, an alert. They are listed one per row rather
// than run together, because each one is separately a thing somebody opens.
const templateNote = (contract) => (
  (contract.templates || []).length > 1
    ? note('All of these carry part of the contract, so each one named needs filling in — the page in brackets is where it lives.', 'info')
    : null
);

// "TBC" and "N/A" are the table's words for "there isn't one", not template names
// to go looking for.
const NOT_A_TEMPLATE = new Set(['TBC', 'N/A']);
const realTemplates = (contract) => (contract.templates || []).filter((t) => !NOT_A_TEMPLATE.has(t));

/**
 * One row per template name, each copyable on its own.
 *
 * The name is what gets typed or searched for in EMIS, so it is offered exactly
 * as PCIT list it. Numbered only when there is more than one, so a single
 * template is not dressed up as a list of one.
 */
function templateFields(contract) {
  const names = realTemplates(contract);
  if (!names.length) {
    const said = (contract.templates || [])[0];
    return [field('Template', '', {
      missing: said === 'N/A' ? 'No template — see the note below'
        : said === 'TBC' ? 'Not decided yet — the specifications say TBC'
          : 'Not named in the NEL Local Contract Specifications',
    })];
  }
  return names.map((name, i) => field(names.length > 1 ? `Template ${i + 1}` : 'Template', name, { copy: true }));
}

function statusNote(contract, captured) {
  const on = saidDate(captured);
  // "N/A" is not a missing status. It is the table saying this contract is not
  // recorded through a template at all, and the comment beside it says what is
  // used instead — so there is nothing to check with PCIT.
  if (contract.status === 'N/A') {
    return note('This contract is not recorded through an EMIS template. What it uses instead is noted above.', 'info');
  }
  if (!contract.status) {
    return note(`The NEL Local Contract Specifications of ${on} record no build status for this one. Ask PCIT where it stands.`, 'warn');
  }
  if (contract.status === 'For Release') {
    return note(`Released as at ${on}. If it is not in EMIS, the practice’s sharing agreement may not be active yet.`, 'info');
  }
  return note(`As at ${on} this was **${contract.status}**, not released. Primary Care IT say the position changes through the week, so check with PCIT before telling anyone it is unavailable.`, 'warn');
}

const support = (s) => bullets([
  s?.email ? `Email ${s.email}` : null,
  s?.tel ? `Telephone ${s.tel}` : null,
  s?.portal ? `Support portal ${s.portal}` : null,
], 'Check the current position with PCIT');

// THE CARD NAMES THE DOCUMENT IT READ, IN THE DOCUMENT'S OWN WORDS. "PCIT NEL
// PCCIF Contract Mobilisation Sitrep" is where the table was published and is
// not something anybody at the desk would recognise; the NEL Local Contract
// Specifications is the thing they were looking at. Both are true, and the one
// that tells a reader what they are holding is the one on the card.
const contractSource = (captured) => [`NEL Local Contract Specifications (Primary Care IT), as at ${saidDate(captured)}`];

function contractCard(contract, result) {
  return answer({
    title: contract.specification,
    subtitle: `EMIS Web template — as at ${saidDate(result.capturedAt)}`,
    blocks: [
      fields([
        ...templateFields(contract),
        field('Status', contract.status || '', { missing: 'Not stated' }),
        field('Contract area', contract.area),
      ], 'On EMIS Web'),
      contract.comment ? note(contract.comment, 'info') : null,
      statusNote(contract, result.capturedAt),
      templateNote(contract),
      support(result.support),
    ],
    source: contractSource(result.capturedAt),
  });
}

/**
 * The templates on a row that the reader's words actually matched.
 *
 * A shortlist used to print every template of every contract, and that is a wall
 * of repeated text: "/template OneProcedure" answered with five contracts and
 * seventeen template names, four of them identical between two rows, with the
 * one word that was asked about buried somewhere inside each cell. The reader
 * has to find their own query in the answer.
 *
 * So the cell shows the template that matched and nothing else. Empty when the
 * match came from the contract's name instead, which the caller shows as a count.
 */
function matchedTemplates(contract, query) {
  const words = tokenize(query);
  if (!words.length) return [];
  // EVERY word, not any of them. "OneTemplate NonPrescriber" matching on "any"
  // returns the Prescriber and the Contract templates too, because they all
  // begin "OneTemplate" — which puts the wall of text straight back.
  return (contract.templates || []).filter((t) => {
    const hay = normalize(t);
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Several contracts it could be.
 *
 * The area is carried because two rows can be near-identical without it: the
 * Sitrep holds both "Phlebotomy" as a City & Hackney localisation and "NEL
 * Phlebotomy Service" NEL-wide, with the same four templates under each.
 */
function contractShortlistCard(result) {
  const rows = result.matches.map((c) => {
    const hit = matchedTemplates(c, result.query);
    const all = (c.templates || []).filter((t) => !NOT_A_TEMPLATE.has(t));
    return [
      c.specification,
      c.area.replace(/ (Specifications|Localisations)$/, ''),
      // Capped at two. A bare family name — "OneTemplate" — legitimately
      // matches three on one row, and three full names in a table cell is the
      // sprawl this column exists to stop.
      hit.length ? hit.slice(0, 2).join(', ') + (hit.length > 2 ? ` +${hit.length - 2}` : '')
        : all.length ? `${all.length} template${all.length === 1 ? '' : 's'}`
          : '—',
      c.status || 'Not stated',
    ];
  });
  // Did the query name a template rather than a contract? Then the column is
  // what matched; otherwise it is only ever a count, and saying "Template"
  // over a column of counts would be a lie.
  const named = result.matches.some((c) => matchedTemplates(c, result.query).length);
  return answer({
    title: `${result.query} — ${result.matches.length} contracts match`,
    subtitle: `EMIS Web templates — as at ${saidDate(result.capturedAt)}`,
    blocks: [
      note(named
        ? 'That template name is used by more than one contract. The column shows only the template that matched — open one to see the rest.'
        : 'More than one contract specification matches. Names and statuses are exactly as the NEL Local Contract Specifications record them.', 'info'),
      table(['Contract', 'Area', named ? 'Matched' : 'Templates', 'Status'], rows),
      support(result.support),
    ],
    source: contractSource(result.capturedAt),
  });
}

function contractElsewhereCard(result) {
  return answer({
    title: `${result.query} — another borough’s contract`,
    subtitle: `Not one of this practice’s — as at ${saidDate(result.capturedAt)}`,
    blocks: [
      note('The NEL Local Contract Specifications record this as a localisation for another North East London borough, so it is not part of this practice’s contract set.', 'warn'),
      table(['Contract', 'Area', 'Status'], result.elsewhere.map((c) => [
        c.specification, c.area, c.status || 'Not stated',
      ])),
      support(result.support),
    ],
    source: contractSource(result.capturedAt),
  });
}

/**
 * The NEL Local Contract Specifications record no contract by that name — said
 * outright.
 *
 * Only for /template, where the reader named the list they wanted searched. See
 * nelFormNotFound in referrals.mjs for why a command never falls through to a
 * model.
 */
export function contractNotFound(query, { pcit = [] } = {}) {
  const result = findContracts('');
  return answer({
    title: `${String(query || '').trim()} — no contract by that name`,
    subtitle: `Nothing matching in the NEL Local Contract Specifications of ${saidDate(result.capturedAt)}`,
    blocks: [
      // PRIMARY CARE IT DOCUMENT MORE THAN THEY ARE PAID FOR. The
      // specifications name the 42 contracts; PCIT's knowledge base documents
      // every template they build, plenty of which no contract on that list
      // pays for. "B12 injection" is the case in point — no contract covers it,
      // and PCIT publish a page called "Injection: B12 Template". These are
      // page titles carried back from a web search exactly as they came, shown
      // only when the document itself had nothing, and never presented as rows
      // of it.
      pcit.length
        ? bullets(pcit, 'Primary Care IT have pages about this, outside the contract list')
        : null,
      note('All forty-two rows of the NEL Local Contract Specifications were searched, by contract name and by template name, including the other boroughs’ localisations. Nothing else was searched: choosing Contract template means this document and no other.', 'info'),
      bullets([
        'This list covers the NEL contracts Primary Care IT build templates for — not every service the practice runs.',
        'A contract agreed since 28 July 2026 will not be on it. PCIT issue these updates as the mobilisation moves.',
      ]),
      support(result.support),
    ],
    source: contractSource(result.capturedAt),
  });
}

/**
 * The row that was REASONED to, rather than named.
 *
 * Same card as any other contract answer — the specification, its templates,
 * its status, its area, all copied off the document — with two things added at
 * the top, and they are the whole point:
 *
 *   - a line saying the question did not name a contract, that this row was
 *     chosen by what the words mean, and in one sentence why. A reader who is
 *     told how an answer was arrived at can judge it; a reader shown the same
 *     card as an exact match cannot.
 *   - which of that row's templates was picked, when one was, because a
 *     template has many pages and "it is somewhere in OneTemplate" is not an
 *     answer somebody can act on.
 *
 * The pages the reasoning read are named underneath. `confident` decides the
 * tone only: an inference is offered as one to check, never suppressed, because
 * the alternative on offer is a card that says nothing was found.
 */
export function contractReasonedAnswer({
  template = '', records = [], contract = null, why = '', confident = false, sources = [],
  areas = PRACTICE_AREAS,
} = {}) {
  if (!template) return null;
  const result = findContracts('', { areas });
  const rows = records.length ? records : (contract ? [contract] : []);
  // THE TEMPLATE IS THE ANSWER, so it is the title and the first copyable thing
  // on the card. What it records comes underneath as the reason to believe it: a
  // template that records the wound care service is the one a dressing goes on,
  // and showing that is how a reader checks the answer rather than trusting it.
  const lead = [
    confident
      ? 'This template was not named in the question. It is where a job like this is recorded.'
      : 'This template was not named in the question. It is the most likely one on the document for '
        + 'what you asked — a template holds many pages, so open it and check the entry is there '
        + 'before recording anything.',
    why,
  ].filter(Boolean).join(' ');
  return answer({
    title: template,
    subtitle: `EMIS Web template — most likely for what you asked, as at ${saidDate(result.capturedAt)}`,
    blocks: [
      note(lead, confident ? 'info' : 'warn'),
      fields([
        field('Template to open', template, { copy: true }),
        contract ? field('Recorded under', contract.specification) : null,
        contract ? field('Status', contract.status || '', { missing: 'Not stated' }) : null,
        contract ? field('Contract area', contract.area) : null,
      ].filter(Boolean), 'On EMIS Web'),
      rows.length > 1
        ? bullets(rows.map((c) => `${c.specification} — ${c.area}`), 'This template records')
        : null,
      contract ? statusNote(contract, result.capturedAt) : null,
      sources.length ? bullets(sources, 'What that was based on') : null,
      support(result.support),
    ].filter(Boolean),
    source: contractSource(result.capturedAt),
  });
}

/**
 * Does the practice's own Notebook cover this contract?
 *
 * THE ORDER MATTERS AND IT IS THE SAME ONE AS EVERYWHERE ELSE: the practice's
 * own written procedure outranks PCIT's row about it. They answer different
 * questions — the Notebook says how THIS practice runs the service, the Sitrep
 * says which EMIS template records it for the contract — and where the practice
 * has written something down, that is the more specific answer.
 *
 * Without this a contract question the practice had answered was met with a
 * template name and a build status from a bulletin dated 28 July, and on a miss
 * the turn fell through to a model told outright that it has no access to the
 * practice's material.
 *
 * Matched on the page title only, and only on a whole word, because a contract
 * name appearing in the body of an unrelated page is not that page's subject.
 *
 * Reached only when a caller passes pages, which the ROUTER does and the
 * /template command deliberately does not: a reader who names the document they
 * want searched has not asked what the practice wrote about the service. See
 * lib/templates/lookup-command.mjs.
 */
function notebookPageFor(name, pages = []) {
  const words = String(name || '').toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  if (!words.length) return null;
  let best = null;
  let bestHits = 0;
  for (const page of pages) {
    const title = String(page?.docTitle || '').toLowerCase();
    if (!title) continue;
    const hits = words.filter((w) => new RegExp(`\\b${w}`).test(title)).length;
    // Most of what was asked for has to be in the title, not just one word of it.
    if (hits > bestHits && hits >= Math.ceil(words.length * 0.6)) { best = page; bestHits = hits; }
  }
  return best;
}

/**
 * The contract-template answer for a name, or null when the specifications have
 * nothing
 * for it — which is the caller's signal to answer some other way.
 */
export function contractTemplateAnswer(name, { areas = PRACTICE_AREAS, pages = [] } = {}) {
  const practice = notebookPageFor(name, pages);
  if (practice) return notebookPageAnswer({ pages: [practice.docTitle], all: pages });
  const asked = String(name || '').trim();
  if (!asked) return null;
  const result = findContracts(asked, { areas });
  if (result.confident) return contractCard(result.matches[0], result);
  if (result.matches.length) return contractShortlistCard(result);
  if (result.elsewhere.length) return contractElsewhereCard(result);
  return null;
}
