// The blood form: the tests that get ticked, the Ordered Items list that is
// actually sent, and the Clinical Details line the laboratory reads.
//
// What this file protects is the part that cannot be allowed to drift: the
// recorded form is the one the practice sent, Ordered Items reads back exactly
// what is ticked, Clinical Details carries the type of health check — and a
// review the practice has recorded NO form for is never answered with the
// health-check panel wearing its name.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BLOOD_FORMS, FORM_SECTIONS, bloodForm, bloodFormAnswer, clinicalDetails, findRecordedBloods, formItem,
} from '../lib/templates/bloods.mjs';
import { SELECTION_SCHEMA, renderSelection, selectionPrompt } from '../lib/templates/route.mjs';
import { answerToText } from '../lib/questions/flatten.mjs';

const screen = (card) => card.blocks.find((b) => b.type === 'pathology');

// The practice's own page, in the shape the Notebook holds it. The array in
// bloods.mjs holds ONE filled-in form; the practice writes down more than it
// sends screenshots of, and "no form recorded" about something they wrote down
// is worse than a gap.
const BLOODS_PAGE = {
  docTitle: 'Notebook: Nurse / Blood tests before a review',
  text: `Reviews that need the bloods first. Book them before 1pm.

- Mental health review — FBC, U&E, LFT, lipids, HbA1c
- Diabetes review — HbA1c, U&E, lipids, Urine Albumin Creatinine Ratio`,
};

// Mentioning a review is not listing its bloods.
const PROSE_PAGE = {
  docTitle: 'Notebook: Front desk / Clinics',
  text: 'Mental health review clinics run on Tuesdays. Blood tests are taken in the morning.',
};

// The form as it was filled in on the screen the feature was built from.
const HEALTH_CHECK = [
  'Electrolytes + Creatinine',
  'Liver Profile (LFT)',
  'TFTs - Free T4 & TSH',
  'Full Blood Count (FBC)',
];

test('the health check comes back as the screen, filled in', () => {
  const card = bloodFormAnswer({ check: 'NHS Health Check' });
  assert.equal(card.title, 'Blood form');

  const form = screen(card);
  assert.ok(form, 'the card has no pathology screen on it');

  // Ordered Items is what is actually sent, in the order the screen lists it.
  assert.deepEqual(form.ordered, HEALTH_CHECK);

  // And every one of them is ticked somewhere, under the screen's own section.
  const ticked = form.groups.flatMap((g) => g.tests);
  assert.deepEqual([...ticked].sort(), [...HEALTH_CHECK].sort());
  assert.deepEqual(form.groups.map((g) => g.heading), ['Biochemistry 1', 'Biochemistry 2', 'Haematology']);

  // The box that is otherwise left empty.
  assert.equal(form.clinicalDetails, 'NHS Health Check');
  assert.equal(card.flag, undefined, 'a recorded form is not a gap');
});

test('Clinical Details is the type of health check, in the reader’s own words', () => {
  assert.equal(clinicalDetails('bloods for an NHS Health Check'), 'NHS Health Check');
  assert.equal(clinicalDetails('new patient health check'), 'New patient health check');
  assert.equal(clinicalDetails('CVS'), 'CVS');
  // A question about the form names no check at all, which is not the same as
  // naming one nobody has recorded.
  assert.equal(clinicalDetails('blood form'), '');
  assert.equal(clinicalDetails(''), '');
});

test('no check named: the one recorded form, said to be that one', () => {
  for (const asked of ['', 'blood form', 'what goes on a blood test form']) {
    const card = bloodFormAnswer({ check: asked });
    const form = screen(card);
    assert.deepEqual(form.ordered, HEALTH_CHECK, JSON.stringify(asked));
    assert.equal(form.clinicalDetails, BLOOD_FORMS[0].clinicalDetails, JSON.stringify(asked));
    assert.match(card.subtitle, /health check/i, JSON.stringify(asked));
    // And it says which form this is, rather than letting it read as the panel
    // for every review.
    assert.match(answerToText(card), /the blood form the practice has recorded/i, JSON.stringify(asked));
  }
});

test('a review nobody has written down ticks nothing, and is flagged', () => {
  for (const asked of ['learning disability review', 'at-risk review']) {
    const card = bloodFormAnswer({ check: asked });
    const form = screen(card);

    // The whole point. A wrong tick is a patient bled for the wrong test.
    assert.deepEqual(form.ordered, [], asked + ': something was ordered');
    assert.deepEqual(form.groups, [], asked + ': something was ticked');

    // But the reader is not sent away empty-handed: with nothing ticked, the
    // form's own boxes are drawn in the screen itself, to find the ones the
    // request names by their exact wording. That is what was being asked.
    assert.deepEqual(form.offered, FORM_SECTIONS, asked + ': the form’s own list is missing');

    // The line still gets filled in: the laboratory reads it either way.
    assert.match(form.clinicalDetails, /review/i, asked);
    // And the practice hears about the gap rather than it being met with a shrug.
    assert.match(card.flag, /No bloods recorded for/i, asked);
  }
});

test('a review the Notebook lists the bloods for is answered from the page', () => {
  const card = bloodFormAnswer({ check: 'mental health review', pages: [BLOODS_PAGE] });
  const form = screen(card);

  // The page's own words, in the box that gets sent.
  assert.deepEqual(form.ordered, ['FBC', 'U&E', 'LFT', 'lipids', 'HbA1c']);

  // And the boxes those names unambiguously name, ticked under the form's own
  // sections. "U&E", "lipids" and "HbA1c" name no single box, so nothing is
  // ticked for them — they stay on the list for the reader to settle.
  assert.deepEqual(form.groups, [
    { heading: 'Biochemistry 1', tests: ['Liver Profile (LFT)'] },
    { heading: 'Haematology', tests: ['Full Blood Count (FBC)'] },
  ]);

  // Where it came from, on the card and in the sources, with the line quoted.
  const text = answerToText(card);
  assert.match(text, /Notebook: Nurse \/ Blood tests before a review/);
  assert.match(text, /Mental health review — FBC, U&E, LFT, lipids, HbA1c/);
  assert.equal(card.source[0], BLOODS_PAGE.docTitle);

  // A page that lists it is not a gap.
  assert.equal(card.flag, undefined);

  // The ticks are the answer here, so the screen is not padded out with the
  // other twenty-six boxes — they go behind a disclosure, for "U&E" and
  // "HbA1c", which named no single box and so ticked nothing.
  assert.deepEqual(form.offered, []);
  const rest = card.blocks.find((b) => b.type === 'expand' && /Every box on the form/.test(b.label));
  assert.ok(rest, 'the rest of the form is nowhere');
  const rows = rest.blocks.find((b) => b.type === 'table');
  assert.deepEqual(rows.rows.map((r) => r[0]), FORM_SECTIONS.map((f) => f.heading));
  assert.match(rows.rows.map((r) => r[1]).join(' '), /Urine Albumin Creatinine Ratio/);
});

test('a page that only mentions the review has not listed its bloods', () => {
  const card = bloodFormAnswer({ check: 'mental health review', pages: [PROSE_PAGE] });
  assert.deepEqual(screen(card).ordered, []);
  assert.match(card.flag, /No bloods recorded for/i);
});

test('the Notebook is read in both shapes people write it in', () => {
  // On the line.
  const inline = findRecordedBloods({ check: 'diabetes review', pages: [BLOODS_PAGE] });
  assert.deepEqual(inline.tests, ['HbA1c', 'U&E', 'lipids', 'Urine Albumin Creatinine Ratio']);
  assert.equal(inline.page, BLOODS_PAGE.docTitle);

  // Listed under it.
  const under = findRecordedBloods({
    check: 'at-risk review',
    pages: [{
      docTitle: 'Notebook: Nurse / At-risk bloods',
      text: '### At-risk review\nBlood tests to order first:\n\n- Haemoglobin A1c\n- Lipid Profile\n- Electrolytes + Creatinine\n\nBook the review once they are back.',
    }],
  });
  assert.deepEqual(under.tests, ['Haemoglobin A1c', 'Lipid Profile', 'Electrolytes + Creatinine']);

  // And those three each name exactly one box, so all three are ticked — in
  // the form's own order, not the page's, because that is how the reader's eye
  // goes down the screen.
  const card = bloodFormAnswer({
    check: 'at-risk review',
    pages: [{
      docTitle: 'Notebook: Nurse / At-risk bloods',
      text: '### At-risk review\nBlood tests to order first:\n\n- Haemoglobin A1c\n- Lipid Profile\n- Electrolytes + Creatinine',
    }],
  });
  assert.deepEqual(screen(card).groups, [
    { heading: 'Biochemistry 1', tests: ['Electrolytes + Creatinine', 'Lipid Profile', 'Haemoglobin A1c'] },
  ]);
});

test('the health-check panel never answers a review that says its words', () => {
  // "Mental health check" contains "health check". Answering it with the
  // health-check panel is the exact mistake this file is arranged to avoid.
  for (const asked of ['mental health check', 'learning disability health check', 'diabetic check']) {
    assert.equal(bloodForm(asked), null, asked + ' matched the health check');
    const form = screen(bloodFormAnswer({ check: asked }));
    assert.deepEqual(form.ordered, [], asked);
    assert.deepEqual(form.groups, [], asked);
  }
});

test('a name only ticks a box when it names exactly one', () => {
  // The form's own bracketed abbreviation settles the common ones.
  assert.equal(formItem('FBC'), 'Full Blood Count (FBC)');
  assert.equal(formItem('LFT'), 'Liver Profile (LFT)');
  assert.equal(formItem('Lipid Profile'), 'Lipid Profile');
  assert.equal(formItem('ferritin'), 'Ferritin Only');

  // "TSH" is in two boxes and they are different tests. Two matches is a
  // question, not a near miss, and nothing is ticked on a guess.
  assert.equal(formItem('TSH'), null);
  // Nothing invented for a name the form does not carry.
  assert.equal(formItem('U&E'), null);
  assert.equal(formItem('HbA1c'), null);
  assert.equal(formItem(''), null);
});

test('the timing and age gates are on every card, from the practice’s own gates', () => {
  const text = answerToText(bloodFormAnswer({ check: 'NHS Health Check' }));
  assert.match(text, /before 13:00/, 'the before-1pm gate is missing');
  assert.match(text, /Under 16/, 'the paediatric phlebotomy gate is missing');
  // The reviews that cannot be booked until the bloods are back.
  assert.match(text, /Diabetes reviews/);
  assert.match(text, /New patient health checks/);
});

test('the screen survives being written into the question log', () => {
  const text = answerToText(bloodFormAnswer({ check: 'NHS Health Check' }));
  // Ordered Items is what went off to the laboratory, so the log holds it in
  // full rather than a note that a picture of a screen was shown.
  assert.match(text, /Ordered items: Electrolytes \+ Creatinine, Liver Profile \(LFT\), TFTs - Free T4 & TSH, Full Blood Count \(FBC\)/);
  assert.match(text, /Clinical details: NHS Health Check/);
  assert.match(text, /Biochemistry 1: Electrolytes \+ Creatinine, Liver Profile \(LFT\)/);
});

test('the picker can choose it, and the choice renders the card', () => {
  // The template is on the schema the model fills in...
  const templates = SELECTION_SCHEMA.shape.template._def.values;
  assert.ok(templates.includes('bloodForm'), 'bloodForm is not a template the picker may choose');

  // ...and the field it fills in beside it.
  assert.ok(SELECTION_SCHEMA.shape.healthCheck, 'there is nothing to say which check it is');

  // ...and it is described to the model, so choosing it is possible at all.
  const prompt = selectionPrompt({ question: 'what bloods for an NHS health check', notebook: '' });
  assert.match(prompt, /"bloodForm"/);

  const card = renderSelection(
    { template: 'bloodForm', healthCheck: 'new patient health check' },
    'what bloods do I order for a new patient health check',
  );
  assert.equal(card.title, 'Blood form');
  assert.deepEqual(screen(card).ordered, HEALTH_CHECK);
  assert.equal(screen(card).clinicalDetails, 'New patient health check');
});

test('the recorded form matches by name however it is asked for', () => {
  for (const asked of ['NHS health check', 'new patient check', 'well woman check', 'CVS', 'health check bloods']) {
    assert.ok(bloodForm(asked), asked + ' matched no recorded form');
  }
  assert.equal(bloodForm('diabetes review'), null);
  assert.equal(bloodForm(''), null);
});
