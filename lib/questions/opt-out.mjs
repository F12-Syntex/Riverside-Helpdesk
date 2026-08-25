// Whether this machine's questions are written to the question log.
//
// The log exists so somebody can read back what the assistant was asked and
// what it answered (/stats). That is the right default for a shared front desk
// — but a machine is sometimes used to ask something nobody needs a record of,
// and the honest way to offer that is a switch that plainly turns the recording
// off, not a quiet promise that the record is private.
//
// PER MACHINE, NOT PER PRACTICE, and held in a cookie for exactly that reason:
// the setting belongs to the computer it was set at, so turning it off at the
// back office does not stop the front desk being logged. It is mirrored into
// localStorage the same way the machine id is (lib/audit/client.js), so
// clearing one of the two does not silently turn logging back on.
//
// WHAT IT DOES NOT TURN OFF. The audit log — which page was opened, which
// request was made — is a different record with a different purpose, and this
// switch does not touch it. Neither does it stop the answer being produced,
// costed or checked: it stops the row that holds the question text.
export const NO_LOG_COOKIE = 'riva_nolog';
export const NO_LOG_STORE_KEY = 'riva.questions.nolog';

const SET = /(?:^|;\s*)riva_nolog=([^;]*)/;

/**
 * Is question logging switched off on the machine this request came from?
 *
 * @param {string} cookieHeader the request's raw Cookie header
 */
export function loggingOffIn(cookieHeader) {
  const found = String(cookieHeader || '').match(SET);
  if (!found) return false;
  let value = found[1] || '';
  try { value = decodeURIComponent(value); } catch (e) { /* take it as it came */ }
  // Only an explicit yes counts. A blank or stale cookie logs, because the
  // default is the one the practice agreed to.
  return ['1', 'true', 'off'].includes(value.trim().toLowerCase());
}
