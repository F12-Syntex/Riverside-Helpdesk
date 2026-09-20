import test from 'node:test';
import assert from 'node:assert/strict';
import { runRules, healthOf, typedOf, LABELS } from '../lib/notebook/rules.mjs';
import { splitSentences } from '../lib/notebook/sentences.mjs';

const page = (path, text) => ({ docTitle: 'Notebook: ' + path, text, images: [] });
const ctxFor = (path, text, extra = {}) => {
  const p = page(path, text);
  return { note: { id: 1, title: path.split(' / ').pop(), body: text }, path: path.split(' / '), page: p, sentences: splitSentences(text), typed: typedOf(p), dupIndex: null, ...extra };
};
const rulesOf = (ctx) => runRules(ctx).map((v) => v.rule);

test('a well-formed pathway page passes every rule', () => {
  const ctx = ctxFor('Referrals / Referral pathways / Hernia', 'Speciality: Not Otherwise Specified\nClinic type: Hernias\nHospital: Homerton University Hospital\n\nThe doctor names the side in the letter, and the letter goes on e-RS as usual.');
  assert.deepEqual(rulesOf(ctx), []);
  assert.equal(healthOf(runRules(ctx)).band, 'green');
});

test('label-vocab: aliases are named, and it is silent off pathway pages', () => {
  const bad = ctxFor('Referrals / Referral pathways / Physio', '- **Location:** St Leonard\'s\n- **Clinic:** Not otherwise specified\n- **Speciality:** ESP\n\nBook it on e-RS in the usual way, deferring the appointment booking step.');
  const out = runRules(bad).filter((v) => v.rule === 'label-vocab');
  assert.equal(out.length, 2);
  assert.match(out[0].message, /Hospital/);
  assert.match(out[1].message, /Clinic type/);
  const off = ctxFor('Reception / Notes', 'Location: front desk\nThis is not a pathway page and its labels are its own business, whatever they are.');
  assert.ok(!rulesOf(off).includes('label-vocab'));
  assert.ok(LABELS.includes('Clinic type'));
});

test('typed-parse is an error when a pathway page yields no record, and clear when it does', () => {
  const bad = ctxFor('Referrals / Referral pathways / Derm', 'Referrals for skin-related conditions go through Telederm, and the hospital chosen must contain Telederm.');
  assert.ok(runRules(bad).some((v) => v.rule === 'typed-parse' && v.severity === 'error'));
  const physio = ctxFor('Referrals / Referral pathways / Physiotherapy (FCP) and Extended Scope Physiotherapy', `#### Clinic Selection
- **Standard Physiotherapy**
  - **Clinic type:** Not otherwise specified
  - **Speciality:** Physiotherapy
  - **Location:** Any that don't include extended`);
  assert.ok(!rulesOf(physio).includes('typed-parse'));
});

test('inline-html, stray-bold, empty-section, stub, restatement, one-procedure, title-referral', () => {
  const html = ctxFor('Reception / A', '<span style="color:red">**Never**</span> do this.\\*\\*\nAnd a sentence long enough to not be a stub, with enough words in it to count.');
  assert.ok(rulesOf(html).includes('inline-html'));
  assert.ok(rulesOf(html).includes('stray-bold'));
  const empty = ctxFor('Reception / B', '## Booking\n\n## Cancelling\n\nRing the patient back before the end of the day and record the outcome on the record.');
  assert.ok(rulesOf(empty).includes('empty-section'));
  assert.equal(runRules(empty).filter((v) => v.rule === 'empty-section').length, 1);
  const stub = ctxFor('Reception / C', 'Ask reception.');
  assert.ok(rulesOf(stub).includes('stub'));
  const restate = ctxFor('Reception / D', 'Follow the standard referral process for this one and remember to mark the task as done afterwards.');
  assert.ok(rulesOf(restate).includes('restatement'));
  const two = ctxFor('Reception / E', '## First\n1. a\n2. b\n3. c\n## Second\n1. d\n2. e\n3. f\nAnd a closing sentence long enough to keep the page from being a stub at all.');
  assert.ok(rulesOf(two).includes('one-procedure'));
  const titled = ctxFor('Referrals / Referral pathways / Hernia referral', 'Speciality: X\nClinic type: Y\nAnd a closing sentence long enough to keep the page from being a stub at all.');
  assert.ok(rulesOf(titled).includes('title-referral'));
});

test('duplicate fires only for a long sentence found on another page', () => {
  const text = 'Paste the NHS number into the search box, then choose Refer or seek advice from the menu that appears.';
  const s = splitSentences(text);
  const dupIndex = new Map([[s[0].norm, [{ noteId: 1, sentenceId: 's1', title: 'Me' }, { noteId: 2, sentenceId: 's4', title: 'Other page' }]]]);
  const ctx = ctxFor('Reception / F', text, { dupIndex });
  const out = runRules(ctx).filter((v) => v.rule === 'duplicate');
  assert.equal(out.length, 1);
  assert.match(out[0].message, /Other page/);
  const alone = ctxFor('Reception / F', text, { dupIndex: new Map([[s[0].norm, [{ noteId: 1, sentenceId: 's1', title: 'Me' }]]]) });
  assert.ok(!rulesOf(alone).includes('duplicate'));
});

test('health bands follow the weights', () => {
  assert.equal(healthOf([]).band, 'green');
  assert.equal(healthOf([{ weight: 20 }]).band, 'amber');
  assert.equal(healthOf([{ weight: 45 }]).band, 'red');
  assert.equal(healthOf([{ weight: 500 }]).score, 0);
});


// THE ONE PAGE SHAPE THAT CAN ANSWER WITH THE OPPOSITE OF THE ANSWER. Four
// dermatology pathways typing the same speciality and clinic type, told apart
// only by which hospital to pick: the page cannot be addressed by its title, so
// which version a reader gets comes down to how their question was worded.
test('several versions of one referral on one page are flagged', () => {
  const page = {
    docTitle: 'Notebook: Referrals / Pathway cards (A to Z) / Dermatology and Telederm',
    text: `## Normal Dermatology

| Category | Specialty | Clinic Type | Hospital Selection Rule |
| --- | --- | --- | --- |
| Normal Dermatology | Dermatology | Not otherwise specified | First hospital that isn't a telederm |

## Normal Community Dermatology

| Category | Specialty | Clinic Type | Hospital Selection Rule |
| --- | --- | --- | --- |
| Normal Community | Dermatology | Not otherwise specified | First hospital that is a community hospital |
`,
  };
  const hit = runRules({ page, typed: typedOf(page), sentences: [] })
    .find((x) => x.rule === 'variants-one-page');
  assert.ok(hit, 'the clash must be reported');
  assert.match(hit.message, /Normal Dermatology, Normal Community/);

  // One pathway per page is what the rule is asking for, so it says nothing.
  const single = {
    docTitle: 'Notebook: Referrals / Pathway cards (A to Z) / Hernia',
    text: `Speciality: Not Otherwise Specified
Clinic type: Hernias`,
  };
  assert.ok(!runRules({ page: single, typed: typedOf(single), sentences: [] })
    .some((x) => x.rule === 'variants-one-page'));
});
