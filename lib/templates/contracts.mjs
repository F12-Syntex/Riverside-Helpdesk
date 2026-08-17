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

function saidDate(iso) {
  const [y, m, d] = String(iso || '').split('-');
  if (!y || !m || !d) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

// The templates cell holds several names run together, because the table wraps
// them with no separator that a name could not itself contain. Splitting them
// apart would be a guess, so they are shown as one string and the reader is told
// it may name more than one.
const templateNote = (contract) => (
  /OneTemplate|OneProcedure|Alert:|Searches:|template/i.test(contract.templates)
    ? note('Where more than one template is named, all of them carry part of the contract — check each page named in brackets.', 'info')
    : null
);

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
        contract.templates && contract.templates !== 'N/A'
          ? field('Template', contract.templates, { copy: true })
          : field('Template', '', { missing: contract.templates === 'N/A' ? 'No template — see the note below' : 'Not named in the Sitrep' }),
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
        c.specification, c.templates || '—', c.status || 'Not stated',
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
 * The contract-template answer for a name, or null when the Sitrep has nothing
 * for it — which is the caller's signal to answer some other way.
 */
export function contractTemplateAnswer(name, { areas = PRACTICE_AREAS } = {}) {
  const asked = String(name || '').trim();
  if (!asked) return null;
  const result = findContracts(asked, { areas });
  if (result.confident) return contractCard(result.matches[0], result);
  if (result.matches.length) return contractShortlistCard(result);
  if (result.elsewhere.length) return contractElsewhereCard(result);
  return null;
}
