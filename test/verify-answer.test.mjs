import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFullNotebookSources } from '../lib/knowledge-context.mjs';
import {
  FALLBACK_LEAD, NOT_COVERED, checkLead, locateQuote, nearestByWords, pageRef, verifySelection,
} from '../lib/agent/verify-answer.mjs';

const ROWS = [
  { id: 1, parentId: null, title: 'Admin', body: '', isSection: true },
  {
    id: 10, parentId: 1, title: 'Sick notes',
    body: 'Fit notes are issued by the GP only.\nIf the patient needs one backdated, send a task to the **duty doctor**. Never promise a date.\n\n- Check the last note in EMIS\n- Book a phone call if over 7 days',
  },
  { id: 11, parentId: 1, title: 'Breast screening', body: 'Women aged 50 to 71 are invited every 3 years by the local screening service.' },
  {
    id: 12, parentId: 1, title: 'Dermatology referral', body: '', kind: 'ersReferral',
    fields: { service: 'Dermatology', specialty: 'Dermatology', clinicType: 'Skin Lesion' },
  },
  { id: 13, parentId: 1, title: 'Half written', body: 'Draft text', kind: 'ersReferral', fields: {}, status: 'draft' },
];
const PAGES = buildFullNotebookSources(ROWS);
const QUESTION = 'Can a sick note be backdated?';

test('pages are addressed by their note id, and drafts are not among them', () => {
  assert.deepEqual(PAGES.map(pageRef), ['p10', 'p11', 'p12']);
});

test('an unknown page id is dropped, and nothing left means not covered', () => {
  const out = verifySelection({ verdict: 'answer', lead: 'Backdated sick notes', picks: [{ page: 'p999', type: 'quote', quote: 'send a task to the duty doctor' }] }, PAGES, QUESTION);
  assert.equal(out.verdict, 'not_covered');
  assert.equal(out.lead, NOT_COVERED);
  assert.equal(out.dropped[0].reason, 'unknown page');
});

test('a paraphrased quote is dropped', () => {
  const out = verifySelection({ verdict: 'answer', lead: 'Sick note', picks: [{ page: 'p10', type: 'quote', quote: 'ask the on-call doctor to backdate it' }] }, PAGES, QUESTION);
  assert.equal(out.verdict, 'not_covered');
  assert.equal(out.dropped[0].reason, 'quote not on page');
});

test('an exact quote is shown as the page wrote it, not as the model copied it', () => {
  const out = verifySelection({
    verdict: 'answer', lead: 'Backdated sick notes',
    picks: [{ page: 'p10', type: 'quote', quote: 'If the patient needs one backdated, send a task to the duty doctor' }],
  }, PAGES, QUESTION);
  assert.equal(out.verdict, 'answer');
  assert.equal(out.quotes.length, 1);
  // The whole sentence, with the page's own bold, and nothing the model wrote.
  assert.equal(out.quotes[0].text, 'If the patient needs one backdated, send a task to the **duty doctor**.');
  assert.equal(out.quotes[0].page.docId, 'note:10');
});

test('a quote across list lines keeps its line breaks', () => {
  const found = locateQuote('Check the last note in EMIS Book a phone call if over 7 days', PAGES[0].text);
  assert.equal(found.text, '- Check the last note in EMIS\n- Book a phone call if over 7 days');
});

test('a quote from a table row is found without its borders and shown under the header', () => {
  const page = '## Links\n\n| Service | Contact |\n|---|---|\n| **Blood tests** | 07342 068 763 |\n| Physio | self-refer online |';
  const found = locateQuote('Blood tests 07342 068 763', page);
  assert.equal(found.text, '| Service | Contact |\n|---|---|\n| **Blood tests** | 07342 068 763 |');
  // A number changed is a different row.
  assert.equal(locateQuote('Blood tests 07342 068 764', page), null);
});

test('a quote too short to mean anything is refused', () => {
  assert.equal(locateQuote('the GP', PAGES[0].text), null);
});

test('a lead carrying a number or a new word is replaced with the fixed one', () => {
  const pick = [{ page: 'p10', type: 'quote', quote: 'Fit notes are issued by the GP only' }];
  const numbered = verifySelection({ verdict: 'answer', lead: 'Backdate up to 14 days', picks: pick }, PAGES, QUESTION);
  assert.equal(numbered.lead, FALLBACK_LEAD);
  assert.equal(numbered.leadReason, 'number');
  const invented = verifySelection({ verdict: 'answer', lead: 'Nurses can sign these', picks: pick }, PAGES, QUESTION);
  assert.equal(invented.lead, FALLBACK_LEAD);
  const fine = verifySelection({ verdict: 'answer', lead: 'Sick notes are issued by the GP', picks: pick }, PAGES, QUESTION);
  assert.equal(fine.lead, 'Sick notes are issued by the GP');
});

test('checkLead refuses addresses', () => {
  assert.equal(checkLead('Email derm@nhs.net', { question: 'derm email' }).ok, false);
});

test('a card pick on a plain note is dropped; on a typed note it is kept', () => {
  const plain = verifySelection({ verdict: 'answer', lead: '', picks: [{ page: 'p10', type: 'card' }] }, PAGES, QUESTION);
  assert.equal(plain.verdict, 'not_covered');
  assert.equal(plain.dropped[0].reason, 'not a card');
  const typed = verifySelection({ verdict: 'answer', lead: 'Dermatology referral', picks: [{ page: 'p12', type: 'card' }] }, PAGES, 'dermatology referral');
  assert.equal(typed.verdict, 'answer');
  assert.equal(typed.cards[0].kind, 'ersReferral');
});

test('not covered keeps only real pages as the nearest, else ranks by words', () => {
  const named = verifySelection({ verdict: 'not_covered', lead: '', picks: [], nearest: ['p11', 'p404'] }, PAGES, 'mammogram');
  assert.deepEqual(named.nearest.map(pageRef), ['p11']);
  const ranked = verifySelection({ verdict: 'not_covered', lead: '', picks: [], nearest: [] }, PAGES, 'breast screening age');
  assert.equal(pageRef(ranked.nearest[0]), 'p11');
  assert.deepEqual(nearestByWords('the and of', PAGES), []);
});

test('ambiguous needs two real pages, or it falls back to not covered', () => {
  const two = verifySelection({ verdict: 'ambiguous', lead: '', picks: [], nearest: ['p10', 'p11'] }, PAGES, 'notes');
  assert.equal(two.verdict, 'ambiguous');
  assert.equal(two.nearest.length, 2);
  const one = verifySelection({ verdict: 'ambiguous', lead: '', picks: [], nearest: ['p10', 'p77'] }, PAGES, 'zzz');
  assert.equal(one.verdict, 'not_covered');
});

test('the model saying not covered wins over picks it also made', () => {
  const out = verifySelection({ verdict: 'not_covered', lead: '', picks: [{ page: 'p10', type: 'quote', quote: 'Fit notes are issued by the GP only' }] }, PAGES, QUESTION);
  assert.equal(out.verdict, 'not_covered');
});