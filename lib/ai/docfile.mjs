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
  // Date of birth is always disqualifying, whatever else is near it.
  if (/date\s+of\s+birth|\bdob\b|born\s+(?:on\s+)?$/.test(label)) return -1000;
  // A version/reference token such as "v1.2.34" looks like a dotted date but is
  // never a clinical date — exclude it (its label ends with "v" or "version").
  if (/\bv(?:er|ersion)?\.?\s*$/.test(label)) return -600;
  // A positive event label in the date's OWN preceding text classifies it, and
  // must be decided BEFORE the received/scanned penalty: otherwise a correctly
  // labelled discharge date is wrongly demoted when the NEXT date's "received"
  // label happens to fall within this date's short look-ahead window.
  if (/discharge\s+date|date\s+of\s+discharge|discharged\s+(?:on\s+)?$/.test(label)) return 140;
  if (/attendance\s+date|date\s+of\s+attendance|attended\s+(?:on\s+)?$/.test(label)) return 130;
  if (/clinic\s+date|appointment\s+date|consultation\s+date|date\s+seen|seen\s+(?:on\s+)?$/.test(label)) return 120;
  if (/report\s+date|date\s+of\s+report|procedure\s+date|test\s+date/.test(label)) return 110;
  if (/event\s+date|episode\s+date/.test(label)) return 100;
  // "received/scanned/printed" marks a filing date, never the clinical event
  // date. Judge it from the date's own label, or from a qualifier that
  // IMMEDIATELY follows it ("07/08/2026 (scanned)") — not from text 35 chars
  // away, which is usually the following date's label.
  if (/received|scanned|uploaded|printed|processed|imported/.test(label)
      || /^\s*[)\]]?\s*(?:received|scanned|uploaded|printed|processed|imported)/.test(after.slice(0, 14))) return -500;
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

// ---------------------------------------------------------------------------
// Active items.
//
// The title carries what the GP has to know NOW, and nothing else. Three kinds
// of item earn their place:
//   task       — the practice is asked to do something (arrange, prescribe,
//                repeat, monitor, refer, chase, book)
//   medication — a drug started, stopped, changed, or handed to us to continue
//   plan       — what happens next: follow-up, referral made, results awaited,
//                monitoring due, care handed back to the GP
// The story of the admission — presenting complaint, history, examination,
// findings, social background — is dropped, whatever the model sends back.
// ---------------------------------------------------------------------------

const PRACTICE_OWNER = /\b(?:gp|general practitioner|primary care|the practice|practice team|family doctor|your doctor)\b/i;
// "Please …" is the letter asking us, whoever it names; the concrete-verb test
// below is what keeps "please note" and "please see attached" out.
const DIRECT_REQUEST = /\b(?:please|kindly)\b/i;
const REQUEST_TO_PRACTICE = /\b(?:we\s+(?:would be grateful|recommend|request|ask)\s+(?:if\s+)?(?:you|the gp|primary care|the practice))\b/i;
// A list the document itself heads as work for us ("Actions for GP:", "TTA").
const ACTION_HEADING = /\b(?:actions?\s+(?:for|required|requested|needed)|gp\s+actions?|primary\s+care\s+actions?|tasks?\s+for|requests?\s+(?:to|of)\s+(?:the\s+)?gp)\b/i;
const CONCRETE_ACTION = /\b(?:arrang|prescrib|issu|request|repeat|re-?check|check|monitor|refer|chas|contact|book|organis|organiz|start|re-?start|reinstat|stop|chang|increas|decreas|reduc|titrat|discontinu|investigat|ensur|obtain|perform|send|complet|continu|follow[ -]?up)\w*\b/i;
const CONCRETE_REVIEW = /\breview\s+(?:the\s+)?(?:patient|medication|medicines|dose|treatment|bloods?|u\s*&?\s*e|result|symptoms?|care\s+plan)\b/i;
const GENERIC_REVIEW = /^\s*(?:urgent\s+)?gp\s+(?:to\s+)?(?:r\/?v|review)(?:\s+(?:document|letter|result))?\s*$/i;

// A medication item: something that names a drug or dose AND a change to it.
// A medication list copied over unchanged has no change word, so it drops out.
const MED_CONTEXT = /\b(?:medication|medicines?|drugs?|dose|doses|dosage|tablets?|capsules?|inhaler|patch|injection|infusion|antibiotics?|statin|anticoagulant|analgesi\w+|prescription|prescrib\w+|\brx\b|tta|tto|mg|mcg|microgram|\bg\b|ml|units?|\bod\b|\bbd\b|\btds\b|\bqds\b|\bprn\b|course)\b/i;
// …and the wording that says the list was copied over untouched, which is the
// GP's own repeat template coming back at them.
const MED_NO_CHANGE = /\b(?:no\s+(?:change|changes|new\s+(?:medication|medicines|drugs?)|other\s+changes)|unchanged|remains?\s+on|continues?\s+on\s+(?:their|her|his|the)\s+usual|as\s+before)\b/i;
const MED_CHANGE = /\b(?:start\w*|commenc\w+|initiat\w+|new\w*|prescrib\w+|re-?prescrib\w+|switch\w+|swap\w*|chang\w+|increas\w+|decreas\w+|reduc\w+|up-?titrat\w+|titrat\w+|stop\w*|discontinu\w+|withh\w+|omitt?\w+|held|hold|continu\w+|complet\w+|suppl\w+|dispens\w+|issu\w+|repeat\w*|add\w*)\b/i;
// A prescribing verb strong enough to make the item a medication item on its
// own, for the common line that names the drug and nothing else ("Ramipril
// stopped due to AKI") — the drug name itself is not something we can list.
const MED_STRONG_CHANGE = /\b(?:started?\s+on|started|commenc\w+|initiat\w+|prescrib\w+|re-?start\w*|reinstat\w+|switch\w+|swapp?ed|stopp?ed|discontinu\w+|withheld|withhold|up-?titrat\w+|titrat\w+|new\s+(?:medication|prescription))\b/i;
// Lifestyle, not prescribing: "stopped smoking" is history, not a drug change.
const LIFESTYLE = /\b(?:smok\w+|cigarette|alcohol|drink\w+|vap\w+|diet|exercis\w+)\b/i;
// A plan item: something still to happen, to us or to another service.
const PLAN_MARKER = /\b(?:plan|follow[\s-]?up|f\/?u|review\s+in|re-?review|to\s+be\s+seen|will\s+be\s+seen|we\s+will|awaiting|await\w*|pending|outstanding|referr\w+|refer\w*\s+(?:to|for)|listed\s+for|booked|appointment|clinic\s+in|recall|results?\s+to\s+follow|due\s+in|next\s+(?:review|appointment)|in\s+\d+\s*(?:days?|weeks?|months?)|\d+\s*\/\s*(?:7|52|12)|discharged?\s+(?:to|back\s+to|under)|under\s+(?:the\s+)?care\s+of|monitor\w*|repeat\w*)\b/i;
// Evidence quoted from the narrative part of the letter is never an active item.
const NARRATIVE = /\b(?:past\s+medical\s+history|\bpmh\b|drug\s+history|\bdhx\b|social\s+history|family\s+history|on\s+examination|\bo\/e\b|presented\s+with|presenting\s+complaint|history\s+of\s+presenting|background\s*:)\b/i;

// An item is a title fragment, not a sentence. Anything this long is the story
// the GP asked us to leave out.
const MAX_ITEM_CHARS = 90;
const MAX_ITEMS = 6;
const KIND_ORDER = { task: 0, medication: 1, plan: 2 };

function urgentPracticeReview(evidence) {
  return /\b(?:urgent|immediate|prompt|must|required|within)\b/i.test(evidence)
    && PRACTICE_OWNER.test(evidence) && /\b(?:review|r\/?v)\b/i.test(evidence);
}

function explicitPracticeAction(text, evidence) {
  const combined = `${text} ${evidence}`;
  const owned = PRACTICE_OWNER.test(evidence) || DIRECT_REQUEST.test(evidence)
    || REQUEST_TO_PRACTICE.test(evidence) || ACTION_HEADING.test(evidence);
  const concrete = CONCRETE_ACTION.test(combined) || CONCRETE_REVIEW.test(combined);
  return owned && (concrete || urgentPracticeReview(evidence));
}

// '' means the item is not an active item and is dropped.
function activeItemKind(text, evidence) {
  const combined = `${text} ${evidence}`;
  // "GP to review" as the whole item is filing noise, not a task: it tells the
  // GP nothing they do not already know from the document landing in their
  // inbox. Only a named urgent issue survives.
  if (GENERIC_REVIEW.test(text) && !urgentPracticeReview(evidence)) return '';
  if (NARRATIVE.test(evidence)) return '';
  if (explicitPracticeAction(text, evidence)) return 'task';
  const medication = MED_CONTEXT.test(combined)
    ? MED_CHANGE.test(combined)
    : MED_STRONG_CHANGE.test(combined) && !LIFESTYLE.test(combined);
  if (medication && !MED_NO_CHANGE.test(combined)) return 'medication';
  if (PLAN_MARKER.test(combined)) return 'plan';
  return '';
}

// The active items with their kind, most actionable first: what we must do,
// then what changed on the prescription, then what is already planned.
export function docfileActiveItems(actions, { documentText = '', hasImages = false } = {}) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(actions) ? actions : []) {
    const text = String(raw?.text || '').replace(/\s+/g, ' ').trim().replace(/\s*\.$/, '');
    const evidence = String(raw?.evidence || '').replace(/\s+/g, ' ').trim();
    if (!text || !evidence || text.length > MAX_ITEM_CHARS) continue;
    if (!hasImages && !evidenceAppears(evidence, documentText)) continue;
    const kind = activeItemKind(text, evidence);
    if (!kind) continue;
    const key = comparable(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ text, kind });
    if (out.length >= MAX_ITEMS * 2) break;
  }
  // Stable sort, so the model's own ordering survives inside each kind.
  return out.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).slice(0, MAX_ITEMS);
}

export function sanitizeDocfileActions(actions, options) {
  return docfileActiveItems(actions, options).map((item) => item.text);
}

export function sanitizeDocfileNote({ note = '', noteEvidence = '', documentText = '', hasImages = false } = {}) {
  const value = String(note || '').replace(/\s+/g, ' ').trim();
  const evidence = String(noteEvidence || '').replace(/\s+/g, ' ').trim();
  if (!value || !evidence) return '';
  if (!hasImages && !evidenceAppears(evidence, documentText)) return '';
  if (!/\b(?:discharg|did not attend|\bdna\b|cancelled|deceased)\w*/i.test(`${value} ${evidence}`)) return '';
  return value;
}
