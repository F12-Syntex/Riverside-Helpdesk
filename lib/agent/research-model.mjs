// Which model does the reading, and when that decision is taken back.
//
// The research phase is not a writing job. It searches the practice's material,
// looks at what came back, and decides which file to open next — reading and
// identifying, over and over, in a loop whose entire output is a one-line note
// nobody reads. Running that on the model that writes answers pays the writer's
// rate for six calls of skimming, and skimming is not what the writer is chosen
// for.
//
// So the loop runs on the FAST role and the writing stays on the reasoning role
// (see app/api/agent/route.js and lib/agent/compose.mjs). Every judgement the
// reader acts on — what the answer says, which claims the sources back, which
// clinic type a referral goes under — is still made by the reasoning model, from
// the sources the fast model put in front of it.
//
// The one thing that can go wrong is a fast model too weak to drive tools at
// all: it replies with prose instead of calling search_practice, and the turn
// reports "I could not find anything" for a question the practice has a whole
// page about. That failure is silent, which is what makes it worth code. It is
// also DISTINGUISHABLE — a loop that searched and found nothing has called
// tools; a loop that never called one has not done the job — so the two are not
// confused here, and a genuine "nothing found" is never paid for twice.
const NO_ESCALATION = { escalate: false, reason: '' };

/**
 * Where the research loop starts. The fast role, unless nothing is set for it,
 * in which case it resolves to the reasoning model anyway and this is a no-op —
 * an install that has only ever chosen one model behaves exactly as before.
 */
export function pickResearchModel(roles) {
  const fast = String(roles?.fast?.model || '').trim();
  const reasoning = String(roles?.reasoning?.model || '').trim();
  const model = fast || reasoning;
  return { model, reasoning, role: model && model === reasoning ? 'reasoning' : 'fast' };
}

/**
 * Whether to run the research loop again on the reasoning model.
 *
 * Only for a loop that did not work: one that failed outright, or one that never
 * called a tool. A loop that searched and found nothing is not escalated — that
 * is a finding, and the honest "the practice's material does not cover this" is
 * the right answer to it.
 *
 * Never escalates when the two roles are the same model (there is nothing to
 * escalate to), and never after a hand-off or a general request — both are
 * decisions the loop reached on purpose. A loop that recognised "format this
 * email" and stopped has done exactly the right thing; researching it again on
 * the expensive model would find the same nothing, more slowly.
 */
export function shouldEscalateResearch({ error = null, toolCalls = 0, handOff = '', generalTask = '', model = '', reasoning = '' }) {
  if (!reasoning || model === reasoning) return NO_ESCALATION;
  if (handOff || generalTask) return NO_ESCALATION;
  if (error) return { escalate: true, reason: 'the research loop failed on ' + model };
  if (!toolCalls) return { escalate: true, reason: model + ' ran the research loop without calling a single tool' };
  return NO_ESCALATION;
}
