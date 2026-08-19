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
// IT LIVES HERE RATHER THAN IN EITHER MODULE because referrals.mjs and
// contracts.mjs would otherwise have to import each other, and a cycle between
// two modules that both render cards is the kind of thing that works until the
// bundler changes its mind.
import { note } from './blocks.mjs';
import {
  emailReferral, findEmailedReferral, nelFormNotFound, nelReferralFormAnswer, treeFormAnswer,
} from './referrals.mjs';
import { contractNotFound, contractTemplateAnswer, notebookPageFor } from './contracts.mjs';
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

  // The contract list only — no Notebook pages passed, because the practice's
  // own material has already had its turn above and a page reached through this
  // door would be described by the note as a contract, which it is not.
  const contract = crossed(contractTemplateAnswer(asked), CROSSED_TO_CONTRACT);
  if (contract) return contract;

  if (tree.elsewhere.length) return nelReferralFormAnswer(asked);
  return nelFormNotFound(asked);
}

/**
 * /template — which EMIS template records a contract.
 *
 *   1. the practice's own Notebook page for the contract, for the reason set out
 *      in lib/templates/contracts.mjs: what THIS practice wrote down about a
 *      service outranks a bulletin about how the contract is built.
 *   2. the contract list, for this practice's areas.
 *   3. the referral tree, said to be the referral tree.
 *   4. the contract list again, for another borough's localisations.
 *   5. the contract list saying it has nothing.
 */
export function templateCommandAnswer({ query = '', pages = [] } = {}) {
  const asked = String(query || '').trim();
  if (!asked) return contractNotFound(asked);

  if (notebookPageFor(asked, pages)) return contractTemplateAnswer(asked, { pages });

  const list = findContracts(asked);
  if (list.matches.length) return contractTemplateAnswer(asked, { pages });

  const form = crossed(treeFormAnswer({ query: asked, pages }), CROSSED_TO_TREE);
  if (form) return form;

  if (list.elsewhere.length) return contractTemplateAnswer(asked, { pages });
  return contractNotFound(asked);
}
