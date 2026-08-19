// The two document commands. One document each, and nothing else.
//
// Referral form  → "NEL Referral Tree introduction & document list (EMIS Web)",
//                  Primary Care IT, in lib/referrals/nel-tree.data.json.
// Contract template → "NEL Local Contract Specifications", Primary Care IT, in
//                  lib/referrals/nel-contracts.data.json.
//
// WHAT "ONLY" MEANS HERE, because it has been wrong in three different ways.
//
//   - NO MODEL. Both answers are a ranked string match against a file in this
//     repository. No call, no tokens, no network, and no sentence that was not
//     already written in the document.
//   - NO NOTEBOOK. The practice's own pages do not reach these two commands.
//     Contract template used to check them first and returned a page the
//     practice had written about diabetic eye screening, headed "From the
//     Notebook", for a question asking which EMIS template records a contract.
//     Referral form used to check the emailed-referrals page first for the
//     opposite reason — it is this practice's own referral process — and that
//     is gone too: a command names one document, and a reader who wants the
//     practice's own material asks without the command, where the router reads
//     the Notebook exactly as it always did.
//   - NO CROSSING BETWEEN THE TWO. A miss on the contract specifications is
//     reported as a miss, not answered out of the referral tree. The two lists
//     answer two different questions — which form to open, which template
//     records a contract — and an answer from the other one is a different
//     question answered confidently.
//
// So each command has exactly three outcomes: its document names the row, its
// document offers a shortlist, or its document says it has nothing. The card
// always names the document it read and the date that document was captured.
//
// AND IT RUNS THE OTHER WAY TOO, WHICH IS NEW. "One document each" used to say
// only what these two commands may read. It now also says who may read those
// two documents: nobody but these two. The ordinary Q&A path had its own way
// into both — the referral card fell through to the tree when the practice had
// recorded nothing (lib/templates/referrals.mjs), and the router could choose a
// "contractTemplate" template of its own that searched the specifications
// (lib/templates/route.mjs) — so a question asked in ordinary words could be
// answered out of a PCIT list nobody had pointed at. Both are gone. The two
// lists answer North East London's questions, which are not the same as this
// practice's: what forms exist, and what the ICB commissions. Q&A answers from
// the practice's own material, and where that has nothing it says so and names
// the mode that searches the list.
//
// WHAT IT COSTS, SAID PLAINLY. The tree turned four hundred-odd "not recorded
// in the practice's notes" cards into the name of a form, and those questions
// get the "not recorded" card again unless the reader arms Referral form. That
// is the trade: an answer is either from a document the reader chose, or from
// the practice's own writing, and never from a document that was merely to hand.
//
// IT LIVES IN ITS OWN MODULE rather than in referrals.mjs and contracts.mjs so
// that the scope of a command is stated once, in one place, instead of being a
// property of whichever branch a caller happened to reach. app/api/agent/route.js
// calls these two and nothing else on the command path.
import { nelFormNotFound, nelReferralFormAnswer } from './referrals.mjs';
import { contractNotFound, contractTemplateAnswer } from './contracts.mjs';

/**
 * Referral form — the NEL Referral Tree, and only the NEL Referral Tree.
 *
 * `nelReferralFormAnswer` returns null when the tree has nothing, which is the
 * signal to say so outright. It is never allowed to fall through to prose: the
 * whole reason to choose this mode rather than ask in words is that the answer
 * is a form name out of a published document, and a model writing plausibly
 * about a form nobody can find is the exact failure it exists to prevent.
 */
export function formCommandAnswer({ query = '' } = {}) {
  const asked = String(query || '').trim();
  if (!asked) return nelFormNotFound(asked);
  return nelReferralFormAnswer(asked) || nelFormNotFound(asked);
}

/**
 * Contract template — the NEL Local Contract Specifications, and only those.
 *
 * Called WITHOUT pages on purpose. `contractTemplateAnswer` still takes them,
 * and the router still passes them, because an ordinary question about a
 * service should reach what the practice wrote about it; a command that names
 * the document should not.
 */
export function templateCommandAnswer({ query = '' } = {}) {
  const asked = String(query || '').trim();
  if (!asked) return contractNotFound(asked);
  return contractTemplateAnswer(asked) || contractNotFound(asked);
}
