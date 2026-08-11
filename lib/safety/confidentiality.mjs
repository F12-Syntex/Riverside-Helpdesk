// Somebody asking about another person's record.
//
// "Can you check my wife's blood results while you're there — she's registered
// with you too." That arrived inside a message about four other things, and it
// is the one item on it that has no right answer at reception. Sharing a
// surname, an address and a doctor is not consent, and a receptionist who is
// half way through a list of five jobs is exactly who says yes to it.
//
// SO IT IS NOT A ROUTING DECISION AND IT IS NOT THE MODEL'S TO MAKE.
//
// This runs BEFORE anything is routed, it is patterns in code, and what it
// produces is a refusal shown in its own right — never a field on a card the
// model filled in, never something a template can be talked out of. The model
// is not consulted, so there is nothing for it to override.
//
// It errs toward refusing. A refusal that turns out to be unnecessary costs one
// conversation with the patient; the other error is a disclosure, and that one
// is a notifiable incident. But it does not fire on the mere mention of a
// relative — "my wife booked this for me" is a sentence about who dialled the
// phone. A rule that shouts at every family word becomes wallpaper within a
// week, and wallpaper is the failure mode that matters here.
import { matchSpan } from './spans.mjs';

// Whose record. Written out rather than matched loosely, because "partner" and
// "mother" have to be in the list and "manager" and "brother-in-law's builder"
// do not.
const RELATION = '(?:wife|husband|spouse|partner|missus|other half'
  + '|mother|mum|mummy|mother.in.law|father|dad|daddy|father.in.law'
  + '|son|daughter|child|children|kids?'
  + '|sister|brother|sibling|aunt(?:ie)?|uncle|cousin|niece|nephew'
  + '|nan|nana|gran|grandma|grandmother|grandad|granddad|grandfather|grandparent'
  + '|neighbour|neighbor|friend|carer|next door)';

// What is being asked for. This is the half that keeps the rule narrow: it has
// to be something out of a clinical record, not just something about a person.
const RECORD = '(?:results?|blood\\w*|test\\w*|sample|swab|scan|x.?ray|mri|ct'
  + '|record\\w*|notes|history|diagnosis|letter|referral|report'
  + '|prescription\\w*|medication\\w*|repeat|dosage'
  + '|appointment\\w*|vaccination\\w*|jab|immunisation\\w*'
  + '|sick note|fit note|blood pressure|bp)';

const NEAR = '[^.!?]{0,60}';

export const CONFIDENTIALITY_RULES = [
  {
    id: 'confidentiality.relativesRecord',
    label: 'A request about a relative’s record',
    // "my wife's blood results", "my mum's appointment", "my dad's
    // prescription". THE POSSESSIVE IS THE RULE: it is what makes the record
    // theirs rather than the writer's, and without it "my wife booked this
    // appointment" is a sentence about who dialled the telephone.
    pattern: new RegExp('\\bmy\\s+' + RELATION + '(?:\'s|s\'|’s)' + NEAR + RECORD, 'i'),
  },
  {
    id: 'confidentiality.relativeNeeds',
    label: 'A request about a relative’s record',
    // The same thing said without a possessive, which only reads as a request
    // when there is a verb asking for something: "my wife needs a fit note",
    // "my mother is waiting for her results".
    pattern: new RegExp('\\bmy\\s+' + RELATION
      + '\\s+(?:needs?|wants?|requires?|is (?:asking|waiting|due|chasing)|would like|has asked|is after)'
      + NEAR + RECORD, 'i'),
  },
  {
    id: 'confidentiality.recordForRelative',
    label: 'A request about a relative’s record',
    // The other word order: "the results for my wife", "a letter about my son".
    pattern: new RegExp(RECORD + NEAR + '\\b(?:for|about|of|belonging to|on behalf of)\\s+(?:my\\s+)?' + RELATION, 'i'),
  },
  {
    id: 'confidentiality.onBehalfOf',
    label: 'A request made on somebody else’s behalf',
    pattern: new RegExp('\\bon behalf of\\s+(?:my\\s+)?' + RELATION, 'i'),
  },
  {
    id: 'confidentiality.registeredHereToo',
    // Nobody writes this about themselves. It is written to pre-empt the
    // objection, which is precisely why it is worth matching.
    label: 'Another patient named as being registered here as well',
    pattern: /\b(?:she|he|they)(?:'s| is|'re| are)\s+(?:also\s+)?registered\s+(?:with|at|here)(?:\s+(?:you|us|the practice|here))?(?:\s+too|\s+as well)?/i,
  },
];

/**
 * Every third-party clinical request in the text.
 *
 * Findings are deduplicated by the words that matched: the two word-order rules
 * overlap on some phrasings, and a receptionist does not need to be told the
 * same sentence twice under two rule names.
 */
export function scanConfidentiality(text) {
  const source = String(text || '');
  if (!source.trim()) return [];
  const found = [];
  const seen = new Set();
  for (const rule of CONFIDENTIALITY_RULES) {
    const hit = matchSpan(source, rule.pattern);
    if (!hit) continue;
    const key = hit.span.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({
      ruleId: rule.id,
      kind: 'confidentiality',
      label: rule.label,
      match: hit.match,
      span: hit.span,
      index: hit.index,
    });
  }
  return found.sort((a, b) => a.index - b.index);
}
