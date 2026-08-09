// Choosing a template, and filling it.
//
// ONE CALL, ALWAYS. The model reads the message, picks the template that fits
// and fills that template's variables. It never writes the answer — the answer
// is the template, rendered in code from the values it returned.
//
// An earlier version matched templates with regular expressions and only
// reached the model when the keywords failed. That was two pipelines wearing
// one coat: "how do I refer for an ECG" hit the pattern and "ecg referral, how
// do I do this?" did not, so the same question got a different quality of
// answer depending on how it was typed. Understanding the question is the one
// job a model is actually good at; it does that, and the deterministic part
// stays where determinism is worth having — in the format of what comes out.
//
// What that buys, which a prompt cannot:
//   - the referral service is an enum of what the practice records, so a
//     pathway cannot be invented, only chosen or declined;
//   - the filing title is assembled by codingTitle from the parts, so its
//     format cannot drift however the model words things;
//   - every card is laid out by the same blocks, so answers stay consistent.
import { z } from 'zod';
import { REFERRAL_SERVICES, referralAnswer } from './referrals.mjs';
import { pharmacyFirstAnswer, pharmacyReferralAnswer } from './pharmacy.mjs';
import { minorEyeServiceAnswer, triagePatientAnswer } from './triage.mjs';
import {
  DOC_CODING_RULES, REASON_RULES,
  appointmentReasonAnswer, codedDocumentAnswer, documentCodingAnswer, writtenReasonAnswer,
} from './writing.mjs';

/** Every service name the model may choose between. */
export const REFERRAL_SERVICE_NAMES = REFERRAL_SERVICES.map((s) => s.name);

export const SELECTION_SCHEMA = z.object({
  template: z.enum([
    'referral',
    'documentCoding',
    'documentCodingRules',
    'appointmentReason',
    'appointmentReasonRules',
    'pharmacyFirst',
    'pharmacyReferral',
    'minorEyeService',
    'triage',
    'none',
  ]).describe('Which template answers this message. "none" when none of them does.'),

  referralService: z.enum(['none', ...REFERRAL_SERVICE_NAMES]).default('none')
    .describe('For "referral": which recorded referral this is about, or "none" when the practice records none of them for it.'),

  document: z.object({
    date: z.string().default('').describe('Clinical event date as dd-Mmm-yyyy, e.g. 07-Aug-2026. Empty if it cannot be found.'),
    site: z.string().default('').describe('Site code or organisation, e.g. RLH, HUH, Legal & General.'),
    department: z.string().default('').describe('Department or team in title case, e.g. Ophthalmology.'),
    actions: z.array(z.string()).default([]).describe('Terse actions for the practice only. An empty array is the normal answer.'),
  }).default({ date: '', site: '', department: '', actions: [] })
    .describe('For "documentCoding" only.'),

  condition: z.string().default('')
    .describe('For "pharmacyFirst" and "triage": the problem, given its nearest common clinical name rather than the exact wording used, so "slightly red eyes with some discharge" becomes "conjunctivitis" and "bad back" becomes "back pain". Keep it short. Empty if no problem was described.'),
  reason: z.string().default('').describe('For "appointmentReason": the single reason line.'),
  details: z.array(z.string()).default([]).describe('For "appointmentReason": at most 5 further shorthand points. Usually empty.'),
});

export function selectionPrompt({ question, attached = '' }) {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  return [
    'You are the router for a GP practice assistant. Read the message and choose the template that answers it, then fill in that template\'s values. You are NOT writing the answer: the answer is the template, and it is rendered from what you return.',
    '',
    'THE TEMPLATES',
    '',
    '1. "referral" — the message is about making or sending a referral, however it is worded ("how do I refer for an ECG", "ecg referral, how to do this?", "2ww skin"). Set referralService to the recorded referral it is about. Set it to "none" if the practice records none of them for this — a wrong match sends a referral to the wrong service, so "none" is the safe answer when unsure. Never invent a service.',
    '',
    '2. "documentCoding" — a document ABOUT a patient, written by another service, has been pasted in or attached to be filed: a discharge summary, clinic letter, A&E attendance, report or insurer letter. Fill in "document" so a filing title can be built:',
    ...DOC_CODING_RULES.map((r) => '   - ' + r),
    '',
    '3. "documentCodingRules" — the message ASKS how documents are titled or coded, without pasting one in.',
    '',
    '4. "appointmentReason" — the words a PATIENT wrote have been pasted in (an online consultation or triage form, first person: "I have", "my", "I tried") AND the reason line for the appointment is what is wanted. Write "reason":',
    ...REASON_RULES.map((r) => '   - ' + r),
    '',
    '5. "appointmentReasonRules" — the message ASKS how to write a reason for appointment, without pasting one in.',
    '',
    '6. "pharmacyFirst" — the message asks specifically about Pharmacy First, CPSAS, community pharmacy or self-care. Put the condition named into "condition".',
    '',
    '6a. "pharmacyReferral" — the message asks HOW to send a Pharmacy First referral ("how do I refer to the pharmacy", "pharmacy first referral steps", "where is Local Services").',
    '',
    '6b. "minorEyeService" — the message asks about the minor eye service, MECS, Rose Opticians, or for the wording to send a patient about an eye appointment.',
    '',
    '7. "triage" — a member of STAFF describes the problem a patient has, and needs to know WHERE IT GOES: "pt has mild discomfort in their eyes, slightly red with some discharge", "patient calling about a sore throat", "someone has come in with a rash". Third person, usually short, often shorthand such as "pt". Put the description into "condition".',
    '   THIS IS THE DEFAULT for any described symptom. Choose "appointmentReason" over it ONLY when first-person text a patient wrote was pasted in and a reason line is what is wanted. A staff member describing a patient is asking where to send them, not asking for a summary of what they just wrote.',
    '',
    '8. "none" — anything else. Choose it freely: another part of the assistant answers those, and forcing a template that does not fit produces a confident answer to a question nobody asked.',
    '',
    attached ? 'ATTACHED DOCUMENT:\n"""\n' + fence(attached) + '\n"""\n' : '',
    'THE MESSAGE:',
    '"""',
    fence(question),
    '"""',
  ].filter((line) => line !== '').join('\n');
}

/**
 * Turn the model's selection into a rendered answer. Returns null when no
 * template applies, which is the caller's signal to fall back to prose.
 */
export function renderSelection(selection, question = '') {
  const sel = selection || {};
  switch (sel.template) {
    case 'referral': {
      const name = String(sel.referralService || '').trim();
      const service = name && name.toLowerCase() !== 'none'
        ? REFERRAL_SERVICES.find((s) => s.name === name) || null
        : null;
      // No match is still a real answer: referralAnswer produces the "not
      // recorded" card, which names who to ask instead of inventing a pathway.
      return referralAnswer({ question, service });
    }
    case 'documentCoding': {
      const d = sel.document || {};
      // A title with nothing in it is not a title. If the model chose this
      // template but found no parts, prose is the honest fallback.
      if (!d.date && !d.site && !d.department && !(d.actions || []).length) return null;
      return codedDocumentAnswer({
        date: d.date || 'dd-Mmm-yyyy',
        site: d.site || '',
        department: d.department || '',
        actions: Array.isArray(d.actions) ? d.actions.filter(Boolean).slice(0, 6) : [],
      });
    }
    case 'appointmentReason': {
      const reason = String(sel.reason || '').trim();
      if (!reason) return null;
      return writtenReasonAnswer({
        reason,
        details: Array.isArray(sel.details) ? sel.details.filter(Boolean).slice(0, 5) : [],
      });
    }
    case 'triage':
      return triagePatientAnswer({ condition: String(sel.condition || '').trim() });
    case 'pharmacyFirst':
      return pharmacyFirstAnswer({ condition: String(sel.condition || '').trim() });
    case 'pharmacyReferral':
      return pharmacyReferralAnswer();
    case 'minorEyeService':
      return minorEyeServiceAnswer({ condition: String(sel.condition || '').trim() });
    case 'documentCodingRules':
      return documentCodingAnswer();
    case 'appointmentReasonRules':
      return appointmentReasonAnswer();
    default:
      return null;
  }
}
