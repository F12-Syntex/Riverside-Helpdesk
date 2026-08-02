import test from 'node:test';
import assert from 'node:assert/strict';
import { isMachineId, machineCode, machineLabel, machineName, parseUserAgent } from '../lib/audit/machine.js';
import { findRoute, normalisePath, routeTitle, routeTool, PAGES, API_ROUTES } from '../lib/routes.js';

// The audit log groups by machine rather than by IP address, so the naming of a
// machine is what staff actually read. It has to stay stable and readable.

test('a machine reads as the device someone would point at', () => {
  const windows = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  assert.deepEqual(windows, { os: 'Windows', browser: 'Chrome 131', device: 'Computer' });
  assert.equal(machineLabel(windows), 'Windows computer · Chrome 131');

  const iphone = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1');
  assert.equal(iphone.os, 'iOS');
  assert.equal(iphone.device, 'Phone');
  assert.equal(iphone.browser, 'Safari 17');
});

test('the browsers that impersonate Chrome are not reported as Chrome', () => {
  const edge = parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86');
  assert.equal(edge.browser, 'Edge 131');

  const chrome = parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  assert.equal(chrome.browser, 'Chrome 131');
  assert.equal(chrome.os, 'macOS');
});

test('an unreadable user agent says so instead of guessing', () => {
  assert.deepEqual(parseUserAgent(''), { os: '', browser: '', device: '' });
  assert.equal(machineLabel(parseUserAgent('')), 'Unrecognised machine');
});

test('a machine keeps the same short code for ever', () => {
  const id = 'm-0123456789abcdef01234567';
  assert.equal(machineCode(id), machineCode(id));
  assert.match(machineCode(id), /^[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.notEqual(machineCode(id), machineCode('m-fedcba9876543210fedcba98'));
});

test('a machine the practice has named is called by that name', () => {
  const id = 'm-0123456789abcdef01234567';
  assert.equal(machineName({ id, name: 'Reception PC 1' }), 'Reception PC 1');
  assert.equal(machineName({ id, name: '   ' }), 'Machine ' + machineCode(id));
  assert.equal(machineName({ id }), 'Machine ' + machineCode(id));
});

test('only an id the browser actually minted is accepted', () => {
  assert.equal(isMachineId('m-0123456789abcdef01234567'), true);
  for (const bad of ['', 'm-', 'm-zzz', 'm-0123456789abcdef0123456', '0123456789abcdef01234567', null]) {
    assert.equal(isMachineId(bad), false, String(bad));
  }
});

// The registry is what turns a raw path in the log into something readable, and
// what /index is built from. A route missing from it is invisible on both.

test('a path is matched whatever is hung off the end of it', () => {
  assert.equal(normalisePath('/lookup/?q=dentist'), '/lookup');
  assert.equal(normalisePath('/lookup/'), '/lookup');
  assert.equal(normalisePath('/'), '/');
  // The Q&A answers at "/" now; /helpbot is kept as its old address.
  assert.equal(routeTitle('/'), 'Practice Q&A');
  assert.equal(routeTitle('/helpbot'), 'Practice Q&A (old address)');
  assert.equal(routeTitle('/api/ask'), 'Ask a question');
});

test('a route that grows a segment later still resolves to its parent', () => {
  assert.equal(findRoute('/api/notebook/attachments').path, '/api/notebook/attachments');
  // Longest prefix wins, so this is the attachments route and not /api/notebook.
  assert.equal(findRoute('/api/notebook/attachments/12').path, '/api/notebook/attachments');
  assert.equal(findRoute('/api/notebook/12').path, '/api/notebook');
});

test('an unregistered path degrades to itself rather than disappearing', () => {
  assert.equal(findRoute('/api/nothing-here'), null);
  assert.equal(routeTitle('/api/nothing-here'), '/api/nothing-here');
  assert.equal(routeTool('/api/nothing-here'), '');
});

test('an API endpoint says which part of the app it belongs to', () => {
  assert.equal(routeTool('/api/cqc'), 'Instant lookup');
  assert.equal(routeTool('/api/rota'), 'Staff rota generator');
  assert.equal(routeTool('/lookup'), 'Instant lookup');
});

test('every registered route is unique, described, and grouped', () => {
  const seen = new Set();
  for (const route of [...PAGES, ...API_ROUTES]) {
    assert.equal(seen.has(route.path), false, 'duplicate route ' + route.path);
    seen.add(route.path);
    assert.match(route.path, /^\//, route.path + ' is not a path');
    assert.ok(route.title, route.path + ' has no title');
    assert.ok(route.summary, route.path + ' has no summary');
    assert.ok(route.group, route.path + ' has no group');
  }
});

test('the audit log is registered but stays off the landing page', () => {
  const stats = PAGES.find((p) => p.path === '/stats');
  assert.ok(stats, '/stats should be in the registry so the log can name it');
  assert.equal(stats.hidden, true);
  assert.notEqual(stats.landing, true);
  // The everyday tools: the Q&A, which is now the front door itself, and the
  // lookup. /helpbot is the Q&A's old address and is not counted again.
  assert.deepEqual(PAGES.filter((p) => p.landing).map((p) => p.path), ['/', '/lookup']);
});
