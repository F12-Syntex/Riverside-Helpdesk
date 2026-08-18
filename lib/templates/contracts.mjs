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
        : said === 'TBC' ? 'Not decided yet — the Sitrep says TBC'
          : 'Not named in the Sitrep',
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
    return note(`The Sitrep of ${on} records no build status for this one. Ask PCIT where it stands.`, 'warn');
  }
  if (contract.status === 'For Release') {
    return note(`Released as at ${on}. If it is not in EMIS, the practice’s sharing agreement may not be active yet.`, 'info');
  }
  return note(`As at ${on} this was **${contract.status}**, not released. The Sitrep says the position changes through the week, so check with PCIT before telling anyone it is unavailable.`, 'warn');
}

const support = (s) => bullets([
  s?.email ? `Email ${s.email}` : null,
  s?.tel ? `Telephone ${s.tel}` : null,
  s?.portal ? `Support portal ${s.portal}` : null,
], 'Check the current position with PCIT');

const contractSource = (captured) => [`PCIT NEL PCCIF Contract Mobilisation Sitrep, ${saidDate(captured)}`];

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

function contractShortlistCard(result) {
  return answer({
    title: `${result.query} — ${result.matches.length} contracts match`,
    subtitle: `EMIS Web templates — as at ${saidDate(result.capturedAt)}`,
    blocks: [
      note('More than one contract specification matches. Names and statuses are exactly as the Sitrep records them.', 'info'),
      table(['Contract', 'Template', 'Status'], result.matches.map((c) => [
        c.specification, (c.templates || []).join(', ') || '—', c.status || 'Not stated',
      ])),
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
      note('The Sitrep records this as a localisation for another North East London borough, so it is not part of this practice’s contract set.', 'warn'),
      table(['Contract', 'Area', 'Status'], result.elsewhere.map((c) => [
        c.specification, c.area, c.status || 'Not stated',
      ])),
      support(result.support),
    ],
    source: contractSource(result.capturedAt),
  });
}

/**
 * The Sitrep records no contract by that name — said outright.
 *
 * Only for /template, where the reader named the list they wanted searched. See
 * nelFormNotFound in referrals.mjs for why a command never falls through to a
 * model.
 */
export function contractNotFound(query) {
  const result = findContracts('');
  return answer({
    title: `${String(query || '').trim()} — no contract by that name`,
    subtitle: `Nothing matching in the Sitrep of ${saidDate(result.capturedAt)}`,
    blocks: [
      note('All forty-two contract specifications were searched, by contract name and by template name, including the other boroughs’ localisations.', 'info'),
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
 * The contract-template answer for a name, or null when the Sitrep has nothing
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
