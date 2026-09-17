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

import { BLOOD_FORMS, bloodForm, bloodFormAnswer, clinicalDetails } from '../lib/templates/bloods.mjs';
import { SELECTION_SCHEMA, renderSelection, selectionPrompt } from '../lib/templates/route.mjs';
import { answerToText } from '../lib/questions/flatten.mjs';

const screen = (card) => card.blocks.find((b) => b.type === 'pathology');

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

test('a review with no recorded form ticks nothing, and is flagged', () => {
  for (const asked of ['diabetes review', 'learning disability review', 'mental health review']) {
    const card = bloodFormAnswer({ check: asked });
    const form = screen(card);

    // The whole point. A wrong tick is a patient bled for the wrong test.
    assert.deepEqual(form.ordered, [], asked + ': something was ordered');
    assert.deepEqual(form.groups, [], asked + ': something was ticked');
    for (const test of HEALTH_CHECK) {
      assert.ok(!answerToText(card).includes(test), asked + ': the health-check panel leaked onto it');
    }

    // The line still gets filled in: the laboratory reads it either way.
    assert.match(form.clinicalDetails, /review/i, asked);
    // And the practice hears about the gap rather than it being met with a shrug.
    assert.match(card.flag, /No blood form recorded for/i, asked);
  }
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
