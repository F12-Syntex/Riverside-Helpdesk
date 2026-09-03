// /medication: a repeat-medication screen read off a screenshot and laid out
// for the AccurX repeat prescription form. The picture is read by a model; the
// card is built here, so what this file protects is the shape — the screen's
// own headings, one Copy per medication, numbered the way the form numbers its
// boxes — and that nothing is reworded on the way through.
import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMAND_SCHEMAS, commandPrompt, renderCommand } from '../lib/templates/route.mjs';
import { repeatMedicationAnswer, MEDICATION_READ_RULES } from '../lib/templates/medication.mjs';
import { commandByName, parseCommand } from '../lib/commands.mjs';
import { answerToText } from '../lib/questions/flatten.mjs';
import { field } from '../lib/templates/blocks.mjs';

// The screen in the screenshot the feature was built from.
const SCREEN = {
  groups: [
    {
      heading: 'Repeat',
      medications: [
        { name: 'Citalopram 20mg tablets', dose: 'One To Be Taken Each Day after food', quantity: '28 tablet' },
        { name: 'Mirtazapine 45mg tablets', dose: 'One To Be Taken At Night', quantity: '28 tablet' },
        { name: 'Citalopram 10mg tablets', dose: 'One To Be Taken Each Day', quantity: '28 tablet' },
      ],
    },
    {
      heading: 'Variable use repeat',
      medications: [
        { name: 'Naproxen 250mg tablets', dose: '1 OR 2 THREE TIMES A DAY AFTER FOOD', quantity: '56 tablet' },
        { name: 'Co-codamol 30mg/500mg tablets', dose: 'One Or Two To Be Taken UPTO Four Times A Day', quantity: '30 tablet' },
      ],
    },
  ],
};

test('the screen comes back as its own headings, one Copy per medication', () => {
  const card = renderCommand('repeatMedication', SCREEN, 'Please look at the attached image.');
  assert.equal(card.title, 'Repeat prescription request');
  assert.match(card.subtitle, /5 medications/);

  const panels = card.blocks.filter((b) => b.type === 'fields');
  assert.deepEqual(panels.map((p) => p.title), ['Repeat', 'Variable use repeat']);
  assert.equal(panels[0].items.length, 3);
  assert.equal(panels[1].items.length, 2);

  // Every row: the drug-strength-form is the value and carries its own Copy;
  // the directions and quantity sit under it, outside the Copy.
  const first = panels[0].items[0];
  assert.equal(first.value, 'Citalopram 20mg tablets');
  assert.equal(first.copy, true);
  assert.equal(first.hint, 'One To Be Taken Each Day after food · 28 tablet');
  for (const p of panels) for (const item of p.items) assert.equal(item.copy, true, item.value + ' has no Copy');

  // Numbered straight through, the way the AccurX form numbers its boxes.
  assert.deepEqual(panels.flatMap((p) => p.items.map((i) => i.label)),
    ['Medication 1', 'Medication 2', 'Medication 3', 'Medication 4', 'Medication 5']);

  // And all of them at once, one per line, for the "anything else" box.
  const all = card.blocks.find((b) => b.type === 'message');
  assert.equal(all.text, [
    'Citalopram 20mg tablets', 'Mirtazapine 45mg tablets', 'Citalopram 10mg tablets',
    'Naproxen 250mg tablets', 'Co-codamol 30mg/500mg tablets',
  ].join('\n'));

  // Nothing was reworded: the capitals the screen used survive.
  assert.match(JSON.stringify(card), /UPTO Four Times A Day/);
  assert.match(JSON.stringify(card), /1 OR 2 THREE TIMES A DAY AFTER FOOD/);
});

test('nothing read falls back to how the mode is used, never to an invented list', () => {
  for (const values of [{}, { groups: [] }, { groups: [{ heading: 'Repeat', medications: [{ name: '', dose: 'once a day' }] }] }]) {
    const card = renderCommand('repeatMedication', values, '');
    assert.ok(card && card.title, 'a card still answers');
    assert.notEqual(card.title, 'Repeat prescription request');
    assert.equal(card.blocks.some((b) => b.type === 'fields' && b.items.some((i) => i.copy)), false, 'nothing to copy');
  }
});

test('the rows are cleaned but not rewritten', () => {
  const card = renderCommand('repeatMedication', {
    groups: [
      { heading: '  ', medications: [{ name: '  Aspirin   75mg tablets ', dose: '', quantity: '' }] },
      { heading: 'Acute', medications: [] },
    ],
  }, '');
  const panels = card.blocks.filter((b) => b.type === 'fields');
  // The empty group is gone; the group with no heading is a panel with none.
  assert.equal(panels.length, 1);
  assert.equal(panels[0].title, '');
  assert.equal(panels[0].items[0].value, 'Aspirin 75mg tablets');
  // No directions on the screen: no hint on the row, rather than an empty one.
  assert.equal(panels[0].items[0].hint, undefined);
  assert.match(card.subtitle, /1 medication /);
});

test('a hint is only on a field that carries one, and reaches the log', () => {
  assert.deepEqual(field('A', 'b'), { label: 'A', value: 'b', missing: '' });
  assert.deepEqual(field('A', 'b', { hint: 'c' }), { label: 'A', value: 'b', missing: '', hint: 'c' });
  const text = answerToText(repeatMedicationAnswer({
    groups: [{ heading: 'Repeat', medications: [{ name: 'Citalopram 20mg tablets', dose: 'One To Be Taken Each Day', quantity: '28 tablet' }] }],
  }));
  assert.match(text, /Medication 1: Citalopram 20mg tablets \(One To Be Taken Each Day · 28 tablet\)/);
});

test('the prompt says a screenshot is attached, and hands over the reading rules', () => {
  const withPicture = commandPrompt({ template: 'repeatMedication', question: 'Please look at the attached image.', images: 1 });
  assert.match(withPicture, /Attached is a screenshot of a patient’s repeat medication screen/);
  assert.match(withPicture, /NOT writing the answer/);
  for (const rule of MEDICATION_READ_RULES) assert.ok(withPicture.includes('- ' + rule), 'rule missing: ' + rule.slice(0, 40));
  assert.match(withPicture, /placeholder/);
  // Typed instead: the message is the list.
  const typed = commandPrompt({ template: 'repeatMedication', question: 'Citalopram 20mg tablets', images: 0 });
  assert.match(typed, /The message below lists a patient’s medications/);
  assert.doesNotMatch(typed, /Attached is a screenshot/);
  // The schema the model fills is the shape the renderer reads.
  const parsed = COMMAND_SCHEMAS.repeatMedication.parse(SCREEN);
  assert.equal(parsed.groups[1].medications[1].name, 'Co-codamol 30mg/500mg tablets');
});

test('/medication is a command, a mode, and answers to /meds', () => {
  assert.equal(commandByName('medication').template, 'repeatMedication');
  assert.equal(commandByName('meds').name, 'medication');
  assert.equal(commandByName('medication').icon, 'pill');
  assert.equal(parseCommand('/meds Citalopram 20mg tablets').command.name, 'medication');
});
