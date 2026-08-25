import test from 'node:test';
import assert from 'node:assert/strict';
import { loggingOffIn } from '../lib/questions/opt-out.mjs';

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
