import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINK_RE, linkTarget, stripLinks, splitSources } from '../app/_components/chat/links.mjs';

test('a path on this site is an internal link', () => {
  assert.deepEqual(linkTarget('/notebook/blood-tests-1286'), { kind: 'internal', href: '/notebook/blood-tests-1286' });
  assert.deepEqual(linkTarget('/notebook'), { kind: 'internal', href: '/notebook' });
  assert.deepEqual(linkTarget('/ask?q=x#top'), { kind: 'internal', href: '/ask?q=x#top' });
  assert.deepEqual(linkTarget('  /notebook/x-1  '), { kind: 'internal', href: '/notebook/x-1' });
});

test('an https address is an external link', () => {
  assert.deepEqual(linkTarget('https://www.nhs.uk'), { kind: 'external', href: 'https://www.nhs.uk/' });
  assert.deepEqual(linkTarget('HTTPS://www.nhs.uk/conditions'), { kind: 'external', href: 'https://www.nhs.uk/conditions' });
});

test('anything else stays plain text', () => {
  for (const bad of [
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
    'http://www.nhs.uk',
    'mailto:someone@nhs.net',
    'tel:02070000000',
    'ftp://example.com',
    '//evil.example/notebook',
    '/\\evil.example',
    '/notebook/a\\b',
    '/note book',
    '/notebook/\tx',
    '/notebook/\u0000x',
    'notebook/blood-tests-1',
    './notebook',
    '../notebook',
    '#top',
    '?q=1',
    'www.nhs.uk',
    'https://',
    'https://user:pass@evil.example',
    'https://www.nhs.uk@evil.example',
    '',
    null,
    undefined,
    '/' + 'a'.repeat(3000),
  ]) {
    assert.equal(linkTarget(bad), null, String(bad));
  }
});

test('the link pattern takes words and an address, on one line', () => {
  const m = LINK_RE.exec('see [Blood tests](/notebook/blood-tests-12) today');
  assert.equal(m[1], 'Blood tests');
  assert.equal(m[2], '/notebook/blood-tests-12');
  assert.equal(LINK_RE.exec('[split\nwords](/x)'), null);
  assert.equal(LINK_RE.exec('**[square brackets]** and no address'), null);
});

test('stripLinks leaves the words', () => {
  assert.equal(stripLinks('See [Blood tests](/notebook/blood-tests-12) and [NHS](https://www.nhs.uk).'), 'See Blood tests and NHS.');
  assert.equal(stripLinks('No links [here].'), 'No links [here].');
});

test('the closing sources line is lifted out as links', () => {
  const md = 'Book it on the blood test system [[1]].\n\nSources: [Blood tests](/notebook/blood-tests-12) · [Phlebotomy](/notebook/phlebotomy-40)';
  const { body, sources } = splitSources(md);
  assert.equal(body, 'Book it on the blood test system [[1]].');
  assert.deepEqual(sources, [
    { label: 'Blood tests', target: { kind: 'internal', href: '/notebook/blood-tests-12' } },
    { label: 'Phlebotomy', target: { kind: 'internal', href: '/notebook/phlebotomy-40' } },
  ]);
});

test('a check line after the sources stays in the body', () => {
  const md = 'Answer.\n\nSources: [A](/notebook/a-1)\n\nCheck this against the page (**A**) before acting on it.';
  const { body, sources } = splitSources(md);
  assert.equal(body, 'Answer.\n\nCheck this against the page (**A**) before acting on it.');
  assert.equal(sources.length, 1);
});

test('bold heads and other separators are understood', () => {
  const { sources } = splitSources('x\n\n**Sources:** [A](/notebook/a-1), [B](/notebook/b-2); [C](https://www.nhs.uk)');
  assert.deepEqual(sources.map((s) => s.label), ['A', 'B', 'C']);
  assert.equal(sources[2].target.kind, 'external');
  assert.equal(splitSources('x\n\n**Source**: [A](/notebook/a-1)').sources.length, 1);
});

test('an unsafe source keeps its words with no link', () => {
  const { sources } = splitSources('x\n\nSources: [A](/notebook/a-1) · [Bad](javascript:alert(1))');
  assert.deepEqual(sources[1], { label: 'Bad', target: null });
  const second = splitSources('x\n\nSources: [A](/notebook/a-1) · [Bad](data:text/html,hi)');
  assert.deepEqual(second.sources[1], { label: 'Bad', target: null });
});

test('an address may hold balanced parentheses', () => {
  const m = LINK_RE.exec('[bad](javascript:alert(1)) and on');
  assert.equal(m[2], 'javascript:alert(1)');
  assert.equal(linkTarget(m[2]), null);
  const wiki = LINK_RE.exec('see [Asthma](https://en.wikipedia.org/wiki/Asthma_(disease)).');
  assert.equal(wiki[2], 'https://en.wikipedia.org/wiki/Asthma_(disease)');
  assert.equal(linkTarget(wiki[2]).kind, 'external');
  assert.equal(stripLinks('a [bad](javascript:alert(1)) b'), 'a bad b');
});

test('a sources line that is not only links is left alone', () => {
  const md = 'x\n\nSources: the practice manager and [A](/notebook/a-1)';
  assert.deepEqual(splitSources(md), { body: md, sources: [] });
  assert.deepEqual(splitSources('Sources: none'), { body: 'Sources: none', sources: [] });
  assert.deepEqual(splitSources(''), { body: '', sources: [] });
});
