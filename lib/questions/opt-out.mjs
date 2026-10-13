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
// clearing one of the two does not silently turn logging back on — but the
// cookie is the only copy the server reads, so the mirror's whole job is to
// write the cookie back (syncLoggingHere, below). It is never read as the
// answer in the cookie's place.
//
// WHAT IT DOES NOT TURN OFF. The audit log — which page was opened, which
// request was made — is a different record with a different purpose, and this
// switch does not touch it. Neither does it stop the answer being produced,
// costed or checked: it stops the row that holds the question text.
//
// EVERYWHERE THAT ROW WOULD OTHERWISE BE. Anything that comes to keep question
// text, under whatever name, has to check this as well — the switch is a
// promise about the text, not about one table.
export const NO_LOG_COOKIE = 'riva_nolog';
export const NO_LOG_STORE_KEY = 'riva.questions.nolog';

const SET = /(?:^|;\s*)riva_nolog=([^;]*)/;
const YEAR_S = 365 * 24 * 60 * 60;

// Only an explicit yes counts. A blank or stale value logs, because the
// default is the one the practice agreed to.
const saysOff = (value) => ['1', 'true', 'off'].includes(String(value || '').trim().toLowerCase());

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
  return saysOff(value);
}

/* ---- the browser's half: the switch on /settings ----
 *
 * Both functions answer the same question the server asks, the same way:
 * loggingOffIn(document.cookie), read back after writing. So the switch
 * cannot say Off while the next question is being logged — if the cookie
 * could not be written (a browser that refuses cookies), it says On, which
 * is the truth. */

function writeCookie(off) {
  document.cookie = NO_LOG_COOKIE + '=' + (off ? '1' : '') + '; Max-Age=' + (off ? YEAR_S : 0) + '; Path=/; SameSite=Lax';
}

function readCopy() {
  try { return window.localStorage.getItem(NO_LOG_STORE_KEY) || ''; } catch (e) { return ''; }
}

function writeCopy(off) {
  try {
    if (off) window.localStorage.setItem(NO_LOG_STORE_KEY, '1');
    else window.localStorage.removeItem(NO_LOG_STORE_KEY);
  } catch (e) { /* private mode — the cookie still carries it */ }
}

/**
 * Put the two copies back in step, then say whether this machine's questions
 * are logged, as the server will see it. Either copy saying off is enough to
 * write the other, so a cleared cookie (by hand, or by a browser set to clear
 * them on exit, as shared desktops often are) comes back from localStorage;
 * and an off cookie is written again for another year each time, so a
 * machine that is used does not expire back into logging.
 *
 * @returns {boolean} true when logging is off here
 */
export function syncLoggingHere() {
  if (typeof document === 'undefined') return false;
  if (loggingOffIn(document.cookie) || saysOff(readCopy())) {
    writeCookie(true);
    writeCopy(true);
  }
  return loggingOffIn(document.cookie);
}

/**
 * Turn the logging of this machine's questions on or off: both copies, for a
 * year (off) or cleared (on).
 *
 * @returns {boolean} true when logging is off here afterwards
 */
export function setLoggingHere(on) {
  if (typeof document === 'undefined') return false;
  writeCookie(!on);
  writeCopy(!on);
  return loggingOffIn(document.cookie);
}
