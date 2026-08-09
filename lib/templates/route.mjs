// Which template answers a question, and what the model still has to supply.
//
// The point of the templates is that most questions do not need a model at all.
// "How do I refer for an ECG" is not a writing task: ECG is on the practice's
// emailed list, so the answer is the email template with the ECG entry in it,
// and it can be served in a millisecond for nothing. The model is only worth
// paying for when a value is genuinely unknown — and then it fills a named
// slot, not the answer.
//
// Three outcomes:
//   { answer }      resolved outright. No model call.
//   { needs, ... }  a template matched but a slot is missing. One small,
//                   constrained model call fills it, then the template renders
//                   as usual.
//   null            nothing matched. The caller falls back to prose.
//
// Matching is deliberately literal for now. It is a keyword pass, not an
// understanding of the question, and it is written to fail into the fallback
// rather than to guess — a confidently wrong template is worse than a slow
// answer, because it looks complete.
import { REFERRAL_SERVICES, findReferralService, referralAnswer } from './referrals.mjs';
import { appointmentReasonAnswer, documentCodingAnswer } from './writing.mjs';

const REFERRAL = /\brefer(?:ral|rals|red|ring|s)?\b/i;
// Asking how to WRITE a filing title, not asking about a document generally.
const DOC_CODING = /\b(?:cod(?:e|ing)|titl(?:e|ing)|name)\b[^.?]{0,40}\b(?:document|letter|discharge|report)\b|\b(?:document|letter)\b[^.?]{0,40}\b(?:cod(?:e|ing)|titl(?:e|ing))\b/i;
const APPT_REASON = /\b(?:reason for (?:the )?appointment|appointment reason|reason for (?:the )?(?:visit|consultation))\b/i;

/** Every service name the model may choose between, for the slot-fill call. */
export const REFERRAL_SERVICE_NAMES = REFERRAL_SERVICES.map((s) => s.name);

/**
 * Route a question to a template. `question` is the staff message, verbatim.
 */
export function routeQuestion(question) {
  const q = String(question || '');
  if (!q.trim()) return null;

  if (REFERRAL.test(q)) {
    const service = findReferralService(q);
    // Named outright — ECG, BCG, social prescriber. Nothing to think about.
    if (service) return { id: 'referral', answer: referralAnswer({ service }), resolved: 'named' };
    // A referral question about something the keyword pass could not name. The
    // model picks from the list the practice actually records, or says none of
    // them — it never invents a service, so the worst case is the honest "not
    // recorded" card rather than a fabricated pathway.
    return { id: 'referral', needs: 'referralService', question: q };
  }

  if (DOC_CODING.test(q)) return { id: 'documentCoding', answer: documentCodingAnswer(), resolved: 'rule' };
  if (APPT_REASON.test(q)) return { id: 'appointmentReason', answer: appointmentReasonAnswer(), resolved: 'rule' };

  return null;
}

/**
 * Finish a route once the model has filled its slot. Kept here so the API route
 * holds no knowledge of what a slot means.
 */
export function completeRoute(route, filled) {
  if (route.needs === 'referralService') {
    const name = String(filled?.service || '').trim();
    const service = name && name.toLowerCase() !== 'none'
      ? REFERRAL_SERVICES.find((s) => s.name === name) || null
      : null;
    // No match is a real answer: referralAnswer produces the "not recorded"
    // card, which names who to ask instead of inventing a pathway.
    return referralAnswer({ question: route.question, service });
  }
  return null;
}
