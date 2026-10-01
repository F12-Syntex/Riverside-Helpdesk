import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanPage, groupQuestions, pagePath, rewriteWarnings, routePrompt, writePrompt,
} from '../lib/questions/writein.mjs';

const NOTES = [
  { id: 1, parentId: null, title: 'Reception', body: '', isSection: true },
  { id: 2, parentId: 1, title: 'Home visits', body: 'Requests before 10am go to the <span data-q="k3v9x2m7qa">duty doctor</span>.' },
  { id: 3, parentId: 1, title: 'Referrals', body: 'Podiatry: refer on the e-RS form.' },
  { id: 4, parentId: 1, title: 'Old section', body: '', isSection: true },
];
const byId = new Map(NOTES.map((n) => [n.id, n]));

test('a page path runs from its section down', () => {
  assert.equal(pagePath(NOTES[1], byId), 'Reception / Home visits');
});

test('a Notebook question goes back to its own page, whatever the model says', () => {
  const groups = groupQuestions(
    [{ id: 10, origin: 'notebook', noteId: 2, question: 'Which doctor?', answer: 'The on-call GP.' }],
    [{ id: 10, noteId: 3, newTitle: '' }],
    NOTES,
  );
  assert.deepEqual(groups.map((g) => [g.key, g.noteId]), [['note:2', 2]]);
});

test('other questions go where the model placed them, grouped by page', () => {
  const groups = groupQuestions(
    [
      { id: 11, origin: 'asked', question: 'Podiatry form?', answer: 'e-RS.' },
      { id: 12, origin: 'assistant', question: 'Podiatry wait?', answer: '12 weeks.' },
    ],
    [{ id: 11, noteId: 3, newTitle: '' }, { id: 12, noteId: 3, newTitle: '' }],
    NOTES,
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].noteId, 3);
  assert.deepEqual(groups[0].questions.map((q) => q.id), [11, 12]);
});

test('no page, a section, or no placement at all becomes a new page — never dropped', () => {
  const groups = groupQuestions(
    [
      { id: 13, origin: 'asked', question: 'Who orders flu jabs?', answer: 'The practice manager.' },
      { id: 14, origin: 'asked', question: 'Flu jab stock?', answer: 'Checked on Mondays.' },
      { id: 15, origin: 'asked', question: 'Where is the fire exit?', answer: 'Behind reception.' },
      { id: 16, origin: 'notebook', noteId: 99, question: 'Gone page?', answer: 'Yes.' },
    ],
    [
      { id: 13, noteId: null, newTitle: 'Flu vaccines' },
      { id: 14, noteId: null, newTitle: 'flu  vaccines' },
      { id: 15, noteId: 4, newTitle: '' },
    ],
    NOTES,
  );
  assert.deepEqual(groups.map((g) => [g.noteId, g.questions.length]), [[null, 2], [null, 1], [null, 1]]);
  assert.equal(groups[0].title, 'Flu vaccines');
  assert.equal(groups[1].title, 'Where is the fire exit');
  assert.equal(groups.reduce((n, g) => n + g.questions.length, 0), 4);
});

test('the prompts carry the page and every answer', () => {
  const edit = writePrompt({ title: 'Referrals', body: NOTES[2].body, questions: [{ question: 'Wait?', answer: '12 weeks.' }] });
  assert.ok(edit.includes('Podiatry: refer on the e-RS form.'));
  assert.ok(edit.includes('Answer: 12 weeks.'));
  assert.ok(edit.includes('the answer is correct'));
  const fresh = writePrompt({ title: 'Flu vaccines', body: '', questions: [{ question: 'Who?', answer: 'The manager.' }] });
  assert.ok(fresh.includes('Write a new page titled "Flu vaccines"'));
  const route = routePrompt([{ id: 3, path: 'Reception / Referrals', body: NOTES[2].body }], [{ id: 11, question: 'Form?', answer: 'e-RS' }]);
  assert.ok(route.includes('3 | Reception / Referrals | Podiatry: refer on the e'));
  assert.ok(route.includes('11. Q: Form?'));
});

test('a fenced reply is unwrapped', () => {
  assert.equal(cleanPage('```markdown\n## A\n\ntext\n```'), '## A\n\ntext');
});

test('a rewrite that loses a number or most of the page is flagged', () => {
  const before = 'Call 0207 123 4567 before 10:30. ' + 'Long text. '.repeat(30);
  assert.deepEqual(rewriteWarnings(before, before + ' New fact.', []), []);
  const lost = rewriteWarnings(before, 'Call before 10:30. ' + 'Long text. '.repeat(30), []);
  assert.equal(lost.length, 1);
  assert.match(lost[0], /02071234567/);
  // A number the answer itself brings in is not "lost" when it replaces one.
  assert.deepEqual(rewriteWarnings('Ring 0207 111 2222.', 'Ring 0207 333 4444.', [{ answer: '0207 333 4444' }]).length, 1);
  assert.match(rewriteWarnings(before, 'Short.', [])[0], /much shorter/);
  assert.deepEqual(rewriteWarnings(before, '   ', []), ['The rewrite came back empty.']);
});
