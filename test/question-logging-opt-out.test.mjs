import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_LOG_COOKIE, NO_LOG_STORE_KEY, loggingOffIn, setLoggingHere, syncLoggingHere,
} from '../lib/questions/opt-out.mjs';

// The switch is per machine and its default is "record". So the only thing that
// must never happen is a stale or malformed cookie reading as consent — in
// either direction: a machine that switched off must stay off, and a machine
// that never touched the setting must keep logging.

test('no cookie at all means the practice default: logging on', () => {
  assert.equal(loggingOffIn(''), false);
  assert.equal(loggingOffIn(undefined), false);
  assert.equal(loggingOffIn('riva_machine=m8f2a1'), false);
});

test('the switch, set at this machine, turns the recording off', () => {
  assert.equal(loggingOffIn('riva_nolog=1'), true);
  assert.equal(loggingOffIn('riva_machine=m8f2a1; riva_nolog=1'), true);
  assert.equal(loggingOffIn('riva_nolog=1; riva_machine=m8f2a1'), true);
});

test('a cleared or empty value logs, because that is the default', () => {
  assert.equal(loggingOffIn('riva_nolog='), false);
  assert.equal(loggingOffIn('riva_nolog=0'), false);
  assert.equal(loggingOffIn('riva_nolog=maybe'), false);
});

test('another cookie whose name merely ends in the same letters is not this one', () => {
  assert.equal(loggingOffIn('practice_riva_nolog=1'), false);
  assert.equal(loggingOffIn('xriva_nolog=1'), false);
});

/* ---- the switch on /settings (syncLoggingHere, setLoggingHere) ----
 *
 * The server reads the cookie and nothing else. So whatever the switch says
 * has to be what the cookie says once the switch has done its work: a switch
 * reading Off from the localStorage copy while the cookie had gone would be
 * Off on the screen and logging every question. A pretend browser: a cookie
 * jar that honours Max-Age=0, and a localStorage. */

function browser({ cookies = {}, store = {}, cookiesBlocked = false } = {}) {
  const jar = new Map(Object.entries(cookies));
  const data = new Map(Object.entries(store));
  const written = [];
  globalThis.document = {
    get cookie() { return [...jar].map(([k, v]) => k + '=' + v).join('; '); },
    set cookie(line) {
      written.push(line);
      if (cookiesBlocked) return;
      const [pair, ...attrs] = line.split(/;\s*/);
      const at = pair.indexOf('=');
      const age = attrs.find((a) => /^max-age=/i.test(a));
      if (age && Number(age.split('=')[1]) <= 0) jar.delete(pair.slice(0, at));
      else jar.set(pair.slice(0, at), pair.slice(at + 1));
    },
  };
  globalThis.window = {
    localStorage: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => { data.set(k, String(v)); },
      removeItem: (k) => { data.delete(k); },
    },
  };
  return { jar, data, written };
}

test('a cleared cookie is written back from the copy, so the server reads off again', () => {
  const b = browser({ cookies: { riva_machine: 'm-1' }, store: { [NO_LOG_STORE_KEY]: '1' } });
  assert.equal(loggingOffIn(document.cookie), false, 'the server would log');
  assert.equal(syncLoggingHere(), true);
  assert.equal(loggingOffIn(document.cookie), true, 'and now it does not');
  assert.equal(b.jar.get('riva_machine'), 'm-1', 'the machine cookie is left alone');
  assert.match(b.written.at(-1), /^riva_nolog=1; Max-Age=31536000; Path=\/; SameSite=Lax$/);
});

test('a cleared copy is written back from the cookie, and an off cookie is renewed for a year', () => {
  const b = browser({ cookies: { [NO_LOG_COOKIE]: '1' } });
  assert.equal(syncLoggingHere(), true);
  assert.equal(b.data.get(NO_LOG_STORE_KEY), '1');
  assert.match(b.written.at(-1), /Max-Age=31536000/);
});

test('a machine that never touched the switch is left logging, and nothing is written', () => {
  const b = browser({ cookies: { riva_machine: 'm-1' } });
  assert.equal(syncLoggingHere(), false);
  assert.deepEqual(b.written, []);
  assert.equal(b.data.size, 0);
});

test('the switch writes both copies, and turning it back on clears both', () => {
  const b = browser();
  assert.equal(setLoggingHere(false), true);
  assert.equal(loggingOffIn(document.cookie), true);
  assert.equal(b.data.get(NO_LOG_STORE_KEY), '1');
  assert.equal(setLoggingHere(true), false);
  assert.equal(loggingOffIn(document.cookie), false);
  assert.equal(b.jar.has(NO_LOG_COOKIE), false);
  assert.equal(b.data.has(NO_LOG_STORE_KEY), false);
  // And a later visit does not bring it back.
  assert.equal(syncLoggingHere(), false);
});

test('where no cookie can be written, the switch says what the server will do: log', () => {
  const b = browser({ cookiesBlocked: true });
  assert.equal(setLoggingHere(false), false);
  assert.equal(b.data.get(NO_LOG_STORE_KEY), '1');
  assert.equal(syncLoggingHere(), false);
});
