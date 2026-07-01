// Deterministic practice contacts directory. The numbers/emails live here as
// structured data (generated from "Useful Telephone Numbers"), NOT in the RAG
// index, and are shown to the reader verbatim from this data — the model is told
// never to write a number itself. So a contact number can never be mis-typed by
// the AI: what you see is exactly what's in this file.
//
// To update: edit lib/contacts.data.json (label / phones[].display+tel / emails).
import DATA from './contacts.data.json';

// Generic words that shouldn't drive a match (almost every entry has them), so a
// query like "book an appointment" doesn't return the whole directory.
const STOP = new Set([
  'number', 'numbers', 'line', 'lines', 'tele', 'telephone', 'phone', 'phones',
  'email', 'emails', 'mail', 'appt', 'appointment', 'appointments', 'booking',
  'contact', 'contacts', 'service', 'services', 'dept', 'department', 'departments',
  'ref', 'referral', 'team', 'teams', 'nhs', 'huh', 'rlh', 'the', 'and', 'for',
  'patient', 'patients', 'book', 'booked', 'call', 'phone', 'telephone',
]);

function queryTokens(q) {
  return (String(q).toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((t) => !STOP.has(t));
}

// Pure matcher (testable): score each entry by how many distinct meaningful query
// tokens appear in its label/emails. Only entries matched on a specific term are
// returned, best first.
export function matchContactsIn(entries, query, limit = 5) {
  const toks = queryTokens(query);
  if (!toks.length) return [];
  const scored = [];
  for (const e of entries) {
    const hay = (e.label + ' ' + (e.emails || []).join(' ')).toLowerCase();
    const seen = new Set();
    let score = 0;
    for (const t of toks) { if (!seen.has(t) && hay.includes(t)) { seen.add(t); score++; } }
    if (score > 0) scored.push({ e, score });
  }
  scored.sort((a, b) => b.score - a.score || a.e.label.length - b.e.label.length);
  return scored.slice(0, limit).map((s) => s.e);
}

export function matchContacts(query, limit = 5) {
  return matchContactsIn(DATA, query, limit);
}

// ---- number-safety guard ---------------------------------------------------
export function digitsOf(s) {
  return String(s).replace(/[^\d]/g, '');
}

// Verified telephone numbers from the directory (>= 9 digits), as digit strings.
let _telSet = null;
export function contactTelSet() {
  if (_telSet) return _telSet;
  _telSet = new Set();
  for (const e of DATA) for (const p of (e.phones || [])) {
    const d = digitsOf(p.tel);
    if (d.length >= 9) _telSet.add(d);
  }
  return _telSet;
}

// A phone-number-like run: >= ~9 digits, so short codes like 999 / 111 are safe.
const PHONE_RUN = /(?:\+?\d[\d ()\/-]{7,}\d)/g;

// Remove any phone-number-like run from AI-authored text unless it exactly
// matches a verified number (from the directory or a retrieved source). This
// guarantees a mis-transcribed number is never displayed; the correct number is
// shown separately in the contacts card.
export function redactUnverifiedNumbers(text, verified) {
  if (!text) return text;
  return String(text).replace(PHONE_RUN, (run) => {
    const d = digitsOf(run);
    if (d.length < 9) return run;
    return verified && verified.has(d) ? run : '(see contacts below)';
  });
}
