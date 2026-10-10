// A promise given a deadline. Pure, so the search modules can share it and the
// tests can drive it without a network.

/** Marks a deadline that passed, as distinct from any value the promise could give. */
export const TIMED_OUT = Symbol('timed out');

/**
 * Whatever `promise` settles to, or TIMED_OUT if it has not settled within
 * `ms`. A rejection is passed through. The promise itself is not cancelled —
 * nothing here can cancel it — only no longer waited on; the timer is cleared
 * as soon as either side wins, so a fast answer leaves nothing running.
 */
export function withinMs(promise, ms) {
  let timer = null;
  const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), ms); });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
