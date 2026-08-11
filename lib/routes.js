// Every route this app serves, in one place.
//
// Three things need the same list and used to drift apart from each other: the
// deep index at /index, the audit log at /stats (which has to turn a raw path
// like "/api/docfile" into something a human can read), and anyone trying to
// find a tool that was deliberately kept off the landing page. The landing page
// at "/" is deliberately NOT generated from this file — it shows the two tools
// staff use every day and nothing else, by hand.
//
// Adding a route? Add it here too, or it will be invisible to the index and
// appear in the audit log as a bare path.

// Page groups, in the order the index shows them.
export const PAGE_GROUPS = [
  'Everyday tools',
  'Reception helpers',
  'Practice management',
  'Reference and documentation',
  'Administration',
];

// API groups, in the order the index shows them.
export const API_GROUPS = [
  'Answering questions',
  'Lookup',
  'Reception helpers',
  'Practice management',
  'Knowledge base',
  'Administration',
];

/**
 * Pages.
 *
 * - `landing`  — shown on the landing page at "/" (the only two that are).
 * - `hidden`   — works, but is not linked from anywhere in the app.
 * - `local`    — only reachable from localhost in development (see middleware.js).
 */
export const PAGES = [
  {
    path: '/',
    title: 'Practice Q&A',
    group: 'Everyday tools',
    landing: true,
    summary:
      'The front door. Ask a question about how the practice works and get an answer written only from the practice’s own documents and Notebook, with a verbatim quote behind every claim. Sources lists everything it can read from.',
  },
  {
    path: '/tools',
    title: 'Practice tools',
    group: 'Everyday tools',
    summary: 'The short list of the other tools staff reach for. No longer the landing page.',
  },
  {
    path: '/helpbot',
    title: 'Practice Q&A (old address)',
    group: 'Everyday tools',
    summary: 'The same Q&A as “/”, kept so existing links and bookmarks still work.',
  },
  {
    path: '/lookup',
    title: 'Instant lookup',
    group: 'Everyday tools',
    landing: true,
    summary:
      'Find a phone number. Searches every service registered with the CQC in England — hospitals, GP practices, dentists, care homes, hospices — by name, town, postcode, service type, acronym or number, and falls back to a web search for the numbers the register does not hold.',
  },

  {
    path: '/signpost',
    title: 'Signpost an AccurX request',
    group: 'Reception helpers',
    summary:
      'Paste a consultation (patient identifiers already removed) and get a routing suggestion back: who should pick it up, how urgently, and the next step or two. Follows the practice’s own triaging Notebook section.',
  },
  {
    path: '/reason',
    title: 'Reason for appointment',
    group: 'Reception helpers',
    summary:
      'Turns a patient’s own words into the concise clinical reason for the appointment, in medical terms, ready to paste into the clinical system. Summarises only what the patient wrote — no diagnosis, no management.',
  },
  {
    path: '/coding',
    title: 'Code a document',
    group: 'Reception helpers',
    summary:
      'Paste the text of a medical document, or a screenshot of it, and get the one-line filing title back — (dd-Mmm-yyyy) SOURCE DEPARTMENT actions — ready to paste into the clinical system.',
  },

  {
    path: '/medications',
    title: 'Medication check',
    group: 'Practice management',
    summary:
      'Look up clear, referenced information about any medicine from public UK sources (NHS, BNF/NICE, eMC). Several at once, each with an optional question. Every point is backed by a clickable source.',
  },
  {
    path: '/rota',
    title: 'Staff rota generator',
    group: 'Practice management',
    summary:
      'Build and balance a week’s rota. A deterministic fair base, then plain-English rules ("Simin is off all week") applied on top, with a Staff tab for the people it schedules.',
  },
  {
    path: '/notebook',
    title: 'Notebook',
    group: 'Practice management',
    summary:
      'The practice’s own written knowledge, in sections and pages with attachments. Every page is read live when a question is answered, so writing a note makes it citable immediately — no re-ingest, no redeploy.',
  },

  {
    path: '/index',
    title: 'Full index',
    group: 'Reference and documentation',
    summary:
      'This page. Every route in the app — pages and API endpoints alike — including the ones kept off the landing page.',
  },
  {
    path: '/diagram',
    title: 'System map',
    group: 'Reference and documentation',
    summary:
      'One connected diagram of the whole system at three levels of detail: the request loop, the architecture, and every page with its API routes, libraries and RAG stores.',
  },
  {
    path: '/dpia',
    title: 'Data protection check (DPIA)',
    group: 'Reference and documentation',
    summary:
      'The data protection impact assessment covering the whole Riverside Helpdesk program — what is processed, where it goes and on what basis.',
  },

  {
    path: '/settings',
    title: 'Settings',
    group: 'Administration',
    summary:
      'Which AI model every feature runs on. Stored in the practice’s own database, so a change takes effect on the next question with no redeploy.',
  },
  {
    path: '/stats',
    title: 'Questions and activity',
    group: 'Administration',
    hidden: true,
    summary:
      'Every question put to the assistant, with the answer it gave and any verdict left on it, so the output can be checked rather than assumed; and behind that the audit log — pages opened, actions taken and errors hit — grouped by the machine it was done on rather than by IP address. Not linked from the landing page or the menu.',
  },
  {
    path: '/knowledge',
    title: 'Knowledge base administration',
    group: 'Administration',
    local: true,
    summary:
      'Review and edit canonical knowledge entries, and work through the contradictions found between them. Development machine only — the middleware returns 404 for this path everywhere else.',
  },
];

/**
 * API endpoints.
 *
 * `tool` names the page an endpoint serves; the audit log uses it to say which
 * part of the app a request came from.
 */
export const API_ROUTES = [
  {
    path: '/api/agent',
    title: 'Assistant (agent)',
    methods: ['POST'],
    group: 'Answering questions',
    tool: 'Practice Q&A',
    summary:
      'The assistant’s brain. The model drives its own retrieval — searching the practice’s material as often as the question needs, opening a whole Notebook page when a fragment will not do — and streams each tool call to the browser as it happens.',
  },
  {
    path: '/api/ask',
    title: 'Ask a question',
    methods: ['POST'],
    group: 'Answering questions',
    tool: 'Practice Q&A',
    summary:
      'The single-shot Q&A endpoint. Retrieval, prompt building, the model call and citation resolution all happen server-side, so the API key and the knowledge base never reach the browser.',
  },
  {
    path: '/api/kb',
    title: 'Knowledge base listing',
    methods: ['GET'],
    group: 'Answering questions',
    tool: 'Practice Q&A',
    summary: 'The documents behind the Knowledge base tab, with their openable files and page thumbnails. Read-only.',
  },
  {
    path: '/api/docfile',
    title: 'Document coding',
    methods: ['POST'],
    group: 'Answering questions',
    tool: 'Code a document',
    summary:
      'Writes the one-line filing title for a pasted document or screenshot, reading the practice’s own "Document coding" Notebook section for how sources and departments are named here. The tail of the title is the document’s active items — what the practice must do, prescription changes, and the plan already running — never the narrative.',
  },

  {
    path: '/api/cqc',
    title: 'CQC register search',
    methods: ['GET'],
    group: 'Lookup',
    tool: 'Instant lookup',
    summary:
      'Ranked matches from the ~57k-row CQC registered-services extract. Searched on the server — the set is far too large to hold on a phone.',
  },
  {
    path: '/api/lookup-web',
    title: 'Web number lookup',
    methods: ['GET'],
    group: 'Lookup',
    tool: 'Instant lookup',
    summary:
      'For what the CQC register does not hold — community pharmacies, interpreting lines, private clinics. Reads the pages it finds and returns numbers, not links.',
  },
  {
    path: '/api/directory',
    title: 'Local contact directory',
    methods: ['GET'],
    group: 'Lookup',
    tool: 'Instant lookup',
    summary: 'The practice’s own contacts, sent to the browser whole so they can be searched instantly offline.',
  },

  {
    path: '/api/signpost',
    title: 'Signposting',
    methods: ['POST'],
    group: 'Reception helpers',
    tool: 'Signpost an AccurX request',
    summary:
      'Routing suggestion for a pasted consultation: who, how urgently, what next. Reads the practice’s triaging Notebook section; no retrieval and no citations, because it is a hint to sanity-check rather than clinical advice.',
  },
  {
    path: '/api/reason',
    title: 'Reason for appointment',
    methods: ['POST'],
    group: 'Reception helpers',
    tool: 'Reason for appointment',
    summary: 'Rephrases a patient’s consultation text into clinical shorthand for the clinician who will process it.',
  },

  {
    path: '/api/medication',
    title: 'Medication lookup',
    methods: ['POST'],
    group: 'Practice management',
    tool: 'Medication check',
    summary:
      'One medicine per request, with an optional question. Cached in Postgres, so a repeat lookup or a question already asked returns with no model call at all.',
  },
  {
    path: '/api/medication/extract',
    title: 'Extract medicine names',
    methods: ['POST'],
    group: 'Practice management',
    tool: 'Medication check',
    summary: 'Pulls the medicine names out of a pasted list or prescription snippet so the browser can fan them out.',
  },
  {
    path: '/api/rota',
    title: 'Rota',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    group: 'Practice management',
    tool: 'Staff rota generator',
    summary: 'Load, generate, save or discard one week’s schedule. Generation always rebuilds from a fair seeded base and re-applies the whole rule list.',
  },
  {
    path: '/api/staff',
    title: 'Staff',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    group: 'Practice management',
    tool: 'Staff rota generator',
    summary: 'The people the rota schedules, with their hours, annual leave and whether they are temporary.',
  },
  {
    path: '/api/notebook',
    title: 'Notebook pages',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    group: 'Practice management',
    tool: 'Notebook',
    summary: 'Create, rename, autosave, move and delete notes. Everything written here is mirrored into canonical knowledge as a citable source.',
  },
  {
    path: '/api/notebook/attachments',
    title: 'Notebook attachments',
    methods: ['POST', 'DELETE'],
    group: 'Practice management',
    tool: 'Notebook',
    summary: 'Files attached to a note. Stored in Vercel Blob; the row ties each file to its note so deleting the note cleans the file up.',
  },
  {
    path: '/api/notebook/format',
    title: 'Notebook formatter',
    methods: ['POST'],
    group: 'Practice management',
    tool: 'Notebook',
    summary: 'Restructures a page into a rich reference document, preserving every fact. Returned as a diff to confirm — nothing is saved here.',
  },
  {
    path: '/api/notebook/organize',
    title: 'Notebook organiser',
    methods: ['POST'],
    group: 'Practice management',
    tool: 'Notebook',
    summary: 'Two-phase tidy-up of a holding section: propose an allocation plan, then apply the confirmed plan. Nothing moves unseen.',
  },
  {
    path: '/api/notebook/export',
    title: 'Notebook backup',
    methods: ['GET'],
    group: 'Practice management',
    tool: 'Notebook',
    summary: 'Downloads every note and attachment record as one JSON file.',
  },
  {
    path: '/api/notebook/import',
    title: 'Notebook restore',
    methods: ['POST'],
    group: 'Practice management',
    tool: 'Notebook',
    summary: 'Restores a backup additively — notes are recreated with fresh ids and the existing ones are left alone.',
  },

  {
    path: '/api/knowledge',
    title: 'Knowledge entries',
    methods: ['GET', 'POST', 'DELETE'],
    group: 'Knowledge base',
    tool: 'Knowledge base administration',
    local: true,
    summary: 'List, read, write and archive canonical knowledge entries.',
  },
  {
    path: '/api/knowledge/analyse',
    title: 'Claim analysis',
    methods: ['POST'],
    group: 'Knowledge base',
    tool: 'Knowledge base administration',
    local: true,
    summary: 'Extracts atomic claims a batch at a time, so a large library can be worked through without one fragile request.',
  },
  {
    path: '/api/knowledge/conflicts',
    title: 'Contradictions',
    methods: ['GET', 'POST'],
    group: 'Knowledge base',
    tool: 'Knowledge base administration',
    local: true,
    summary: 'The disagreements found between claims, and the decisions taken on them.',
  },
  {
    path: '/api/knowledge/status',
    title: 'Knowledge status',
    methods: ['GET'],
    group: 'Knowledge base',
    tool: 'Knowledge base administration',
    local: true,
    summary: 'Counts of entries, passages and claims, and how much is still stale.',
  },
  {
    path: '/api/knowledge/sync',
    title: 'Knowledge reconciliation',
    methods: ['POST'],
    group: 'Knowledge base',
    tool: 'Knowledge base administration',
    local: true,
    summary: 'Reconciles the bundled documents and contacts against the database.',
  },

  {
    path: '/api/settings',
    title: 'Settings',
    methods: ['GET', 'PUT'],
    group: 'Administration',
    tool: 'Settings',
    summary: 'Reads and writes the practice’s runtime settings — today, the AI model every feature runs on.',
  },
  {
    path: '/api/settings/models',
    title: 'Model catalogue',
    methods: ['GET'],
    group: 'Administration',
    tool: 'Settings',
    summary: 'Every model OpenRouter currently serves, trimmed to what the settings dropdown shows. Cached in the process for an hour.',
  },
  {
    path: '/api/audit',
    title: 'Activity audit log',
    methods: ['GET', 'POST', 'PATCH'],
    group: 'Administration',
    tool: 'Activity audit log',
    summary:
      'Records what was done on which machine, and reads it back for /stats. The only endpoint the audit tracker never records — logging the log would never stop.',
  },
  {
    path: '/api/questions',
    title: 'Question log',
    methods: ['GET'],
    group: 'Administration',
    tool: 'Questions and activity',
    summary:
      'Reads back every question the assistant was asked with the answer it gave and the verdict left on it, for /stats. Read-only: the rows are written by /api/agent as each answer goes out.',
  },
  {
    path: '/api/questions/dismiss',
    title: 'Close an unresolved item',
    methods: ['POST'],
    group: 'Administration',
    tool: 'Questions and activity',
    summary:
      'Records that reception dealt with one item on the unresolved items panel, against the turn it was shown on. Best-effort and never blocking — a panel that cannot be closed is a panel that gets ignored.',
  },
];

export const ROUTES = [...PAGES, ...API_ROUTES];

const BY_PATH = new Map(ROUTES.map((r) => [r.path, r]));

// Strip the query string, the hash and any trailing slash, so "/lookup/?q=x"
// and "/lookup" are the same route.
export function normalisePath(raw) {
  let path = String(raw || '').trim();
  if (!path) return '';
  const cut = path.search(/[?#]/);
  if (cut !== -1) path = path.slice(0, cut);
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path || '/';
}

/**
 * The registry entry for a path.
 *
 * Falls back to the longest registered prefix, so a route that grows a dynamic
 * segment later (say /api/notebook/12) still resolves to its parent rather than
 * disappearing from the audit log.
 */
export function findRoute(raw) {
  const path = normalisePath(raw);
  if (!path) return null;
  const exact = BY_PATH.get(path);
  if (exact) return exact;
  let best = null;
  for (const route of ROUTES) {
    if (route.path === '/') continue;
    if (!path.startsWith(route.path + '/')) continue;
    if (!best || route.path.length > best.path.length) best = route;
  }
  return best;
}

// A human-readable name for a path — the registry title, or the path itself.
export function routeTitle(raw) {
  const route = findRoute(raw);
  return route ? route.title : normalisePath(raw);
}

// Which part of the app a path belongs to, for grouping the audit log.
export function routeTool(raw) {
  const route = findRoute(raw);
  if (!route) return '';
  return route.tool || route.title;
}

// Registry entries for one group, in registry order.
export function routesInGroup(routes, group) {
  return routes.filter((r) => r.group === group);
}
