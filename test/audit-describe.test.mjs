import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTENT_NEVER_RECORDED,
  defaultKind,
  describeRequest,
  shouldRecord,
  trim,
} from '../lib/audit/describe.js';

// The audit log records what staff did. The line it must never cross is
// recording what a PATIENT said: the signposting, reason-for-appointment and
// document-coding tools exist to have a consultation or a hospital letter
// pasted into them, and that text must not end up in an audit table. These
// tests are the guard on that line.

test('a pasted consultation is never recorded — only that the tool was used', () => {
  const body = { text: 'Patient reports crushing central chest pain radiating to the left arm.' };
  for (const path of ['/api/signpost', '/api/reason', '/api/docfile']) {
    const event = describeRequest({ path, method: 'POST', body, bodyLength: 240 });
    const written = event.label + ' ' + event.detail;
    assert.equal(/chest pain|crushing|patient reports/i.test(written), false, path + ' leaked the text');
    assert.match(event.detail, /^\d[\d,]* characters$/, path + ' should record the size only');
  }
});

test('every guarded route is handed no body at all, even by a careless caller', () => {
  // Belt and braces: describeRequest nulls the body for guarded routes, so a
  // describer added later cannot read it even if it tries.
  for (const path of CONTENT_NEVER_RECORDED) {
    const event = describeRequest({
      path,
      method: 'POST',
      body: { text: 'SECRETPATIENTTEXT', question: 'SECRETPATIENTTEXT', name: 'SECRETPATIENTTEXT' },
      bodyLength: 20,
    });
    assert.equal((event.label + event.detail).includes('SECRETPATIENTTEXT'), false, path);
  }
});

test('a question asked of the assistant is recorded — that is the point of a query log', () => {
  const event = describeRequest({
    path: '/api/ask',
    method: 'POST',
    body: { question: 'How do I report a significant event?' },
  });
  assert.equal(event.kind, 'query');
  assert.equal(event.detail, 'How do I report a significant event?');
});

test('a directory search records what was searched for', () => {
  const event = describeRequest({
    path: '/api/cqc',
    method: 'GET',
    params: new URLSearchParams({ q: 'dentist barnsley' }),
  });
  assert.equal(event.kind, 'query');
  assert.equal(event.detail, 'dentist barnsley');
});

test('reads and writes are told apart, so routine chatter can be hidden', () => {
  assert.equal(defaultKind('GET'), 'load');
  assert.equal(defaultKind('POST'), 'action');
  assert.equal(defaultKind('PUT'), 'action');
  assert.equal(defaultKind('DELETE'), 'action');
  assert.equal(describeRequest({ path: '/api/staff', method: 'GET' }).kind, 'load');
  assert.equal(describeRequest({ path: '/api/staff', method: 'POST', body: { name: 'Simin' } }).kind, 'action');
});

test('a route with no describer still reads as something rather than nothing', () => {
  const event = describeRequest({ path: '/api/kb', method: 'GET' });
  assert.equal(event.kind, 'load');
  assert.equal(event.label, 'GET /api/kb');
  assert.equal(event.detail, '');
});

test('the audit endpoint is never recorded, or the log would log itself for ever', () => {
  assert.equal(shouldRecord('/api/audit'), false);
  assert.equal(shouldRecord('/api/ask'), true);
});

test('only this app’s own API is recorded — fonts and analytics are not', () => {
  assert.equal(shouldRecord('/helpbot'), false);
  assert.equal(shouldRecord('/_next/static/chunk.js'), false);
  assert.equal(shouldRecord(''), false);
});

test('long text is cut rather than stored whole', () => {
  const long = 'a'.repeat(500);
  const event = describeRequest({ path: '/api/ask', method: 'POST', body: { question: long } });
  assert.equal(event.detail.length <= 400, true);
  assert.equal(event.detail.endsWith('…'), true);
  assert.equal(trim('  spaced   out  ', 40), 'spaced out');
});
