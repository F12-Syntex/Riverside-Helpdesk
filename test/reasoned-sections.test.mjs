import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDraft } from '../lib/agent/compose.mjs';
import { createEvidence } from '../lib/agent/evidence.mjs';

// The practice cannot write a page for every case. Its material often settles a
// question without answering it in the shape it was asked — two pages have to be
// put together, or a documented process applied to a case the page does not name
// — and reciting the nearest page instead is how a correct-looking answer misses
// the question.
//
// So a section may be the assistant's own working. What keeps that from becoming
// "answer anything and cite something" is checked here rather than asked for in
// the prompt: the premises must be real sources the turn actually read, working
// may never be the whole answer, and there may be at most one piece of it.

const QUOTE = 'A significant event is reported on the incident form within two working days of it happening.';

function evidenceWith(...chunks) {
  const evidence = createEvidence();
  for (const chunk of chunks) evidence.addPractice(chunk);
  return evidence;
}

const PAGE = {
  id: 'p1', docId: 'p1', docTitle: 'Significant events', section: 'Reporting one',
  text: QUOTE, view: null, images: [], kind: 'notebook',
};
const SECOND = {
  id: 'p2', docId: 'p2', docTitle: 'Duty of candour', section: 'When a patient was harmed',
  text: 'Where a patient came to harm the duty of candour applies and the practice manager is told the same day.',
  view: null, images: [], kind: 'notebook',
};

const grounded = () => ({
  heading: 'Report the event', markdown: '1. Open the **incident form**.\n2. Submit it within two working days.',
  basis: 'practice', ref: 'P1', quote: QUOTE,
});
const POINTS = [
  { text: 'Report it on the incident form.', ref: 'P1' },
  { text: 'Do it within two working days.', ref: 'P1' },
];

test('working built on real sources is kept, and carries them', () => {
  const draft = {
    sections: [grounded(), {
      heading: 'Applying that here',
      markdown: 'The Notebook sets out reporting; where the patient was harmed the duty of candour page also applies, so both the form and the practice manager are needed.',
      basis: 'reasoned', ref: '', quote: '', premises: ['P1', 'P2'],
    }],
    keyPoints: POINTS,
  };
  const { sections, problems } = validateDraft(draft, evidenceWith(PAGE, SECOND), 'A patient was harmed — what do I record?');
  const reasoned = sections.find((sec) => sec.basis === 'reasoned');
  assert.ok(reasoned, 'the reasoned section should survive');
  assert.deepEqual(reasoned.premises.map((p) => p.ref), ['P1', 'P2']);
  assert.equal(reasoned.premises[0].docTitle, 'Significant events');
  assert.equal(reasoned.cite, null);
  assert.deepEqual(problems, []);
});

test('working with no premises is dropped, not shown', () => {
  const draft = {
    sections: [grounded(), {
      heading: 'What I think', markdown: 'You should probably ring the hospital first.',
      basis: 'reasoned', ref: '', quote: '', premises: [],
    }],
    keyPoints: POINTS,
  };
  const { sections, problems } = validateDraft(draft, evidenceWith(PAGE), 'How do I report a significant event?');
  assert.equal(sections.length, 1);
  assert.equal(sections[0].basis, 'practice');
  assert.ok(problems.some((p) => /names no practice source/i.test(p)));
});

test('premises that are not real sources do not count', () => {
  // The failure this exists for: a conclusion with a citation shape around it.
  const draft = {
    sections: [grounded(), {
      heading: 'Applying that here', markdown: 'So the answer is to tell the practice manager.',
      basis: 'reasoned', ref: '', quote: '', premises: ['P7', 'P9'],
    }],
    keyPoints: POINTS,
  };
  const { sections, problems } = validateDraft(draft, evidenceWith(PAGE), 'How do I report a significant event?');
  assert.equal(sections.length, 1);
  assert.ok(problems.some((p) => /P7, P9 are not sources/i.test(p)));
});

test('an answer that is nothing but working is refused', () => {
  // Gap-filling wearing reasoning's clothes: the material does not cover the
  // question, so the model reached for the nearest thing it had. There are no
  // grounded sections under it, so there is nothing it can be reasoning FROM.
  const draft = {
    sections: [{
      heading: 'What to do', markdown: 'The practice has nothing on this hospital, but the usual process would apply.',
      basis: 'reasoned', ref: '', quote: '', premises: ['P1'],
    }],
    keyPoints: POINTS,
  };
  const { sections, problems } = validateDraft(draft, evidenceWith(PAGE), 'How do I report an event at St Elsewhere?');
  assert.deepEqual(sections, []);
  assert.ok(problems.some((p) => /nothing from the practice’s material under them/i.test(p)));
});

test('only one piece of working survives', () => {
  const reasoned = (n) => ({
    heading: 'Working ' + n, markdown: 'Step taken number ' + n + ', which follows from the significant events page.',
    basis: 'reasoned', ref: '', quote: '', premises: ['P1'],
  });
  const draft = { sections: [grounded(), reasoned(1), reasoned(2), reasoned(3)], keyPoints: POINTS };
  const { sections, problems } = validateDraft(draft, evidenceWith(PAGE), 'How do I report a significant event?');
  assert.equal(sections.filter((sec) => sec.basis === 'reasoned').length, 1);
  // The first one is the one kept — the later ones are what got trimmed.
  assert.equal(sections.find((sec) => sec.basis === 'reasoned').heading, 'Working 1');
  assert.ok(problems.some((p) => /more than one reasoned section/i.test(p)));
});

test('working is never shown in the red critical callout', () => {
  // Red means "the practice says this and it is unsafe to skip". An inference in
  // that box is exactly the blurring this section type exists to prevent.
  const draft = {
    sections: [grounded(), {
      heading: 'Applying that here', markdown: 'It follows that this one is urgent and must go the same day.',
      basis: 'reasoned', ref: '', quote: '', premises: ['P2'], critical: true,
    }],
    keyPoints: POINTS,
  };
  const { sections } = validateDraft(draft, evidenceWith(PAGE, SECOND), 'How do I report a significant event?');
  assert.equal(sections.find((sec) => sec.basis === 'reasoned').critical, false);
});

test('a key point may cite any source the working rests on', () => {
  const draft = {
    sections: [grounded(), {
      heading: 'Applying that here', markdown: 'A cancer referral goes the same way with the priority set to 2WW.',
      basis: 'reasoned', ref: '', quote: '', premises: ['P1', 'P2'],
    }],
    keyPoints: [
      { text: 'Send it on e-RS.', ref: 'P1' },
      { text: 'A suspected cancer referral goes the same day.', ref: 'P2' },
    ],
  };
  const { keyPoints } = validateDraft(draft, evidenceWith(PAGE, SECOND), 'How do I do a cancer referral?');
  assert.equal(keyPoints.length, 2);
});

test('searches that found nothing are recorded, and hits are not', () => {
  const evidence = createEvidence();
  evidence.addMiss('fit note');
  evidence.addMiss('  med3  ');
  evidence.addMiss('fit note');
  assert.deepEqual(evidence.missList(), ['fit note', 'med3']);

  const fresh = createEvidence();
  assert.deepEqual(fresh.missList(), []);
});
