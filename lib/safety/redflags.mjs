// Emergencies, and the things that must reach a clinician today whatever else
// the message also matches.
//
// THIS PATTERN IS NOT NEW AND HAS NOT BEEN REWORDED. It is the RED_FLAGS regex
// that has always lived at the top of lib/templates/triage.mjs, moved here
// unchanged and imported back by that file, because it stopped being a triage
// rule the day it started running on every turn.
//
// It used to run only inside triage, which meant a message routed to a Notebook
// page or a referral card was never scanned at all. "Can you sort a fit note —
// also I've been coughing up blood" reached the reader as a fit note. The words
// were written either way, so the scan runs either way.
import { matchSpan } from './spans.mjs';
import { isSpinalEmergency, mskFeatures } from '../templates/fcp.mjs';

export const RED_FLAGS = /\b(chest pain|short(?:ness)? of breath|breathless|difficulty breathing|stroke|face drooping|severe bleed\w*|haemorrhage|collaps\w+|unconscious|anaphyla\w+|sepsis|septic|seizure|suicid\w+|overdose|head injury|severe abdominal pain|meningitis|non.?blanching|blood in (?:stool|vomit|urine)|coughing up blood)\b/i;

/**
 * Every emergency feature written anywhere in the text.
 *
 * Two findings at most, and they are different kinds of thing: the red-flag
 * list above, and cauda equina — which is checked through the musculoskeletal
 * features rather than by name, because a frightened patient has no reason to
 * know the name, and because those patterns are only safe next to a back
 * problem (see lib/templates/fcp.mjs).
 */
export function scanRedFlags(text) {
  const source = String(text || '');
  if (!source.trim()) return [];
  const found = [];

  const flag = matchSpan(source, RED_FLAGS);
  if (flag) {
    found.push({
      ruleId: 'redFlag.emergency',
      kind: 'redFlag',
      acuity: 'emergency',
      label: 'Something on the emergency list — ' + flag.match.toLowerCase(),
      match: flag.match,
      span: flag.span,
      index: flag.index,
    });
  }

  const msk = mskFeatures(source);
  if (isSpinalEmergency(msk) && msk.spans.caudaEquina) {
    found.push({
      ruleId: 'redFlag.caudaEquina',
      kind: 'redFlag',
      acuity: 'emergency',
      label: 'Back pain with bladder, bowel or saddle symptoms',
      match: msk.spans.caudaEquina.match,
      span: msk.spans.caudaEquina.span,
      index: msk.spans.caudaEquina.index,
    });
  }

  return found.sort((a, b) => a.index - b.index);
}
