import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasQuestionAnchor, isQuestionAnchor, newQuestionAnchor, questionAnchorsIn, questionQuote, stripQuestionMarks,
} from '../lib/notebook/questions.mjs';

const PAGE = [
  '## Home visits',
  '',
  'Requests before 10am go to the <span data-q="k3v9x2m7qa">duty doctor</span> by task.',
  '',
  'Ring <span style="color:#d5281b"><span data-q="ab12cd34ef">999 for chest pain</span></span> and never book it.',
  '',
  '<span data-q="ab12cd34ef">Same question, second paragraph</span> with <span style="color:#007f3b">green</span> after.',
].join('\n');

test('a fresh anchor is ten lowercase letters and digits', () => {
  const a = newQuestionAnchor();
  assert.match(a, /^[a-z0-9]{10}$/);
  assert.ok(isQuestionAnchor(a));
  assert.notEqual(a, newQuestionAnchor());
});

test('only anchors of our own shape count', () => {
  assert.ok(!isQuestionAnchor(''));
  assert.ok(!isQuestionAnchor('a"]{x}'));
  assert.ok(!isQuestionAnchor('ABCDEF12'));
  assert.deepEqual(questionAnchorsIn('<span data-q="no">x</span> <span data-q="x}y{z">y</span>'), []);
});

test('the anchors on a page come back once each, in order', () => {
  assert.deepEqual(questionAnchorsIn(PAGE), ['k3v9x2m7qa', 'ab12cd34ef']);
  assert.ok(hasQuestionAnchor(PAGE, 'k3v9x2m7qa'));
  assert.ok(!hasQuestionAnchor(PAGE, 'zzzzzzzzzz'));
  assert.deepEqual(questionAnchorsIn('No questions here.'), []);
});

test('stripping keeps every word and every colour, and loses only the markers', () => {
  const out = stripQuestionMarks(PAGE);
  assert.ok(!out.includes('data-q'));
  assert.ok(out.includes('Requests before 10am go to the duty doctor by task.'));
  assert.ok(out.includes('Ring <span style="color:#d5281b">999 for chest pain</span> and never book it.'));
  assert.ok(out.includes('Same question, second paragraph with <span style="color:#007f3b">green</span> after.'));
});

test('a colour inside a marker keeps its own closing tag', () => {
  const body = 'A <span data-q="k3v9x2m7qa">b <span style="color:#005eb8">c</span> d</span> e';
  assert.equal(stripQuestionMarks(body), 'A b <span style="color:#005eb8">c</span> d e');
});

test('a page with no markers comes back untouched', () => {
  const body = 'Plain <span style="color:#d5281b">red</span> text </span>';
  assert.equal(stripQuestionMarks(body), body);
});

test('the quote is the marked words as plain text, across every segment', () => {
  assert.equal(questionQuote(PAGE, 'k3v9x2m7qa'), 'duty doctor');
  assert.equal(questionQuote(PAGE, 'ab12cd34ef'), '999 for chest pain Same question, second paragraph');
  assert.equal(questionQuote('A <span data-q="k3v9x2m7qa">**bold** <span style="color:red">red</span></span>', 'k3v9x2m7qa'), 'bold red');
  assert.equal(questionQuote(PAGE, 'missing123'), '');
});
