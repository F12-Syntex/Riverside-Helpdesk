// WHY A ROUTE WAS CHOSEN, IN A FIXED VOCABULARY.
//
// The card used to explain itself in one free sentence from the reading. That
// sentence was accurate and slow to read: every card phrased the same reason
// differently, so a receptionist had to parse prose to find the thing that
// decided it — "under 10", "three months", "drops already failed".
//
// So the reading also names the deciding factors from this list, each with a
// few words from the message. The label is fixed, so the same reason always
// reads the same way on every card and can be scanned rather than read; the
// value is the message's own detail. The free sentence is still kept, folded
// away, for anyone who wants the full account.
//
// This is a vocabulary for EXPLAINING a destination, not a second router:
// nothing reads it to decide anything, and a criterion the reading gets wrong
// is visible on the card for reception to disagree with.
export const ROUTING_CRITERIA = [
  { id: 'redFlag', label: 'Red flag', hint: 'a symptom that needs a clinician urgently — "chest pain now", "blood in stool"' },
  { id: 'onset', label: 'Onset', hint: 'new or sudden — "sudden", "started today"' },
  { id: 'worsening', label: 'Getting worse', hint: 'deteriorating — "worse each day"' },
  { id: 'age', label: 'Age', hint: 'only when the message states or plainly implies it — "under 10", "over 75", "infant"' },
  { id: 'pregnancy', label: 'Pregnancy', hint: 'pregnant, or a recent birth, miscarriage or termination — "24 weeks", "miscarriage last month"' },
  { id: 'duration', label: 'Duration', hint: 'how long, in the message’s words — "3-4 months", "2 days"' },
  { id: 'recurrent', label: 'Recurring', hint: 'keeps coming back — "third time this year"' },
  { id: 'treatmentFailed', label: 'Treatment failed', hint: 'already tried and did not work — "ear drops"' },
  { id: 'treatmentWorked', label: 'Worked before', hint: 'the same treatment cleared an earlier episode — "antibiotics last time"' },
  { id: 'pathway', label: 'Pathway condition', hint: 'an uncomplicated case of a condition a self-referral or Pharmacy First pathway treats — "sore throat", "conjunctivitis"' },
  { id: 'outsidePathway', label: 'Outside pathway', hint: 'fails a pathway’s gate — "age range 1-17", "pregnant"' },
  { id: 'examination', label: 'Needs examining', hint: 'something a clinician has to see or feel — "lump", "rash"' },
  { id: 'requested', label: 'Patient asked for', hint: 'what the patient explicitly asked for — "GP review", "phone call"' },
  { id: 'longTerm', label: 'Long-term condition', hint: 'an existing diagnosis it is about — "type 2 diabetes", "asthma"' },
  { id: 'medication', label: 'Medication', hint: 'a medicine question — "side effects", "repeat request"' },
  { id: 'followUp', label: 'Follow-up', hint: 'results or a previous consultation — "blood results", "review after 2 weeks"' },
  { id: 'procedure', label: 'Nurse procedure', hint: 'a task a nurse or HCA does — "smear", "dressing", "B12"' },
  { id: 'admin', label: 'Admin only', hint: 'no clinical decision needed — "fit note", "letter"' },
  { id: 'mentalHealth', label: 'Mental health', hint: '"low mood", "anxiety" — any risk to life is a red flag instead' },
  { id: 'housebound', label: 'Housebound', hint: 'cannot attend the surgery — "bedbound"' },
  { id: 'social', label: 'Social need', hint: 'non-medical — "isolated", "housing"' },
  { id: 'notHere', label: 'Not done here', hint: 'the practice cannot do what is asked — "paediatric bloods"' },
  { id: 'unclear', label: 'Not enough detail', hint: 'the message does not say enough to place it' },
];

const BY_ID = new Map(ROUTING_CRITERIA.map((c) => [c.id, c]));

export const CRITERIA_IDS = ROUTING_CRITERIA.map((c) => c.id);

export const criterionLabel = (id) => (BY_ID.get(String(id || '')) || {}).label || '';

/**
 * The criteria a reading returned, cleaned: unknown ids dropped, each id once,
 * values trimmed to a few words, at most four. A value is optional — "Getting
 * worse" says enough on its own.
 */
export function cleanCriteria(list) {
  const seen = new Set();
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    const id = String((c && c.id) || '');
    if (!BY_ID.has(id) || seen.has(id)) continue;
    seen.add(id);
    const value = String((c && c.value) || '').trim().replace(/[.;,\s]+$/, '').slice(0, 48);
    out.push({ id, label: criterionLabel(id), value });
    if (out.length === 4) break;
  }
  return out;
}

/** The lines the prompt shows the reading, one per criterion. */
export const criteriaForPrompt = () => ROUTING_CRITERIA.map((c) => `  · ${c.id} — ${c.label}: ${c.hint}`);
