// What a reader can say about an answer, in one click.
//
// Five buttons, no typing. Typing is the reason feedback never arrives: someone
// with a patient at the desk will not write a sentence explaining why an answer
// was wrong, but they will press "Wrong" on the way past. So the vocabulary is
// fixed, small, and phrased as the reader's own reaction rather than as a
// category — "Not what I asked" tells us more than "irrelevant" does, and it is
// obvious which one to press without reading all five.
//
// Shared by the buttons and by the API that stores them, so the two cannot
// drift into disagreeing about what a verdict is.
export const VERDICTS = [
  { id: 'good', label: 'Helpful', good: true },
  { id: 'wrong', label: 'Wrong', good: false },
  { id: 'outdated', label: 'Out of date', good: false },
  { id: 'incomplete', label: 'Missing something', good: false },
  { id: 'off-topic', label: 'Not what I asked', good: false },
];

export const VERDICT_IDS = VERDICTS.map((v) => v.id);

export const verdictLabel = (id) => (VERDICTS.find((v) => v.id === id) || {}).label || id;
export const isGoodVerdict = (id) => !!(VERDICTS.find((v) => v.id === id) || {}).good;
