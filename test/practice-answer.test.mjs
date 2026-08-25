import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groundPracticeAnswer, practiceAnswerPrompt, practiceSources, withoutEllipsis,
} from '../lib/agent/practice-answer.mjs';

// /practice used to print the passages search found, cut at 700 characters and
// finished with " […]". It is a written answer now, and these are the rules
// that make that safe: what is left on the card is what the documents were
// found to say, and nothing on it trails off.

const COMPLAINTS = {
  docId: 'document:complaints',
  docTitle: 'Complaints procedure',
  section: 'Timescales',
  text: 'A complaint must be acknowledged within three working days of receipt. '
    + 'The practice will respond in full within twenty working days, and where that is not '
    + 'possible the complainant is told why and given a new date.',
  view: null,
  images: [],
};
const RETENTION = {
  docId: 'document:retention',
  docTitle: 'Records retention policy',
  section: 'Schedule',
  text: 'Complaint records are kept separately from the health record and retained for ten years.',
  view: null,
  images: [],
};

test('an ellipsis never survives, whatever shape it arrives in', () => {
  // A bracketed one is the search's punctuation, not the document's: it goes,
  // and takes nothing with it. A trailing one ended a real sentence, so the
  // sentence is closed rather than left hanging.
  assert.equal(withoutEllipsis('Acknowledge within three days […]'), 'Acknowledge within three days');
  assert.equal(withoutEllipsis('Respond in full ...'), 'Respond in full.');
  assert.equal(withoutEllipsis('Tell them why (…) and give a date'), 'Tell them why and give a date');
  assert.equal(withoutEllipsis('Say why…'), 'Say why.');
});

test('one document cannot fill the whole read', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ ...COMPLAINTS, text: COMPLAINTS.text + ' ' + i }));
  const { extracts } = practiceSources([...many, RETENTION]);
  assert.equal(extracts.filter((ex) => ex.title === 'Complaints procedure').length, 3);
  assert.ok(extracts.some((ex) => ex.title === 'Records retention policy'));
});

test('the sources are numbered, and the prompt hands them over with the question', () => {
  const { extracts } = practiceSources([COMPLAINTS, RETENTION]);
  const prompt = practiceAnswerPrompt({ question: 'how long do we have to answer a complaint?', extracts });
  assert.match(prompt, /Source 1 \[Complaints procedure — Timescales\]/);
  assert.match(prompt, /Source 2 \[Records retention policy/);
  assert.match(prompt, /how long do we have to answer a complaint\?/);
});

test('a part that quotes its source verbatim is kept, with the source on it', () => {
  const { refMap } = practiceSources([COMPLAINTS, RETENTION]);
  const grounded = groundPracticeAnswer({
    written: {
      answerable: true,
      intro: 'Acknowledge within three working days and answer in full within twenty.',
      sections: [{
        heading: 'Timescales',
        markdown: 'Acknowledge the complaint within **three working days**.',
        source: 1,
        quote: 'acknowledged within three working days of receipt',
        critical: false,
      }],
    },
    refMap,
  });
  assert.equal(grounded.sections.length, 1);
  assert.equal(grounded.sections[0].basis, 'documents');
  assert.equal(grounded.sections[0].cite.docTitle, 'Complaints procedure');
  assert.equal(grounded.citations.length, 1);
});

test('a part whose words are not in any source is dropped, not shown', () => {
  const { refMap } = practiceSources([COMPLAINTS]);
  const grounded = groundPracticeAnswer({
    written: {
      answerable: true,
      intro: 'Acknowledge within three working days.',
      sections: [
        {
          heading: '',
          markdown: 'Acknowledge within three working days.',
          source: 1,
          quote: 'acknowledged within three working days of receipt',
          critical: false,
        },
        {
          heading: 'Escalation',
          markdown: 'Send unresolved complaints to the integrated care board after six weeks.',
          source: 1,
          quote: 'unresolved complaints are escalated to the integrated care board after six weeks',
          critical: true,
        },
      ],
    },
    refMap,
  });
  assert.equal(grounded.sections.length, 1);
  assert.equal(grounded.sections[0].markdown, 'Acknowledge within three working days.');
});

test('a wrongly numbered source is corrected to the one that holds the words', () => {
  const { refMap } = practiceSources([COMPLAINTS, RETENTION]);
  const grounded = groundPracticeAnswer({
    written: {
      answerable: true,
      intro: 'Complaint records are kept for ten years.',
      sections: [{
        heading: '',
        markdown: 'Keep complaint records for **ten years**, separately from the health record.',
        source: 1,
        quote: 'kept separately from the health record and retained for ten years',
        critical: false,
      }],
    },
    refMap,
  });
  assert.equal(grounded.sections[0].cite.docTitle, 'Records retention policy');
});

test('redaction runs over what was written, before it is grounded', () => {
  const { refMap } = practiceSources([COMPLAINTS]);
  const grounded = groundPracticeAnswer({
    written: {
      answerable: true,
      intro: 'Ring 020 7000 0000 […]',
      sections: [],
    },
    refMap,
    redact: (t) => String(t).replace(/020 7000 0000/, '(see contacts below)'),
  });
  assert.equal(grounded.intro, 'Ring (see contacts below)');
});
