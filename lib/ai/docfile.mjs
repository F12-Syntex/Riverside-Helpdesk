const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10,
  october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_LABELS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function expandedYear(value) {
  const year = Number(value);
  if (String(value).length === 4) return year;
  return year <= 49 ? 2000 + year : 1900 + year;
}

function validDate(day, month, year) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function formatted(day, month, year) {
  if (!validDate(day, month, year)) return '';
  return `${String(day).padStart(2, '0')}-${MONTH_LABELS[month]}-${year}`;
}

// Convert a date token without guessing. UK medical documents are day-first;
// ISO year-first is also accepted. Two-digit years use the conventional 1950
// to 2049 window so 7/8/26 becomes 07-Aug-2026.
export function normaliseDocDate(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  let match = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\b/);
  if (match) return formatted(Number(match[1]), Number(match[2]), expandedYear(match[3]));
  match = text.match(/\b(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})\b/);
  if (match) return formatted(Number(match[3]), Number(match[2]), Number(match[1]));
  match = text.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{2}|\d{4})\b/);
  if (match && MONTHS[match[2].toLowerCase()]) {
    return formatted(Number(match[1]), MONTHS[match[2].toLowerCase()], expandedYear(match[3]));
  }
  return '';
}

function dateScore(text, index, raw) {
  const before = text.slice(Math.max(0, index - 70), index).toLowerCase();
  const after = text.slice(index + raw.length, index + raw.length + 35).toLowerCase();
  const label = before.split(/\r?\n/).at(-1).slice(-45);
  const context = label + ' ' + after;
  if (/date\s+of\s+birth|\bdob\b|born\s+(?:on\s+)?$/.test(label)) return -1000;
  if (/received|scanned|uploaded|printed|processed|imported/.test(context)) return -500;
  if (/discharge\s+date|date\s+of\s+discharge|discharged\s+(?:on\s+)?$/.test(label)) return 140;
  if (/attendance\s+date|date\s+of\s+attendance|attended\s+(?:on\s+)?$/.test(label)) return 130;
  if (/clinic\s+date|appointment\s+date|consultation\s+date|date\s+seen|seen\s+(?:on\s+)?$/.test(label)) return 120;
  if (/report\s+date|date\s+of\s+report|procedure\s+date|test\s+date/.test(label)) return 110;
  if (/event\s+date|episode\s+date/.test(label)) return 100;
  if (/letter\s+date|dictated|signed|\bdated\s*$|\bdate\s*:\s*$/.test(label)) return 20;
  return 0;
}

export function documentDateCandidates(text) {
  const source = String(text || '');
  const patterns = [
    /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-](?:\d{2}|\d{4})\b/g,
    /\b\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}\b/g,
    /\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?:\d{2}|\d{4})\b/gi,
  ];
  const seen = new Set();
  const candidates = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const date = normaliseDocDate(match[0]);
      const key = `${match.index}:${match[0]}`;
      if (!date || seen.has(key)) continue;
      seen.add(key);
      candidates.push({ raw: match[0], date, index: match.index, score: dateScore(source, match.index, match[0]) });
    }
  }
  return candidates.sort((a, b) => b.score - a.score || a.index - b.index);
}

function comparable(value) {
  return String(value || '').toLowerCase().replace(/[“”‘’]/g, "'").replace(/[^a-z0-9]+/g, ' ').trim();
}

function evidenceAppears(evidence, documentText) {
  const needle = comparable(evidence);
  return needle.length >= 6 && comparable(documentText).includes(needle);
}

export function resolveDocfileDate({ date = '', dateEvidence = '', documentText = '', hasImages = false } = {}) {
  const candidates = documentDateCandidates(documentText);
  const safe = candidates.filter((candidate) => candidate.score > -500);
  const labelled = safe.find((candidate) => candidate.score >= 100);
  if (labelled) return labelled.date;

  const evidenced = normaliseDocDate(dateEvidence);
  if (evidenced) {
    const matching = safe.find((candidate) => candidate.date === evidenced);
    if ((hasImages || evidenceAppears(dateEvidence, documentText)) && (!candidates.length || matching)) return evidenced;
  }

  const proposed = normaliseDocDate(date);
  if (proposed) {
    const matching = safe.find((candidate) => candidate.date === proposed);
    if (matching || (hasImages && !evidenced)) return proposed;
  }
  if (safe.length === 1) return safe[0].date;
  return '';
}

const PRACTICE_OWNER = /\b(?:gp|general practitioner|primary care|the practice|practice team|family doctor|your doctor)\b/i;
const DIRECT_REQUEST = /\b(?:please|kindly)\s+(?:(?:could|would)\s+you\s+)?(?:arrange|prescribe|issue|request|repeat|monitor|refer|chase|contact|book|start|stop|change|increase|decrease|reduce|review)\b/i;
const REQUEST_TO_PRACTICE = /\b(?:we\s+(?:would be grateful|recommend|request|ask)\s+(?:if\s+)?(?:you|the gp|primary care|the practice))\b/i;
const CONCRETE_ACTION = /\b(?:arrang|prescrib|issu|request|repeat|monitor|refer|chas|contact|book|start|stop|chang|increas|decreas|reduc|discontinu|investigat|follow[ -]?up)\w*\b/i;
const CONCRETE_REVIEW = /\breview\s+(?:the\s+)?(?:patient|medication|medicines|dose|treatment|bloods?|u\s*&?\s*e|result|symptoms?|care\s+plan)\b/i;
const GENERIC_REVIEW = /^\s*(?:urgent\s+)?gp\s+(?:to\s+)?(?:r\/?v|review)(?:\s+(?:document|letter|result))?\s*$/i;

function explicitPracticeAction(text, evidence) {
  const combined = `${text} ${evidence}`;
  const owned = PRACTICE_OWNER.test(evidence) || DIRECT_REQUEST.test(evidence) || REQUEST_TO_PRACTICE.test(evidence);
  const concrete = CONCRETE_ACTION.test(combined) || CONCRETE_REVIEW.test(combined);
  const explicitlyUrgentReview = /\b(?:urgent|immediate|prompt|must|required|within)\b/i.test(evidence)
    && PRACTICE_OWNER.test(evidence) && /\b(?:review|r\/?v)\b/i.test(evidence);
  if (GENERIC_REVIEW.test(text) && !concrete && !explicitlyUrgentReview) return false;
  return owned && (concrete || explicitlyUrgentReview);
}

export function sanitizeDocfileActions(actions, { documentText = '', hasImages = false } = {}) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(actions) ? actions : []) {
    const text = String(raw?.text || '').replace(/\s+/g, ' ').trim();
    const evidence = String(raw?.evidence || '').replace(/\s+/g, ' ').trim();
    if (!text || !evidence) continue;
    if (!hasImages && !evidenceAppears(evidence, documentText)) continue;
    if (!explicitPracticeAction(text, evidence)) continue;
    const key = comparable(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 4) break;
  }
  return out;
}

export function sanitizeDocfileNote({ note = '', noteEvidence = '', documentText = '', hasImages = false } = {}) {
  const value = String(note || '').replace(/\s+/g, ' ').trim();
  const evidence = String(noteEvidence || '').replace(/\s+/g, ' ').trim();
  if (!value || !evidence) return '';
  if (!hasImages && !evidenceAppears(evidence, documentText)) return '';
  if (!/\b(?:discharg|did not attend|\bdna\b|cancelled|deceased)\w*/i.test(`${value} ${evidence}`)) return '';
  return value;
}
