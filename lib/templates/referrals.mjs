// The NEL Referral Tree answers, for the Referral form mode (/form).
//
// Primary Care IT publish one document listing every referral form in North
// East London and which areas can see each one — the "NEL Referral Tree
// introduction & document list (EMIS Web)". The cards below are built from it
// (lib/referrals/nel-tree.mjs) and from nothing else: no Notebook page, no
// model. lib/templates/lookup-command.mjs is what assembles the /form answer
// out of them.
//
// How THIS practice sends a referral — e-RS or email, the speciality and the
// clinic type — is the practice's own Notebook, answered on the Referrals page
// and in ordinary Q&A, not here.
import { answer, bullets, field, fields, note, steps, table } from './blocks.mjs';
import { PRACTICE_AREA, areaNamesFor, findReferralForms } from '../referrals/nel-tree.mjs';

/* ------------------------------------------- the NEL Referral Tree (PCIT) */

// "2026-06-18" as the reader would say it. The list's own date, and it goes on
// every card built from it: a form list eight weeks old is usually still right
// and the reader is entitled to know it is eight weeks old.
function saidDate(iso) {
  const [y, m, d] = String(iso || '').split('-');
  if (!y || !m || !d) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

// What is true of the tree however the question went, said once. The first is
// PCIT's own instruction to practices; the second is theirs too, and it is the
// reason this application never sends them anything.
const treeNotes = (captured) => [
  note(`The form list is Primary Care IT’s, as it stood on ${saidDate(captured)}. If the practice holds a newer version of a form, raise a support ticket with PCIT so they can update it.`, 'info'),
];

// THE CARD NAMES THE DOCUMENT IT READ, IN THE DOCUMENT'S OWN WORDS: "NEL
// Referral Tree introduction & document list (EMIS Web)" is what Primary Care IT
// call the article this list came out of, and naming it in full is what lets a
// reader check the answer against the thing on their screen.
const treeSource = (captured) => [`NEL Referral Tree introduction & document list (EMIS Web) — Primary Care IT, as at ${saidDate(captured)}`];

/**
 * One form, named.
 *
 * The name is the answer and it is copyable, because it is a string somebody
 * retypes into the tree's Ctrl+F box — and a form name retyped from memory is a
 * form name spelled nearly right, which finds nothing.
 */
function nelFormCard(form, result, { tentative = false } = {}) {
  const areas = areaNamesFor(form);
  const everywhere = areas.length === 5;
  return answer({
    title: form.name,
    subtitle: tentative
      ? `The closest match on the NEL Referral Tree — ${form.category}`
      : `On the NEL Referral Tree — ${form.category}`,
    blocks: [
      // A WEAK MATCH IS SAID TO BE ONE. Being the only form left standing after
      // the ranking is not the same as being the right one, and a card that did
      // not distinguish the two is how "bloods" came back as a copyable "24 Hour
      // Blood Pressure Monitoring Request Form", and "derm" as "Derman Referral
      // Form" — which is a community organisation, not dermatology.
      tentative
        ? note(`Nothing on the tree matches “${result.query}” closely. This is the nearest name to it — read it before using it, and if it is not the one, try the words the form itself would use.`, 'warn')
        : null,
      fields([
        field('Form', form.name, { copy: true }),
        field('Category', form.category),
      ], 'Find it on the Referral Tree'),
      note(everywhere
        ? 'Listed for all five North East London areas, so it is on this practice’s tree.'
        : `Listed for ${areas.join(', ')}, so it is on this practice’s tree.`, 'info'),
      steps(result.opening),
      // THE TREE IS NOT THE ONLY ROUTE, and this card cannot see the other one.
      // The practice sends a dozen referrals by email instead, with its own form
      // and its own address, and asking by name rather than by command is what
      // reads its notes. Said on every card that FOUND something, because that
      // is when a reader is about to act on it — it used to be said only when
      // the tree found nothing, which is the one time it does not matter.
      note('The practice sends some referrals by email instead, with its own form and address. If this one might be one of them, ask again without the command and the practice’s own notes are checked first.', 'info'),
      ...treeNotes(result.capturedAt),
    ],
    source: treeSource(result.capturedAt),
  });
}

/**
 * Several forms it could be.
 *
 * Shown as a list rather than resolved to one. "Dermatology" really is three
 * forms on this practice's tree and picking one of them for the reader is a
 * guess wearing a card's clothes.
 */
function nelShortlistCard(result) {
  return answer({
    title: `${result.query} — ${result.matches.length} forms on the Referral Tree`,
    subtitle: `Listed for ${result.areaName}`,
    blocks: [
      note('More than one form matches. The names below are exactly as the Referral Tree lists them.', 'info'),
      table(['Form', 'Category'], result.matches.map((f) => [f.name, f.category])),
      steps(result.opening),
      ...treeNotes(result.capturedAt),
    ],
    source: treeSource(result.capturedAt),
  });
}

/**
 * The form exists in North East London, but not on this practice's tree.
 *
 * Worth a card of its own. The tree only shows a form ticked for your own area,
 * so the alternative to this answer is somebody scrolling a menu for a button
 * that was never going to be there.
 */
function nelElsewhereCard(result) {
  return answer({
    title: `${result.query} — not on this practice’s Referral Tree`,
    subtitle: `Nothing listed for ${result.areaName}`,
    blocks: [
      // SOME ROWS CARRY NO TICK AT ALL. The document says a form is on your tree
      // when it is ticked for your area, so an unticked row says nothing about
      // anybody — and claiming it belongs to another borough is an assertion the
      // document does not make. "Dementia Memory Referral Form" is one of five.
      note(result.elsewhere.every((f) => !(f.areas || []).length)
        ? `The Referral Tree lists ${result.elsewhere.length === 1 ? 'this form' : 'these forms'} without saying which areas can see ${result.elsewhere.length === 1 ? 'it' : 'them'}, so whether ${result.elsewhere.length === 1 ? 'it is' : 'they are'} on this practice’s tree is not recorded either way.`
        : `The Referral Tree lists ${result.elsewhere.length === 1 ? 'a form' : 'forms'} by this name for other North East London areas, so ${result.elsewhere.length === 1 ? 'it is' : 'they are'} not ticked for this practice.`, 'warn'),
      table(['Form', 'Listed for'], result.elsewhere.map((f) => [
        f.name,
        (f.areas || []).length ? areaNamesFor(f).join(', ') : 'Not stated',
      ])),
      bullets([
        'If the patient needs this service, ask the secretaries which route the practice uses.',
        'If it should be on our tree, raise a support ticket with Primary Care IT.',
      ]),
      ...treeNotes(result.capturedAt),
    ],
    source: treeSource(result.capturedAt),
  });
}

/**
 * The tree has no form by that name — said outright.
 *
 * Only for /form, where the reader named the list they wanted searched. On the
 * ordinary routed path a miss returns null and something else answers; here
 * there is nothing else, and a model writing prose about a form nobody can find
 * is the failure the command exists to prevent.
 */
export function nelFormNotFound(query, { area = PRACTICE_AREA } = {}) {
  const result = findReferralForms('', { area });
  return answer({
    title: `${String(query || '').trim()} — no form by that name`,
    subtitle: `Nothing matching on the NEL Referral Tree for ${result.areaName}`,
    blocks: [
      note('The whole of the NEL Referral Tree introduction & document list (EMIS Web) was searched, including the forms listed for other North East London areas. Nothing came close enough to name. Nothing else was searched: choosing Referral form means this document and no other.', 'info'),
      bullets([
        'Try the words the form itself would use — the service or the condition, not the task ("dexa", "tongue tie", "suspected skin cancer").',
        'If it is a referral the practice sends by email rather than a tree form, ask in ordinary words instead of choosing Referral form — that path reads the practice’s own notes as well.',
        'If the form should be there, raise a support ticket with Primary Care IT.',
      ]),
      ...treeNotes(result.capturedAt),
    ],
    source: treeSource(result.capturedAt),
  });
}

/**
 * The referral-form answer for a name, or null when the tree has nothing for it.
 *
 * Null matters: it is what lets the caller fall through to the "no form by
 * that name" card (nelFormNotFound) rather than showing an empty list. Nothing
 * here calls a model.
 */
export function nelReferralFormAnswer(name, { area = PRACTICE_AREA } = {}) {
  const asked = String(name || '').trim();
  if (!asked) return null;
  const result = findReferralForms(asked, { area });
  if (result.confident) return nelFormCard(result.matches[0], result);
  // One match that did not clear the strength bar: shown, because it is still
  // the closest thing on the tree, but said to be a guess at the name.
  if (result.tentative) return nelFormCard(result.matches[0], result, { tentative: true });
  if (result.matches.length) return nelShortlistCard(result);
  if (result.elsewhere.length) return nelElsewhereCard(result);
  return null;
}
