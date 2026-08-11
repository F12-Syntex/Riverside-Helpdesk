// What goes above the card, and what goes beside it.
//
// The card answers one request. These two things exist so that the card
// answering one request can never read as the whole message having been dealt
// with — which is exactly how a hoarse voice with a stone of weight loss on it
// left the building behind a knee appointment.
//
//   THE BAND, above the card. Named features a deterministic scanner found
//   anywhere in the message, and who they go to. It is written in the voice of
//   the existing red-flag cards because it is the same kind of statement: this
//   is what was seen, this is who it goes to, do not decide it here.
//
//   THE PANEL, beside the card. Every request the message contained, each
//   marked with what happened to it. It costs no tokens — it is a list of what
//   the model already returned — and it is the backstop for every rule in
//   lib/safety that misses. A regex cannot match "my voice sounds rough"; the
//   panel still shows that the sentence was written and that nothing answered
//   it, and it is tappable so answering it is one press rather than retyping.
//
// NOTHING HERE PARAPHRASES ANYTHING. The band names the rule's own label and
// quotes the patient's own sentence. The panel shows the patient's own span.
import { ACUITY_LABELS, rankOf } from '../safety/acuity.mjs';
import { answer, bullets, field, fields, note, sourced } from './blocks.mjs';

const DUTY = 'The duty doctor';

// The reader sees the rule's label and, under it, the words that fired it.
// Both, always: the label alone reads as an accusation and the quote alone
// reads as a highlight.
const findingLine = (f) => `**${f.label}** — “${f.span}”`;

/**
 * The band that goes above the card.
 *
 * Returns null when nothing fired, which is the normal case and the caller's
 * signal to render nothing at all.
 *
 * TWO TONES, ONE CARD. An emergency finding and a suspected-cancer finding are
 * different instructions — interrupt somebody now against pass it on today —
 * and are kept apart rather than averaged into a middle urgency that is wrong
 * for both.
 */
export function acuityBandAnswer(findings = [], { age = null } = {}) {
  const list = (findings || []).filter(Boolean);
  if (!list.length) return null;

  const emergencies = list.filter((f) => f.acuity === 'emergency');
  const twoWeek = list.filter((f) => f.acuity === 'twoWeekWait');
  const worst = emergencies.length ? 'emergency' : 'twoWeekWait';

  const blocks = [
    fields([
      field('Send it to', emergencies.length ? DUTY + ', now' : DUTY + ', today'),
      age ? field('Age given', String(age)) : null,
    ], 'Also in this message'),

    note(
      'This is <mark>not what the card below is about</mark>. It was found by reading the whole message, including the parts nothing answered.',
      'critical',
    ),
  ];

  if (emergencies.length) {
    blocks.push(sourced(
      bullets(emergencies.map(findingLine), 'On the emergency list'),
      emergencies.map((f) => f.ruleId).join(' · '),
    ));
    blocks.push(bullets([
      'Interrupt the **duty doctor** now. Do not put this in a task queue and do not wait for a callback slot.',
      'If the patient is acutely unwell, call **999** and stay with them.',
    ]));
  }

  if (twoWeek.length) {
    blocks.push(sourced(
      bullets(twoWeek.map(findingLine), 'Features NICE NG12 lists'),
      twoWeek.map((f) => f.ruleId).join(' · '),
    ));
    blocks.push(note(
      'These are features NICE NG12 lists for a <mark>suspected cancer pathway referral</mark>. Whether one is made is a **clinical decision, not a booking one** — pass it to the **duty doctor today** and let them decide. Do not tell the patient what it might be and do not reassure them.',
      'critical',
    ));
  }

  blocks.push(note('Say what the patient wrote, in their words. Book whatever the card below says as well — this does not replace it.', 'warn'));

  return answer({
    title: emergencies.length
      ? 'Something else in this message is an emergency'
      : 'Something else in this message needs a doctor today',
    subtitle: ACUITY_LABELS[worst] + ' — found by reading the whole message',
    blocks,
    source: ['Triage guidelines', 'NICE NG12 — suspected cancer, recognition and referral'],
  });
}

/**
 * The refusal, when the message asks about somebody else's record.
 *
 * IT IS NOT A ROUTING DECISION and it is not on the card, because it is not a
 * question about where a patient goes. It is a thing reception must not do, and
 * it is rendered from patterns in code (lib/safety/confidentiality.mjs) with no
 * model anywhere in the path — so there is nothing here for a model to be
 * talked out of.
 */
export function confidentialityAnswer(findings = []) {
  const list = (findings || []).filter(Boolean);
  if (!list.length) return null;

  return answer({
    title: 'Part of this message is about somebody else',
    subtitle: 'That part cannot be answered here',
    blocks: [
      sourced(
        bullets(list.map(findingLine), 'What was asked'),
        list.map((f) => f.ruleId).join(' · '),
      ),
      note(
        '<mark>Do not look at, discuss, read out or send another person’s record</mark> — not their results, not their appointments, not their prescriptions. Sharing a surname, an address and a doctor is not consent, and being registered here is not consent.',
        'critical',
      ),
      bullets([
        'Ask the person the record belongs to to make the request **themselves**.',
        'If they cannot, consent has to be **recorded on their record** before anything is shared. Reception does not decide that — ask the **practice manager**.',
        'Answer the rest of the message normally. Refusing this part is not a reason to leave the rest.',
      ]),
      note('If somebody insists there is consent, do not take their word for it and do not check the record to look. Pass it to the **practice manager**.', 'warn'),
    ],
    source: ['Confidentiality and consent to share'],
  });
}

// What happened to one request, in the two words the reader needs.
const STATUS = {
  routed: { label: 'Answered below', tone: 'done' },
  flagged: { label: 'Sent to the duty doctor', tone: 'urgent' },
  refused: { label: 'Refused', tone: 'urgent' },
  unhandled: { label: 'Not answered', tone: 'open' },
};

/**
 * The unresolved items panel.
 *
 * Every request, in the order they were written, each marked routed, flagged,
 * refused or unhandled. An unhandled one is tappable and asks that item on its
 * own, reusing the same re-ask the clarify options use.
 *
 * Returns null for a message that was never decomposed — one request answered
 * by one card needs no list saying so, and a panel that appears on every short
 * question is a panel nobody reads by Thursday.
 */
export function unresolvedPanel(scan) {
  const s = scan || {};
  if (!s.decomposed) return null;
  const listed = (s.listed || []).filter((item) => !item.whole);
  if (listed.length < 2) return null;

  const items = listed.map((item) => {
    const status = STATUS[item.status] || STATUS.unhandled;
    return {
      id: item.id,
      // The gist when the model gave one, the span when it did not. Never a
      // rewrite of either.
      label: item.gist || item.text,
      text: item.text,
      status: item.status,
      statusLabel: status.label,
      tone: status.tone,
      acuity: item.acuity,
      acuityLabel: ACUITY_LABELS[item.acuity] || '',
      // Only an unanswered item is worth a press. Asking a flagged one again
      // would answer it as an ordinary question, which is the opposite of what
      // has just been decided about it.
      askable: item.status === 'unhandled',
    };
  }).sort((a, b) => rankOf(b.acuity) - rankOf(a.acuity));

  // Said out loud, never silently. A panel that quietly stops at five reads as
  // "these are all of them", which is the failure this whole thing exists to
  // stop happening one level up.
  const notes = [];
  if (s.dropped) notes.push(s.dropped + (s.dropped === 1 ? ' further request was' : ' further requests were') + ' not listed — read the message itself for the rest.');
  if (s.unread) notes.push(s.unread + (s.unread === 1 ? ' item was' : ' items were') + ' not read individually and carry only the automatic check.');
  if (s.trivia) notes.push(s.trivia + (s.trivia === 1 ? ' preference about timing is' : ' preferences about timing are') + ' not listed as an unresolved item.');

  return {
    title: 'Everything this message asked for',
    subtitle: 'Nothing here is closed until somebody closes it',
    items,
    note: notes.join(' '),
    open: items.filter((item) => item.status === 'unhandled').length,
  };
}
