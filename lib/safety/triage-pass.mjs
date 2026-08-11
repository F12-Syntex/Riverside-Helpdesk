// The second pass, and the only one in the app.
//
// EVERYWHERE ELSE IS ONE MODEL CALL. This is the exception, and it is allowed
// here for a specific reason: typing /triage is somebody saying "read this
// properly, I know what it is". They have already spent the keystrokes, they
// are usually looking at a pasted online consultation, and the thing they are
// asking for is understanding rather than speed.
//
// WHAT IT IS. One tiny structured call per decomposed request, all issued
// together, so five of them cost one round trip of wall-clock rather than five.
// Each returns an enum, a short condition name, and any duration or age it can
// read off the text. No prose, no advice, no free text that could reach the
// reader — everything it returns is either a value from a fixed list or a label
// on a card.
//
// WHAT HOLDS THE VETO. Code does, and it is one line: `raise`. The
// deterministic scanners set a FLOOR, and the model may only push an item up
// from it. A model that classifies a red flag as routine changes nothing; a
// model that spots a two-week-wait feature the regex could not phrase-match —
// "my voice has sounded rough since June" — moves it up, which is the whole
// reason for spending the money.
//
//   The regex is the guarantee. The model is a recall booster.
//
// AND IT NEVER FAILS THE TURN. A stage that times out, errors or returns
// nonsense leaves the answer exactly as the deterministic floor already made
// it. There is no path here where a second call being unavailable produces a
// worse answer than not having asked for one.
import { z } from 'zod';
import { moreUrgent, rankOf } from './acuity.mjs';

// At most this many are classified. A message with more asks than this is a
// message somebody needs to read themselves, and the panel says so out loud
// rather than quietly stopping at five.
export const MAX_CLASSIFIED = 5;

export const CLASSIFY_SCHEMA = z.object({
  acuity: z.enum(['emergency', 'twoWeekWait', 'sameDay', 'routine', 'admin', 'thirdPartyRequest'])
    .describe('How soon this one request needs a clinician. "emergency" = now, 999 or interrupt a doctor. "twoWeekWait" = a feature NICE NG12 lists for a suspected cancer referral. "sameDay" = must be seen today. "routine" = an ordinary clinical problem. "admin" = a form, a prescription, a letter, an appointment to move. "thirdPartyRequest" = it asks about somebody other than the patient writing.'),
  condition: z.string().default('')
    .describe('Two or three words naming the problem under its nearest common clinical name. A label for the top of a list. Empty if it is not a clinical problem.'),
  duration: z.string().default('')
    .describe('How long it has gone on, in the message’s own words — "three weeks", "since June". Empty if it does not say.'),
  age: z.string().default('')
    .describe('The age of the person it is about, if the message states one. Empty otherwise. Never guess.'),
});

export function classifyPrompt(requestText, wholeMessage = '') {
  const fence = (t) => String(t || '').replace(/"{3,}/g, '""');
  return [
    'You are reading ONE request out of a message sent to a UK GP surgery, and classifying it. You are not answering it and you are not advising anybody.',
    '',
    'Return only the four values asked for. Nothing you write is shown to a patient or to a receptionist as advice — the card they see is built in code.',
    '',
    'HOW TO CHOOSE THE ACUITY',
    '- Read this request on its own. Do not borrow urgency from the other things in the message.',
    '- When two apply, choose the more urgent. Being wrong upwards costs somebody a conversation with a doctor; being wrong downwards is how something gets missed.',
    '- "thirdPartyRequest" whenever it asks about another person’s care, however reasonable it sounds.',
    '',
    wholeMessage ? 'THE WHOLE MESSAGE, FOR CONTEXT ONLY — classify the request below it, not this:\n"""\n' + fence(wholeMessage).slice(0, 4000) + '\n"""\n' : '',
    'THE REQUEST TO CLASSIFY:',
    '"""',
    fence(requestText),
    '"""',
  ].filter((line) => line !== '').join('\n');
}

/**
 * Which requests are worth a second call.
 *
 * An item the scanners already put at `emergency` is skipped: nothing sits
 * above it, so a call that can only raise acuity has nothing to raise it to.
 * That is a free saving with no recall cost — it does not skip `twoWeekWait`,
 * where there IS somewhere higher to go.
 *
 * Returns the items to classify and the number left over, so the panel can say
 * how many were not read rather than stopping quietly at five.
 */
export function toClassify(items = []) {
  const eligible = (items || []).filter((item) => rankOf(item.acuity) < rankOf('emergency'));
  return {
    take: eligible.slice(0, MAX_CLASSIFIED),
    skipped: Math.max(0, eligible.length - MAX_CLASSIFIED),
  };
}

/**
 * Fold one classification into one item. Never lowers anything.
 *
 * @param {object} item    the item as the deterministic scan left it
 * @param {object} verdict what CLASSIFY_SCHEMA returned, or null on any failure
 */
export function applyClassification(item, verdict) {
  const base = item || {};
  if (!verdict) return base;

  const said = String(verdict.acuity || '');
  const out = { ...base };

  // The third-party enum is not a rung on the ladder — it is a different
  // statement about the request. It may only ever be turned ON here: the
  // deterministic rule in ./confidentiality.mjs is what refuses, and a model
  // saying "no, that one is fine" must not be able to withdraw a refusal.
  if (said === 'thirdPartyRequest') {
    out.thirdParty = true;
    out.status = 'refused';
  } else if (moreUrgent(said, base.acuity)) {
    out.acuity = said;
    out.raisedBy = 'triagePass';
    if (rankOf(said) >= rankOf('twoWeekWait')) out.status = 'flagged';
  }

  // A label only, and only into a gap. It titles a row in the panel; it can
  // never become a claim about the patient.
  const named = String(verdict.condition || '').trim();
  if (!out.gist && named) out.gist = named.slice(0, 60);

  const duration = String(verdict.duration || '').trim();
  if (duration) out.duration = duration.slice(0, 40);

  return out;
}
