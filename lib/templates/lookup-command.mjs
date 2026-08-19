// The two list commands, each with the other list behind it.
//
// WHY THIS MODULE EXISTS AT ALL. /form searches Primary Care IT's referral tree
// and /template searches Primary Care IT's contract list, and a reader at the
// desk does not know which of those two lists the words in their head belong
// to. "Retinal screening template" was answered "no contract by that name",
// which was true and useless: the referral tree has "NEL diabetes retinal-eye
// screening", and that is plainly what was wanted. The command says which list
// to search FIRST — it does not say which list to refuse to search.
//
// IT IS STILL A LOOKUP, AND STILL NEVER PROSE. Crossing over reaches the other
// published list, not a model: every name on either card is a string out of a
// file in this repository, and a query neither list has still ends at the card
// that says so. What changes is only which of the two "nothing found" cards a
// reader has to read before the answer that was there all along.
//
// THE CARD SAYS WHICH LIST ANSWERED. A form is not a contract: one is a thing to
// open in EMIS and fill in, the other is the template that records work the
// practice is paid for. A crossed answer leads with a line naming the list it
// came from, so nobody copies a template name into a referral.
//
// THE OTHER LIST COMES BEFORE ANOTHER BOROUGH'S ROW. Both lists carry rows this
// practice cannot use — a Tower Hamlets form, a Newham localisation — and both
// name them rather than hiding them, because "that one is Tower Hamlets" stops
// somebody hunting a menu. But a row of OUR OWN on the other list beats a row of
// somebody else's on this one: "/form phlebotomy" now answers with City &
// Hackney's phlebotomy contract before it mentions Waltham Forest's form.
//
// A COMMAND ANSWERS FROM ITS TWO DOCUMENTS AND FROM NOTHING ELSE. /template
// answers from PCIT's contract Sitrep — "NEL PCCIF Contract Mobilisation,
// Previous Day Sitrep", 42 specifications captured on 28 July 2026, in
// lib/referrals/nel-contracts.data.json — and, on a miss, from the referral
// tree. It does NOT read the Notebook, and it used to: a page the practice
// wrote about diabetic eye screening came back under "Template", headed "From
// the Notebook", for a question asking which EMIS template records a contract.
// The practice's own material outranking a published list is the right rule on
// the ROUTED path, where the assistant decided what the question was; it is the
// wrong rule when the reader has just named the document they want searched.
// That step stays in contractTemplateAnswer, which the router calls with pages;
// this door calls it without them.
//
// /form KEEPS ONE PRACTICE PAGE, and only one shape of it: the emailed-referrals
// page, matched by findEmailedReferral, which needs a page that mentions
// referrals AND email AND carries a bullet list. That is not the Notebook
// answering a form question — it is this practice's own referral process, which
// is what /form was asked about, and without it the command is the one path
// that can talk somebody out of it: "district nurse" is Islington's service on
// the tree and RP ACN 2022 here.
//
// IT LIVES HERE RATHER THAN IN EITHER MODULE because referrals.mjs and
// contracts.mjs would otherwise have to import each other, and a cycle between
// two modules that both render cards is the kind of thing that works until the
// bundler changes its mind.
import { note } from './blocks.mjs';
import {
  emailReferral, findEmailedReferral, nelFormNotFound, nelReferralFormAnswer,
} from './referrals.mjs';
import { contractNotFound, contractTemplateAnswer } from './contracts.mjs';
import { findReferralForms } from '../referrals/nel-tree.mjs';
import { findContracts } from '../referrals/nel-contracts.mjs';

/**
 * The same card, led by a line saying it came from the other list.
 *
 * The note goes at the front rather than the end because it changes how every
 * block under it is read: a template name is not a form to open, and a reader
 * who takes that in after copying it has taken it in too late.
 */
const crossed = (card, said) => (card
  ? { ...card, blocks: [note(said, 'info'), ...(card.blocks || [])] }
  : null);

const CROSSED_TO_CONTRACT = 'Nothing on the NEL Referral Tree matches this. '
  + 'It is a NEL contract, so what follows is the EMIS template that records the work — '
  + 'not a referral form to open.';

const CROSSED_TO_TREE = 'No NEL contract by that name. '
  + 'What follows is how a referral for it is made instead — the form to open in EMIS, '
  + 'not a contract template.';

/**
 * /form — which referral form to open.
 *
 *   1. the practice's own emailed-referrals page. /form says "search the tree",
 *      but a dozen referrals are sent by email with the practice's own form and
 *      address, and the tree will happily answer those with somebody else's:
 *      "district nurse" returns Islington's service when this practice emails
 *      RP ACN 2022. The command must not be the one path that can talk somebody
 *      out of their own practice's process.
 *   2. the tree, for this practice's own area.
 *   3. the contract list, said to be the contract list.
 *   4. the tree again, for the forms another borough has and this one does not.
 *   5. the tree saying it has nothing — never prose, which is the whole point
 *      of having typed the command.
 */
export function formCommandAnswer({ query = '', pages = [] } = {}) {
  const asked = String(query || '').trim();
  if (!asked) return nelFormNotFound(asked);

  const emailed = findEmailedReferral({ name: asked, pages });
  if (emailed) return emailReferral(emailed);

  const tree = findReferralForms(asked);
  if (tree.matches.length) return nelReferralFormAnswer(asked);

  // The Sitrep only — no Notebook pages passed, so what comes back under this
  // note is a contract specification and its EMIS templates, which is what the
  // note says it is.
  const contract = crossed(contractTemplateAnswer(asked), CROSSED_TO_CONTRACT);
  if (contract) return contract;

  if (tree.elsewhere.length) return nelReferralFormAnswer(asked);
  return nelFormNotFound(asked);
}

/**
 * /template — which EMIS template records a contract.
 *
 * Two documents, in this order, and no third:
 *
 *   1. PCIT's contract Sitrep, for this practice's areas.
 *   2. the NEL Referral Tree, said to be the referral tree.
 *   3. the Sitrep again, for another borough's localisations.
 *   4. the Sitrep saying it has nothing.
 *
 * `pages` is accepted and deliberately unused: the caller passes the Notebook
 * to every template, and taking it here would put the practice's own prose back
 * under a command that named the document it wanted searched.
 */
export function templateCommandAnswer({ query = '' } = {}) {
  const asked = String(query || '').trim();
  if (!asked) return contractNotFound(asked);

  const list = findContracts(asked);
  if (list.matches.length) return contractTemplateAnswer(asked);

  const form = crossed(nelReferralFormAnswer(asked), CROSSED_TO_TREE);
  if (form) return form;

  if (list.elsewhere.length) return contractTemplateAnswer(asked);
  return contractNotFound(asked);
}
