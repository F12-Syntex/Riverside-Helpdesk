// What the audit log is allowed to record about a request, and how it reads.
//
// Shared by the browser (which is the only place that can see a request body)
// and the server (which stores what it is sent). Kept pure and free of both DOM
// and database so it can be unit-tested directly.
//
// The rule that matters
// --------------------
// Some tools exist precisely to have patient text pasted into them — a whole
// AccurX consultation, the body of a hospital letter. That text must never end
// up in an audit table. For those routes the log records THAT the tool was
// used, by whom and how large the paste was, and nothing else: no excerpt, no
// first line, no "just the beginning". See CONTENT_NEVER_RECORDED.
//
// Everything else — a question typed at the assistant, a phone-directory
// search, a medicine name — is the staff member's own words about practice
// business, and is recorded in full (truncated) because that is the point of a
// query log.

// Routes whose request content never leaves the browser.
export const CONTENT_NEVER_RECORDED = new Set([
  '/api/signpost',
  '/api/reason',
  '/api/docfile',
  '/api/medication/extract',
  '/api/notebook/format',
  '/api/notebook/organize',
  '/api/notebook/import',
  '/api/knowledge',
]);

// The audit endpoint itself, which is never recorded — logging the log would
// generate a request per request, for ever.
export const AUDIT_PATH = '/api/audit';

export const KINDS = ['pageview', 'query', 'action', 'load', 'error'];

export const MAX_LABEL = 140;
export const MAX_DETAIL = 400;

export function trim(value, max) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

// How much text was pasted, written the way a person would say it. This is all
// a guarded route ever records about its content.
function sizeOf(length) {
  const count = Number(length) || 0;
  if (count <= 0) return '';
  return count.toLocaleString('en-GB') + ' characters';
}

function first(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * One describer per route that deserves better than "POST /api/thing".
 *
 * Each receives { body, params, method } and returns { kind, label, detail } —
 * any field may be left out and the caller's default is used. `body` is null
 * for the routes in CONTENT_NEVER_RECORDED, so a describer there physically
 * cannot leak the text even if it tried to.
 */
const DESCRIBERS = {
  '/api/ask': ({ body }) => ({
    kind: 'query',
    label: 'Asked the assistant a question',
    detail: first(body?.question, body?.q),
  }),
  '/api/agent': ({ body }) => ({
    kind: 'query',
    label: 'Asked the assistant a question',
    detail: first(body?.question, body?.message, body?.q),
  }),
  '/api/cqc': ({ params }) => ({
    kind: 'query',
    label: 'Searched the CQC register',
    detail: params?.get('q') || '',
  }),
  '/api/lookup-web': ({ params }) => ({
    kind: 'query',
    label: 'Searched the web for a number',
    detail: params?.get('q') || '',
  }),
  '/api/medication': ({ body }) => ({
    kind: 'query',
    label: 'Checked a medicine',
    detail: [first(body?.name, body?.medicine), first(body?.question)].filter(Boolean).join(' — '),
  }),
  '/api/medication/extract': ({ body, size }) => ({
    kind: 'action',
    label: 'Extracted medicine names from a pasted list',
    detail: size,
  }),
  '/api/signpost': ({ size }) => ({
    kind: 'action',
    label: 'Signposted a consultation',
    detail: size,
  }),
  '/api/reason': ({ size }) => ({
    kind: 'action',
    label: 'Wrote a reason for appointment',
    detail: size,
  }),
  '/api/docfile': ({ size }) => ({
    kind: 'action',
    label: 'Coded a document',
    detail: size,
  }),
  '/api/settings': ({ body, method }) =>
    method === 'PUT'
      ? { kind: 'action', label: 'Changed the AI model', detail: first(body?.model) }
      : { kind: 'load', label: 'Read the settings' },
  '/api/notebook': ({ body, method, params }) => {
    if (method === 'GET') return { kind: 'load', label: 'Opened the notebook' };
    if (method === 'DELETE') return { kind: 'action', label: 'Deleted a note', detail: 'note ' + (params?.get('id') || '?') };
    if (method === 'POST') return { kind: 'action', label: 'Created a note', detail: first(body?.title) };
    // A PATCH is either a rename/autosave or a drag into another section. The
    // body of the note is not recorded — only that it was edited.
    if (body && body.parentId !== undefined) return { kind: 'action', label: 'Moved a note' };
    if (body && body.title !== undefined) return { kind: 'action', label: 'Renamed a note', detail: first(body?.title) };
    return { kind: 'action', label: 'Edited a note', detail: 'note ' + (body?.id ?? '?') };
  },
  '/api/notebook/format': () => ({ kind: 'action', label: 'Asked the AI to format a note' }),
  '/api/notebook/organize': () => ({ kind: 'action', label: 'Asked the AI to organise a section' }),
  '/api/notebook/export': () => ({ kind: 'action', label: 'Downloaded a notebook backup' }),
  '/api/notebook/import': () => ({ kind: 'action', label: 'Restored a notebook backup' }),
  '/api/notebook/attachments': ({ method }) => ({
    kind: 'action',
    label: method === 'DELETE' ? 'Removed an attachment' : 'Attached a file to a note',
  }),
  '/api/rota': ({ method, params, body }) => {
    const week = first(params?.get('week'), body?.week);
    const suffix = week ? 'week beginning ' + week : '';
    if (method === 'GET') return { kind: 'load', label: 'Opened a rota', detail: suffix };
    if (method === 'POST') return { kind: 'action', label: 'Generated a rota', detail: suffix };
    if (method === 'PUT') return { kind: 'action', label: 'Saved a rota by hand', detail: suffix };
    return { kind: 'action', label: 'Discarded a rota', detail: suffix };
  },
  '/api/staff': ({ method, body, params }) => {
    if (method === 'GET') return { kind: 'load', label: 'Listed the staff' };
    if (method === 'POST') return { kind: 'action', label: 'Added a staff member', detail: first(body?.name) };
    if (method === 'DELETE') return { kind: 'action', label: 'Removed a staff member', detail: 'staff ' + (params?.get('id') || '?') };
    return { kind: 'action', label: 'Edited a staff member', detail: first(body?.name) };
  },
};

// GET fetches data for a page that is already open; anything else changes
// something. Separating them keeps the routine chatter out of the way of the
// events an audit log exists for.
export function defaultKind(method) {
  return String(method || 'GET').toUpperCase() === 'GET' ? 'load' : 'action';
}

/**
 * Turn one request into the event the audit log stores.
 *
 * @param {object} request
 * @param {string} request.path    pathname only, no query string
 * @param {string} request.method  HTTP method
 * @param {URLSearchParams} [request.params]
 * @param {object} [request.body]  the parsed JSON body, when there is one
 * @param {number} [request.bodyLength] length of the raw body, for the routes
 *                                      whose content is never recorded
 * @returns {{kind: string, label: string, detail: string}}
 */
export function describeRequest({ path, method, params, body, bodyLength }) {
  const upper = String(method || 'GET').toUpperCase();
  const guarded = CONTENT_NEVER_RECORDED.has(path);
  const describer = DESCRIBERS[path];

  const described = describer
    ? describer({
        // Belt and braces: a guarded route is handed no body at all, whatever
        // the caller passed in.
        body: guarded ? null : body || null,
        params: params || null,
        method: upper,
        size: sizeOf(bodyLength),
      }) || {}
    : {};

  return {
    kind: KINDS.includes(described.kind) ? described.kind : defaultKind(upper),
    label: trim(described.label || `${upper} ${path}`, MAX_LABEL),
    detail: guarded && !describer ? '' : trim(described.detail || '', MAX_DETAIL),
  };
}

// Whether a request should be recorded at all. Only this app's own API is
// interesting: fonts, analytics and anything cross-origin are noise.
export function shouldRecord(path) {
  if (!path || !path.startsWith('/api/')) return false;
  return path !== AUDIT_PATH && !path.startsWith(AUDIT_PATH + '/');
}
