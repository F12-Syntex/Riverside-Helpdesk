// The browser half of the audit log: what actually watches what staff do.
//
// Three sources, installed once per tab:
//
//   1. Page views      — recorded by the tracker component on every route change.
//   2. Requests        — window.fetch is wrapped, so every call the app makes to
//                        its own API is timed and recorded with no change to any
//                        of the twenty-odd routes that make them.
//   3. Clicks & errors — the buttons and links pressed, and anything that threw.
//
// Wrapping fetch is the reason this works at all. The alternative is a line of
// logging in every route handler and every page, which would be forgotten in
// the first one added afterwards. The wrapper is deliberately inert: it never
// reads a response body, never delays a request, hands the original promise
// straight back, and if anything in it throws, the app carries on as though it
// were not there.
//
// Nothing is sent one event at a time. Events queue and go in batches, and the
// queue is flushed with sendBeacon when the tab is closed, so the last thing
// someone did before shutting the machine down still reaches the log.
import { AUDIT_PATH, describeRequest, shouldRecord, trim, MAX_LABEL } from './describe.js';

const MACHINE_KEY = 'riva.machine.id';
const SESSION_KEY = 'riva.machine.session';
const MACHINE_COOKIE = 'riva_machine';

const FLUSH_AFTER_MS = 4000;   // quiet period before a batch goes
const FLUSH_AT_EVENTS = 25;    // or immediately once this many are waiting
const MAX_QUEUE = 200;         // hard ceiling if the network is down
const CLICK_DEDUPE_MS = 500;

// The unwrapped fetch, kept from before the wrapper is installed so the tracker
// can post its own batches without going back through itself.
let nativeFetch = typeof window !== 'undefined' ? window.fetch.bind(window) : null;

let installed = false;
let queue = [];
let timer = null;
let sending = false;
let lastClick = { label: '', at: 0 };

const canStore = () => typeof window !== 'undefined';

function readStore(store, key) {
  try { return window[store].getItem(key) || ''; } catch (e) { return ''; }
}

function writeStore(store, key, value) {
  try { window[store].setItem(key, value); } catch (e) { /* private mode — carry on */ }
}

function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const hit = document.cookie.split('; ').find((row) => row.startsWith(name + '='));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
}

function writeCookie(name, value) {
  if (typeof document === 'undefined') return;
  const year = 365 * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${year}; Path=/; SameSite=Lax`;
}

function randomId(prefix, bytes) {
  const buffer = new Uint8Array(bytes);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(buffer);
  else for (let i = 0; i < bytes; i++) buffer[i] = Math.floor(Math.random() * 256);
  return prefix + Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * This machine's identifier.
 *
 * Held in localStorage and mirrored into a year-long cookie, so clearing one of
 * the two does not split a machine's history in half. Random and local: it says
 * "the same machine as last time" and nothing else about who is at it.
 */
export function machineId() {
  if (!canStore()) return '';
  let id = readStore('localStorage', MACHINE_KEY) || readCookie(MACHINE_COOKIE);
  if (!/^m-[0-9a-f]{24}$/.test(id)) id = randomId('m-', 12);
  writeStore('localStorage', MACHINE_KEY, id);
  writeCookie(MACHINE_COOKIE, id);
  return id;
}

// One visit. Lives in sessionStorage, so a new tab or a fresh morning is a new
// visit on the same machine.
function sessionId() {
  if (!canStore()) return '';
  let id = readStore('sessionStorage', SESSION_KEY);
  if (!id) {
    id = randomId('s-', 8);
    writeStore('sessionStorage', SESSION_KEY, id);
  }
  return id;
}

// What the browser can say about the machine it is running on. No fingerprinting
// beyond what the log shows: enough to tell the front desk PC from a phone.
function machineProfile() {
  const screen = window.screen ? `${window.screen.width}×${window.screen.height}` : '';
  let timezone = '';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* ignore */ }
  return {
    userAgent: navigator.userAgent || '',
    screen,
    timezone,
    language: navigator.language || '',
  };
}

export function record(event) {
  if (!canStore() || !event) return;
  queue.push({ ...event, sessionId: sessionId(), at: new Date().toISOString() });
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
  if (queue.length >= FLUSH_AT_EVENTS) flush();
  else if (!timer) timer = setTimeout(flush, FLUSH_AFTER_MS);
}

/**
 * Send whatever is queued.
 *
 * `beacon` is used on the way out of the page: sendBeacon survives the tab
 * closing, where a normal fetch would be cancelled mid-flight. Anything that
 * fails to send goes back on the queue for the next attempt rather than being
 * dropped — a log with silent holes in it is worse than a slow one.
 */
export function flush({ beacon = false } = {}) {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!canStore() || !queue.length || sending) return;

  const id = machineId();
  if (!id) { queue = []; return; }

  const batch = queue;
  queue = [];
  const payload = JSON.stringify({ machineId: id, machine: machineProfile(), events: batch });

  if (beacon && navigator.sendBeacon) {
    const sent = navigator.sendBeacon(AUDIT_PATH, new Blob([payload], { type: 'application/json' }));
    if (!sent) queue = batch.concat(queue).slice(-MAX_QUEUE);
    return;
  }

  sending = true;
  // nativeFetch, not window.fetch: the wrapper skips /api/audit anyway, but
  // going straight to the original keeps the two from ever tangling.
  nativeFetch(AUDIT_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  })
    .then((res) => { if (!res.ok) queue = batch.concat(queue).slice(-MAX_QUEUE); })
    .catch(() => { queue = batch.concat(queue).slice(-MAX_QUEUE); })
    .finally(() => { sending = false; });
}

// The pathname and query of whatever fetch was handed — a string, a URL, or a
// Request object.
function requestTarget(input) {
  try {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (!raw) return null;
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return { path: url.pathname, params: url.searchParams };
  } catch (e) {
    return null;
  }
}

/**
 * The request body, if it is JSON we can read without disturbing anything.
 *
 * Only a plain string body is parsed. A stream, a Blob or a Request's own body
 * is left completely alone: reading one would consume it and break the request
 * the staff member is waiting on. FormData is reported by size only.
 */
function readBody(init) {
  const body = init?.body;
  if (typeof body !== 'string') return { body: null, bodyLength: 0 };
  const parsed = (() => { try { return JSON.parse(body); } catch (e) { return null; } })();
  return { body: parsed, bodyLength: body.length };
}

function installFetch() {
  const original = window.fetch;
  nativeFetch = original.bind(window);

  window.fetch = function auditedFetch(input, init) {
    let target = null;
    let described = null;
    let started = 0;

    // Everything about deciding whether to record is wrapped: a surprise in
    // here must not stop the request going out.
    try {
      target = requestTarget(input);
      if (target && shouldRecord(target.path)) {
        const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
        const { body, bodyLength } = readBody(init);
        described = { ...describeRequest({ path: target.path, method, params: target.params, body, bodyLength }), method };
        started = performance.now();
      }
    } catch (e) {
      described = null;
    }

    const result = original.apply(this, arguments);
    if (!described) return result;

    return result.then(
      (response) => {
        try {
          record({
            ...described,
            // A request that came back 4xx/5xx is what an audit log is for, so
            // it is promoted out of the routine chatter.
            kind: response.ok ? described.kind : 'error',
            path: target.path,
            status: response.status,
            durationMs: Math.round(performance.now() - started),
          });
        } catch (e) { /* never break the caller */ }
        return response;
      },
      (error) => {
        try {
          record({
            ...described,
            kind: 'error',
            path: target.path,
            label: described.label + ' — the request failed',
            detail: trim(String(error?.message || error), 200),
            durationMs: Math.round(performance.now() - started),
          });
        } catch (e) { /* never break the caller */ }
        throw error;
      },
    );
  };
}

// What a control is called, as a person reading the log would name it.
function controlLabel(element) {
  const text = element.getAttribute('aria-label') || element.innerText || element.title || '';
  return trim(text.split('\n')[0], 60);
}

function installClicks() {
  document.addEventListener(
    'click',
    (event) => {
      try {
        const target = event.target instanceof Element
          ? event.target.closest('button, a, summary, [role="button"], [role="option"]')
          : null;
        if (!target) return;
        const label = controlLabel(target);
        if (!label) return;

        // One press of one button is one event, however many handlers it walks
        // through on the way up.
        const now = Date.now();
        if (label === lastClick.label && now - lastClick.at < CLICK_DEDUPE_MS) return;
        lastClick = { label, at: now };

        record({
          kind: 'action',
          path: window.location.pathname,
          label: 'Pressed “' + label + '”',
        });
      } catch (e) { /* a tracker must never break a click */ }
    },
    { capture: true },
  );
}

function installErrors() {
  window.addEventListener('error', (event) => {
    try {
      record({
        kind: 'error',
        path: window.location.pathname,
        label: trim(event.message || 'Something went wrong on the page', MAX_LABEL),
        detail: trim([event.filename, event.lineno].filter(Boolean).join(':'), 200),
      });
    } catch (e) { /* ignore */ }
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      record({
        kind: 'error',
        path: window.location.pathname,
        label: 'An action did not finish',
        detail: trim(String(event.reason?.message || event.reason || ''), 200),
      });
    } catch (e) { /* ignore */ }
  });
}

function installFlushTriggers() {
  // pagehide fires where unload is unreliable (Safari, and any browser that
  // puts the page into the back/forward cache); visibilitychange catches the
  // far more common case of someone switching tabs and never coming back.
  window.addEventListener('pagehide', () => flush({ beacon: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush({ beacon: true });
  });
}

/** Install the tracker. Safe to call repeatedly; only the first call does work. */
export function installAudit() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  try {
    machineId();
    installFetch();
    installClicks();
    installErrors();
    installFlushTriggers();
  } catch (e) {
    console.warn('[audit] the activity tracker could not start:', String(e).slice(0, 200));
  }
}

/** Record a page view. Called by the tracker component on every route change. */
export function recordPageview(path, title) {
  record({
    kind: 'pageview',
    path: path || window.location.pathname,
    label: trim(title || document.title || path, MAX_LABEL),
    detail: trim(window.location.search.replace(/^\?/, ''), 200),
  });
}
