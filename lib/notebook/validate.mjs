// Is a proposed rewrite of a page safe to apply?
//
// The model that wrote the proposal is not trusted to say so. This checks, in
// code, the things a wrong rewrite would get wrong:
//
//   coverage    every sentence of the source is accounted for in the output
//   additions   every sentence of the output came from somewhere in the source
//   images      every picture line survives, character for character
//   verbatim    numbers, times, phone numbers, emails, codes and names are
//               still there, spelled the same
//   structure   a typed page still parses, and yields no fewer records
//   rules       the rewrite breaks no rule the source did not, and no error
//
// Pure. The model's meaning check is a separate call (lib/notebook/meaning.js);
// this produces the sentence pairs it judges.
import { createHash } from 'node:crypto';
import { normForMatch, quoteContainment } from '../ai/quote-match.js';
import { readPathways } from '../referrals/pathways.mjs';
import { extractEmails, extractPhones } from '../lookup/contact-extract.mjs';
import { splitSentences, stripAnnotations, isContent } from './sentences.mjs';
import { runRules } from './rules.mjs';

/** How much of a map entry must be found in an output sentence for them to be the same sentence. */
export const ALIGN_MIN = 0.85;

/** Content hash of a body, line endings normalised, so a proposal can say which text it was built from. */
export function hashBody(markdown) {
  return createHash('sha256').update(String(markdown || '').replace(/\r\n/g, '\n')).digest('hex');
}

const problem = (code, message, extra = {}) => ({ code, message, severity: 'error', ...extra });
const warning = (code, message, extra = {}) => ({ code, message, severity: 'warn', ...extra });
const check = (problems) => ({ ok: !problems.some((p) => p.severity === 'error'), problems });

/* ---------------------------------------------------------- verbatim class */

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL = /https?:\/\/[^\s)>\]]+/g;
const PHONE = /(?:\+44\s?|\b0)\d(?:[\d ]{7,11})\d(?:\s*(?:ext|x|option)\.?\s*\d{1,5})?/gi;
const NUMBER = /\b\d+(?:[.,:/-]\d+)*\b/g;
const CODE = /\b(?=[A-Z0-9-]{2,}\b)[A-Z]+[A-Z0-9-]*\b|\bA&E\b/g;
const NAME = /\b[A-Z][a-z]+(?:[ -][A-Z][a-z]+)*\b/g;
const CODE_STOP = new Set(['IF', 'IS', 'ONLY', 'AND', 'OR', 'NOT', 'THE', 'TO', 'IN', 'ON', 'AT', 'OF', 'FOR', 'ALL', 'ANY', 'NO', 'YES', 'DO', 'SAME', 'AS', 'NORMAL', 'HOW', 'WHEN', 'ALWAYS', 'NEVER', 'KEY', 'TIP', 'MUST', 'NEW', 'OLD', 'BUT', 'SO', 'BY', 'WITH', 'FROM', 'THIS', 'THAT', 'IT', 'BE', 'ARE', 'WAS', 'CAN', 'MAY', 'WILL', 'NOTE', 'PLEASE', 'ONLY', 'ALSO', 'THEN', 'THAN', 'VIA', 'PER', 'AM', 'PM']);

// Words that start sentences and instructions, not names of anything.
const NAME_STOP = new Set(['The', 'This', 'That', 'These', 'Those', 'If', 'When', 'Then', 'For', 'Use', 'Send', 'Call', 'Ask', 'Check', 'Book', 'Yes', 'No', 'Please', 'Note', 'Do', 'Not', 'Never', 'Always', 'Key', 'Tip', 'Good', 'Important', 'Step', 'Steps', 'Follow', 'Select', 'Choose', 'Click', 'Open', 'Find', 'Go', 'Add', 'Save', 'Paste', 'Enter', 'Type', 'Refer', 'Only', 'Also', 'And', 'Or', 'But', 'In', 'On', 'At', 'To', 'From', 'With', 'Once', 'After', 'Before', 'Any', 'All', 'Each', 'Every', 'Some', 'Most', 'Where', 'What', 'Which', 'Who', 'How', 'Why', 'It', 'Its', 'They', 'We', 'You', 'Our', 'Your', 'A', 'An', 'Is', 'Are', 'Was', 'Be', 'Can', 'Must', 'May', 'Should', 'Will', 'Make', 'Sure', 'Remember', 'Otherwise', 'However', 'Ensure', 'Verify', 'Record', 'Tell', 'Ring', 'Phone', 'Email', 'Print', 'Complete', 'Mark', 'Put', 'Give', 'Take', 'Keep', 'Leave', 'See', 'Read', 'Write', 'Confirm', 'Cancel', 'Update', 'Search', 'Set', 'Attach', 'Defer', 'Referral', 'Referrals', 'Appointment', 'Appointments', 'Patient', 'Patients', 'Reception', 'Doctor', 'Doctors', 'Nurse', 'Nurses', 'Practice', 'Clinic', 'Clinics', 'Form', 'Forms', 'Letter', 'Letters', 'Speciality', 'Specialty', 'Priority', 'Hospital', 'Service', 'Location', 'Standard', 'Booking', 'Bookings', 'Process', 'Procedure', 'Details', 'Information', 'Summary', 'Section', 'Page', 'Pages', 'Item', 'Selection', 'Description', 'Types', 'Type', 'Method', 'Action', 'Notes']);

const strip = (text, re) => String(text).replace(re, ' ');

/** The tokens a rewrite must carry over unchanged. */
export function extractVerbatim(text) {
  const t = String(text || '').replace(/\r\n/g, '\n');
  const emails = t.match(EMAIL) || [];
  const urls = t.match(URL) || [];
  const noLinks = strip(strip(t, EMAIL), URL);
  const phones = (noLinks.match(PHONE) || []).map((p) => p.replace(/\s+/g, ''));
  const noPhones = strip(noLinks, PHONE);
  const numbers = noPhones.match(NUMBER) || [];
  // A code is short and all caps (RP, ESP, NHS, RQX) or carries a digit (2WW,
  // B12). Long capitalised words and shouted English ("IF ONLY … IS
  // MENTIONED") are emphasis, not codes.
  const codes = (noPhones.match(CODE) || []).filter((c) => !/^\d+$/.test(c) && !CODE_STOP.has(c) && (/\d/.test(c) || c.replace(/-/g, '').length <= 6));

  // Names: capitalised runs that are not simply starting a sentence. A run at
  // the start counts only if it also appears somewhere mid-sentence.
  const mid = new Set();
  const initial = new Set();
  // Tags and markdown are not words: "<mark>Eligibility" starts a sentence.
  const plain = noPhones.replace(/<[^>]+>/g, ' ').replace(/[*_`#>|]/g, ' ');
  let m;
  const re = new RegExp(NAME.source, 'g');
  while ((m = re.exec(plain))) {
    const run = m[0];
    const words = run.split(/[ -]/);
    if (words.every((w) => NAME_STOP.has(w))) continue;
    const before = plain.slice(0, m.index).replace(/[ \t\d.)\-•]+$/, '');
    const startsSentence = !before || /[.!?:\n]$/.test(before);
    (startsSentence ? initial : mid).add(run);
  }
  const names = [...mid];
  for (const n of initial) if (mid.has(n)) names.push(n);
  return { emails, urls, phones, numbers, codes, names: [...new Set(names)] };
}

const multisetMissing = (from, to) => {
  const have = new Map();
  for (const x of to) have.set(x, (have.get(x) || 0) + 1);
  const missing = [];
  for (const x of from) {
    const n = have.get(x) || 0;
    if (n > 0) have.set(x, n - 1); else missing.push(x);
  }
  return missing;
};
const setMissing = (from, to) => { const s = new Set(to); return [...new Set(from)].filter((x) => !s.has(x)); };

/* --------------------------------------------------------------- alignment */

/**
 * Which output sentence each map entry describes. Exact normalised match
 * first; else the ONE output sentence the entry is mostly contained in (or
 * that mostly contains it). Entries pointing at the same sentence merge.
 */
export function alignMap(outSentences, map) {
  const byOut = new Map(); // outId -> { out, from:Set, entries:[] }
  const unmatched = [];
  const content = outSentences.filter(isContent);
  for (const entry of map || []) {
    const n = normForMatch(String(entry?.text || ''));
    if (!n) { unmatched.push(entry); continue; }
    let hit = content.find((o) => o.norm === n) || null;
    if (!hit) {
      const near = content.filter((o) => quoteContainment(n, o.norm, { minRun: 12 }) >= ALIGN_MIN || quoteContainment(o.norm, n, { minRun: 12 }) >= ALIGN_MIN);
      if (near.length === 1) hit = near[0];
    }
    if (!hit) { unmatched.push(entry); continue; }
    if (!byOut.has(hit.id)) byOut.set(hit.id, { out: hit, from: new Set(), entries: [] });
    const rec = byOut.get(hit.id);
    for (const id of entry.from || []) rec.from.add(String(id));
    rec.entries.push(entry);
  }
  return { aligned: [...byOut.values()], unmatched };
}

/* --------------------------------------------------------------- validate */

/**
 * @param {{ sourceBody: string, proposal: {body:string, map:Array, dropped?:Array},
 *           page: {docTitle:string, text:string}, typed: 'pathway'|'contacts'|null }} args
 */
export function validateProposal({ sourceBody, proposal, page, typed = null }) {
  const source = String(sourceBody || '').replace(/\r\n/g, '\n');
  const body = stripAnnotations(String(proposal?.body || '')).replace(/\r\n/g, '\n').trim();
  const src = splitSentences(source);
  const out = splitSentences(body);
  const srcById = new Map(src.map((s) => [s.id, s]));

  const checks = {};

  // Annotation tokens that leaked into the page.
  const leak = /\[s\d+\]/.test(String(proposal?.body || ''));

  // Additions: every content sentence written came from the source.
  const { aligned, unmatched } = alignMap(out, proposal?.map || []);
  const alignedIds = new Set(aligned.map((a) => a.out.id));
  const additions = [];
  if (leak) additions.push(problem('annotation-leak', 'Sentence markers like [s3] were left in the text.'));
  if (!body) additions.push(problem('empty', 'The proposal is empty.'));
  for (const o of out) {
    if (!isContent(o)) continue;
    if (!alignedIds.has(o.id)) additions.push(problem('unmapped-output', `Not traced to the source: “${o.text}”`, { sentenceIds: [o.id] }));
  }
  for (const a of aligned) {
    for (const id of a.from) if (!srcById.has(id)) additions.push(problem('unknown-source', `“${a.out.text}” cites ${id}, which is not a source sentence.`, { sentenceIds: [a.out.id] }));
  }
  for (const e of unmatched) additions.push(warning('map-text-not-in-body', `A map entry does not match any sentence of the text: “${String(e?.text || '').slice(0, 80)}”`));
  const srcHeadings = src.filter((s) => s.kind === 'heading');
  for (const o of out) {
    if (o.kind !== 'heading') continue;
    const known = srcHeadings.some((h) => h.norm === o.norm) || src.some((s) => quoteContainment(o.norm, s.norm, { minRun: 8 }) >= ALIGN_MIN);
    if (!known) additions.push(warning('new-heading', `New heading “${o.text}” — headings are structure, so this is allowed, but check it says nothing new.`, { sentenceIds: [o.id] }));
  }
  checks.additions = check(additions);

  // Coverage: every content sentence of the source is carried by something.
  const covered = new Set();
  for (const a of aligned) for (const id of a.from) covered.add(id);
  const dropped = new Map((proposal?.dropped || []).map((d) => [String(d?.id || ''), String(d?.why || '')]));
  const coverage = [];
  for (const s of src) {
    if (!isContent(s)) continue;
    if (covered.has(s.id)) continue;
    if (dropped.has(s.id)) {
      const twin = src.find((t) => t.id !== s.id && t.norm === s.norm && covered.has(t.id));
      if (twin) continue;
      coverage.push(problem('dropped-not-duplicate', `Dropped, but it is not a duplicate of anything kept: “${s.text}”`, { sentenceIds: [s.id] }));
      continue;
    }
    coverage.push(problem('uncovered', `Not carried over: “${s.text}”`, { sentenceIds: [s.id] }));
  }
  checks.coverage = check(coverage);

  // Images: exact lines, in and out.
  const images = [];
  const srcImages = src.filter((s) => s.kind === 'image').map((s) => s.text);
  const outImages = out.filter((s) => s.kind === 'image').map((s) => s.text);
  for (const line of srcImages) if (!body.includes(line)) images.push(problem('image-lost', `Picture line missing or altered: ${line.slice(0, 80)}`));
  for (const line of outImages) if (!source.includes(line)) images.push(problem('image-added', `Picture line not in the source: ${line.slice(0, 80)}`));
  checks.images = check(images);

  // Verbatim class.
  const before = extractVerbatim(source);
  const after = extractVerbatim(body);
  const verbatim = [];
  const report = (kind, missing, extra, sev = 'error') => {
    if (missing.length) verbatim.push((sev === 'error' ? problem : warning)(`${kind}-missing`, `${kind} missing or changed: ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? ' …' : ''}`, { detail: missing }));
    if (extra.length) verbatim.push((sev === 'error' ? problem : warning)(`${kind}-added`, `${kind} not in the source: ${extra.slice(0, 6).join(', ')}${extra.length > 6 ? ' …' : ''}`, { detail: extra }));
  };
  report('emails', setMissing(before.emails, after.emails), setMissing(after.emails, before.emails));
  report('urls', setMissing(before.urls, after.urls), setMissing(after.urls, before.urls));
  report('phones', setMissing(before.phones, after.phones), setMissing(after.phones, before.phones));
  // Presence, not count: merging two sentences that both say 08:30 leaves one
  // 08:30, and that is the point of merging them.
  report('numbers', setMissing(before.numbers, after.numbers), setMissing(after.numbers, before.numbers));
  report('codes', setMissing(before.codes, after.codes), setMissing(after.codes, before.codes));
  report('names', setMissing(before.names, after.names), [], 'error');
  const extraNames = setMissing(after.names, before.names);
  if (extraNames.length) verbatim.push(warning('names-added', `Capitalised words not in the source: ${extraNames.slice(0, 6).join(', ')}`, { detail: extraNames }));
  checks.verbatim = check(verbatim);

  // Structure: typed pages still parse, and lose nothing.
  const structure = [];
  const newPage = { ...(page || {}), text: body };
  if (typed === 'pathway' && page) {
    const was = readPathways([page]);
    const now = readPathways([newPage]);
    const key = (r) => normForMatch(r.specialty) + '|' + normForMatch(r.clinicType);
    const wasKeys = new Set(was.map(key));
    const nowKeys = new Set(now.map(key));
    if (now.length < was.length) structure.push(problem('pathway-records-lost', `The page recorded ${was.length} referral pathway${was.length === 1 ? '' : 's'}; the rewrite records ${now.length}.`));
    for (const k of wasKeys) if (!nowKeys.has(k)) structure.push(problem('pathway-pairing-lost', `Speciality / clinic type pairing lost: ${k.replace('|', ' / ')}`));
    if (!was.length && !now.length) structure.push(warning('pathway-unparsed', 'Neither the source nor the rewrite yields a speciality and clinic type the assistant can read.'));
  }
  if (typed === 'contacts' && page) {
    const p0 = extractPhones(source).length, p1 = extractPhones(body).length;
    const e0 = extractEmails(source).length, e1 = extractEmails(body).length;
    if (p1 < p0) structure.push(problem('phones-lost', `${p0} phone numbers became ${p1}.`));
    if (e1 < e0) structure.push(problem('emails-lost', `${e0} email addresses became ${e1}.`));
  }
  checks.structure = check(structure);

  // Rules: no worse than the source, and no error at all.
  const ctx = (text, sentences) => ({ note: { id: 0, title: String(page?.docTitle || '').split(' / ').pop() || '', body: text }, path: [], sentences, page: { ...(page || {}), text }, typed, dupIndex: null });
  const wasV = page ? runRules(ctx(source, src)) : [];
  const nowV = page ? runRules(ctx(body, out)) : [];
  const rules = [];
  for (const v of nowV) if (v.severity === 'error') rules.push(problem('rule-error', v.message, { rule: v.rule }));
  const soft = (vs) => vs.filter((v) => v.severity !== 'error' && v.rule !== 'duplicate').length;
  if (soft(nowV) > soft(wasV)) rules.push(problem('rules-worse', `The rewrite breaks ${soft(nowV)} rules where the source broke ${soft(wasV)}: ${nowV.filter((v) => v.severity !== 'error').map((v) => v.rule).join(', ')}.`));
  checks.rules = check(rules);

  // Pairs for the meaning check and the review.
  const pairs = aligned.map((a) => {
    const fromIds = [...a.from].filter((id) => srcById.has(id));
    const beforeText = fromIds.map((id) => srcById.get(id).text).join(' ');
    const afterText = a.out.text;
    return {
      id: createHash('sha1').update(beforeText + ' ' + afterText).digest('hex').slice(0, 12),
      outId: a.out.id,
      before: beforeText,
      after: afterText,
      fromIds,
      same: normForMatch(beforeText) === a.out.norm,
    };
  });

  const ok = Object.values(checks).every((c) => c.ok);
  return { ok, checks, pairs, outSentences: out, sourceSentences: src, body, violationsBefore: wasV, violationsAfter: nowV };
}
