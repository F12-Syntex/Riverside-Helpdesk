// One-off restructure of the Notebook into modular, single-topic pages.
//
// WHY
// The Notebook grew by accretion: "Referral types and processes" existed three
// times over, one page held ten unrelated referral pathways, another held a
// contact directory plus a sick-note policy plus shared passwords, and six
// pages sat loose at a section root duplicating pages inside it. Search picks a
// page by its title and its words, so a page about ten things is a page that
// matches every question and answers none of them precisely.
//
// THE RULE THIS ENFORCES: one page answers one question. A page's title is the
// question a staff member would ask, in the words they would ask it.
//
// HOW IT MOVES TEXT — AND WHY NOTHING CAN BE LOST
// Nothing here rewrites, summarises or regenerates any note. The plan addresses
// existing text by (note id, heading) and moves those exact characters. Every
// character of every source body is accounted for: the slicer marks each range
// as it is claimed, and the coverage pass fails loudly if any non-whitespace
// text was never claimed by the plan. Losing a fact is a build error, not
// something to be noticed later by a receptionist.
//
// Near-duplicate passages are NOT deleted. They go to a "Needs review" section,
// named as duplicates, so the working tree is clean while the decision about
// which wording to keep stays with the practice.
//
// USAGE
//   node scripts/notebook-restructure.mjs .            # dry run + coverage report
//   node scripts/notebook-restructure.mjs . --apply    # write it
// A full JSON backup is written to scripts/notebook-backup.json before any write.
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const root = process.argv[2] || '.';
const APPLY = process.argv.includes('--apply');

for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

/* ---------------------------------------------------------------- slicing */

// A note's headings, as ranges over its own body. `level` 0 is the text before
// the first heading. Ranges are half-open [start, end) character offsets.
function headingsOf(body) {
  const out = [];
  const re = /^(#{2,4})\s+(.+)$/gm;
  let m;
  const marks = [];
  while ((m = re.exec(body))) marks.push({ level: m[1].length, title: m[2].trim(), at: m.index, after: m.index + m[0].length });
  if (!marks.length) return [{ level: 0, title: '*', start: 0, end: body.length, ownEnd: body.length }];
  if (body.slice(0, marks[0].at).trim()) {
    out.push({ level: 0, title: '(intro)', start: 0, end: marks[0].at, ownEnd: marks[0].at });
  }
  for (let i = 0; i < marks.length; i++) {
    const me = marks[i];
    // Ends at the next heading of the same or higher rank (children included).
    let end = body.length;
    for (let j = i + 1; j < marks.length; j++) {
      if (marks[j].level <= me.level) { end = marks[j].at; break; }
    }
    // "own" text stops at the first child heading.
    const ownEnd = i + 1 < marks.length && marks[i + 1].at < end ? marks[i + 1].at : end;
    out.push({ level: me.level, title: me.title, start: me.at, end, ownEnd });
  }
  return out;
}

const notesById = new Map();
const claimed = new Map(); // noteId -> array of [start,end)

function claim(noteId, start, end) {
  if (!claimed.has(noteId)) claimed.set(noteId, []);
  claimed.get(noteId).push([start, end]);
}

// Pull one addressed slice of a note's body, and mark it consumed.
//   take(213, 'Telederm Referrals')            heading + everything under it
//   take(175, 'Referral Process', { own: 1 })  heading + text before its children
//   take(272, '*')                             the whole body
function take(noteId, heading, { own = false } = {}) {
  const note = notesById.get(noteId);
  if (!note) throw new Error(`plan references missing note #${noteId}`);
  const body = String(note.body || '');
  if (heading === '*') { claim(noteId, 0, body.length); return body.trim(); }
  const hs = headingsOf(body);
  let found = hs.filter((h) => h.title === heading);
  // A note with no headings at all is one unheaded block; "(intro)" is the
  // natural way for the plan to address it, so accept that spelling too.
  if (!found.length && heading === '(intro)' && hs.length === 1 && hs[0].title === '*') found = hs;
  if (!found.length) throw new Error(`#${noteId}: no heading "${heading}" (has: ${hs.map((h) => h.title).join(' | ')})`);
  if (found.length > 1 && !own) {
    // Two identical headings in one note (#214 does this). Take them all.
    let text = '';
    for (const h of found) { claim(noteId, h.start, h.end); text += (text ? '\n\n' : '') + body.slice(h.start, h.end).trim(); }
    return text;
  }
  const h = found[0];
  const end = own ? h.ownEnd : h.end;
  claim(noteId, h.start, end);
  return body.slice(h.start, end).trim();
}

// Some pages separate their topics with a bold label rather than a heading, so
// the slicer cannot see the boundary. `between` cuts an already-taken block at
// those labels. Claiming is a union of ranges, so taking the same heading twice
// and cutting it two ways still leaves the source fully covered exactly once.
function between(text, startLabel, endLabel) {
  const from = startLabel ? text.indexOf(startLabel) : 0;
  const start = from === -1 ? 0 : from;
  const at = endLabel ? text.indexOf(endLabel, start + 1) : -1;
  return text.slice(start, at === -1 ? text.length : at).trim();
}

/* ------------------------------------------------------------------- plan */
// Each entry: section, optional sub-section, page title, and how it is built.
// Page titles are the retrieval key: specific, in staff words, one topic each.

function plan() {
  const P = [];
  const add = (section, sub, page, build) => P.push({ section, sub, page, build });

  /* ---------------------------------------------------------- Referrals */
  add('Referrals', 'How to refer', 'Standard referral flow (e-RS)', () => [
    take(175, 'Referral Process', { own: true }),
    take(175, 'Step 1 — Get the referral letter from the consultation'),
    take(175, 'Step 2 — Choose the route'),
    take(175, 'Step 3 — Sending a Referral via ERS (e-Referral Service)'),
    take(215, 'Base Referral with Images'),
  ].join('\n\n'));

  add('Referrals', 'How to refer', 'Creating the referral letter', () => take(249, '*'));
  add('Referrals', 'How to refer', 'Emailing a referral', () => take(175, 'Emailing the Referral Letter'));
  add('Referrals', 'How to refer', 'e-RS or email — which route to use', () => take(179, '(intro)'));
  add('Referrals', 'How to refer', 'Referrals that can be emailed', () => [
    take(180, '(intro)'),
    take(221, 'Email Referrals'),
  ].join('\n\n'));
  add('Referrals', 'How to refer', 'Who to name as the referring clinician', () => [
    take(229, 'Referral Process', { own: true }),
    take(229, 'Referral Routing'),
  ].join('\n\n'));
  add('Referrals', 'How to refer', 'Cancer referrals — two week wait (2WW)', () => take(250, '*'));
  add('Referrals', 'How to refer', 'Which specialities have a community version', () => [
    take(183, '(intro)'),
    take(213, 'GP Referrals to Community Dermatology'),
  ].join('\n\n'));
  add('Referrals', 'How to refer', 'Paediatric referrals', () => take(213, 'Paediatric Referrals'));
  add('Referrals', 'How to refer', 'Form requirements — ECG and echo', () => take(213, 'Form Requirements'));
  add('Referrals', 'How to refer', 'Unprotecting a protected Word form', () => take(213, 'File Protection (Microsoft Word)'));

  // One page per pathway. This is the change that makes retrieval precise: a
  // question about a hearing test now matches a page about hearing tests.
  add('Referrals', 'Referral pathways', 'Audiology / hearing test referral', () => [
    take(213, 'Hearing Test Referral'),
    take(221, 'Audiology Referral'),
  ].join('\n\n'));
  add('Referrals', 'Referral pathways', 'BCG referral (TB vaccine)', () => [
    take(176, '(intro)'),
    take(176, 'Step 1 — Confirm eligibility (check ethnicity)'),
    take(176, 'Step 2 — Create the referral'),
    take(176, 'Step 3 — Send'),
  ].join('\n\n'));
  add('Referrals', 'Referral pathways', 'Chronic fatigue (CFS) referral', () => take(182, '(intro)'));
  add('Referrals', 'Referral pathways', 'Dermatology and Telederm referrals', () => take(213, 'Telederm Referrals'));
  add('Referrals', 'Referral pathways', 'Diabetes education referral (EDDI)', () => take(177, '(intro)'));
  add('Referrals', 'Referral pathways', 'Retinal / diabetic eye screening referral', () => take(178, '(intro)'));
  add('Referrals', 'Referral pathways', 'District Nurse / Adult Community Nursing (ACN) referral', () => take(221, 'District Nurse (DN) / Adult Community Nursing (ACN) Referrals'));
  add('Referrals', 'Referral pathways', 'ECG and 48-hour tape referral', () => take(181, '(intro)'));
  add('Referrals', 'Referral pathways', 'Echo (RP Echo) referral and results', () => take(188, 'RP Echo Procedure'));
  add('Referrals', 'Referral pathways', 'Fertility referral', () => take(230, 'Fertility Referral'));
  add('Referrals', 'Referral pathways', 'Foot clinic / podiatry (at-risk foot) referral', () => [
    take(229, 'Podiatry - At-Risk Foot Clinic Referral', { own: true }),
    take(229, 'General Clinic Information'),
    take(213, 'Foot Clinic Procedures'),
  ].join('\n\n'));
  add('Referrals', 'Referral pathways', 'General surgery referral — hernias', () => take(213, 'General Surgery Referrals: Hernias'));
  add('Referrals', 'Referral pathways', 'Gym referral', () => between(
    take(229, 'Specific Referral Scenarios'), 'Gym Referral', 'Community Gynaecology Referral',
  ));
  add('Referrals', 'Referral pathways', 'Community gynaecology referral', () => between(
    take(229, 'Specific Referral Scenarios'), 'Community Gynaecology Referral', null,
  ));
  add('Referrals', 'Referral pathways', 'Minor eye service — styes (Rose Opticians)', () => take(180, 'Styes – Minor Eye Service'));
  add('Referrals', 'Referral pathways', 'Orthopaedics referral — upper and lower limb', () => take(221, 'Upper Limb Orthopaedics Surgery Referral'));
  add('Referrals', 'Referral pathways', 'Pain management referral', () => take(213, 'Pain Management Referral'));
  add('Referrals', 'Referral pathways', 'Physiotherapy (FCP) and Extended Scope Physiotherapy', () => take(221, 'Specialist Referrals'));
  add('Referrals', 'Referral pathways', 'Rapid Access Chest Pain Clinic (RACPC) referral', () => take(213, 'Rapid Access Chest Pain Clinic (RACPC) Referral'));
  add('Referrals', 'Referral pathways', 'Sleep apnoea / sleep-disordered breathing referral', () => take(213, 'Sleep Medicine Referrals'));
  add('Referrals', 'Referral pathways', 'Social prescriber referral', () => take(184, '(intro)'));
  add('Referrals', 'Referral pathways', 'Minor surgery referral (Nightingale Practice)', () => take(213, 'Minor Surgery Referrals'));
  add('Referrals', 'Referral pathways', 'Community and general referral list', () => [
    take(221, 'Referral Information', { own: true }),
    take(221, 'General Referrals'),
    take(221, 'Specific Service Referrals'),
  ].join('\n\n'));

  /* ------------------------------------------------- Documents & filing */
  add('Documents and filing', null, 'Filing incoming documents', () => take(186, '(intro)'));
  add('Documents and filing', null, 'GP Connect — what it means', () => take(186, 'What GP Connect means'));
  add('Documents and filing', null, 'Titling clinic and clinical letters', () => [
    take(188, '(intro)'),
    take(188, "If the department isn't stated"),
  ].join('\n\n'));
  add('Documents and filing', null, 'A&E attendance documents during surgery hours', () => [
    take(189, '(intro)'),
    take(189, 'How to log it'),
    take(224, 'Document Handling', { own: true }),
    take(224, 'ANE Documents'),
  ].join('\n\n'));
  add('Documents and filing', null, 'Rejecting a document that is not ours', () => take(190, '(intro)'));
  add('Documents and filing', null, 'Prescriptions on incoming documents', () => take(191, '(intro)'));
  add('Documents and filing', null, 'Reading any document — checklist', () => take(192, '(intro)'));
  add('Documents and filing', null, 'Common document titles', () => take(192, 'Common Document Titles'));
  add('Documents and filing', null, 'Scanning documents', () => [
    take(217, 'Document Scanning Procedure'),
    take(187, '(intro)'),
  ].join('\n\n'));
  add('Documents and filing', null, 'Scanning — which task type to raise', () => take(219, 'Scanning Documents: Workflow Task Protocol'));
  add('Documents and filing', null, 'Universal Credit health assessment documents', () => take(224, 'Universal Credit Health Assessment Advisory Service Documents'));
  add('Documents and filing', null, 'Mammography and breast screening coding', () => take(228, 'Mammography and Breast Screening'));

  /* ------------------------------------------------------- Appointments */
  add('Appointments and booking', null, 'Booking a doctor appointment (telephone or f2f)', () => take(201, '(intro)'));
  add('Appointments and booking', null, 'Finding a free slot quickly', () => take(201, 'Quickly finding a slot'));
  add('Appointments and booking', null, 'Booking a future doctor appointment', () => take(201, 'Booking a future doctor appointment'));
  add('Appointments and booking', null, 'Online consultations — booking and comments', () => take(202, 'Online consultations'));
  add('Appointments and booking', null, 'Acknowledging incoming requests', () => take(202, 'Acknowledging requests'));
  add('Appointments and booking', null, 'Signposting patients to the online form', () => take(199, 'Signpost to the online form'));
  add('Appointments and booking', null, 'Late patients', () => take(199, 'Late patients'));
  add('Appointments and booking', null, 'Appointment types and booking rules', () => take(222, 'Appointment Booking and Types'));
  add('Appointments and booking', null, 'FCP follow-up appointments', () => take(218, 'FCP Follow-Up Process'));
  add('Appointments and booking', null, 'Dr Rishi booking tasks — set 1Telephone Review', () => take(267, 'Task by Rishi'));
  add('Appointments and booking', null, 'Pharmacist calls and prescription requests', () => take(200, '(intro)'));

  /* ------------------------------------------------- Nurse & HCA clinics */
  add('Nurse and HCA clinics', null, 'Nurse and HCA services, and which days', () => [
    take(204, '(intro)'),
    take(204, 'Diabetes Appointments'),
  ].join('\n\n'));
  add('Nurse and HCA clinics', null, 'Reviews that need a blood test first', () => take(205, '(intro)'));
  add('Nurse and HCA clinics', null, 'HRT and contraception — what the nurse needs', () => take(205, 'Additional Clinical Notes'));

  /* -------------------------------------------------------- Blood tests */
  add('Blood tests', null, 'Booking a blood test', () => take(268, 'How to Book a Blood Test'));
  add('Blood tests', null, 'Creating a blood test form', () => take(223, 'Blood Test Procedures'));
  add('Blood tests', null, 'Where blood test clinics are held', () => take(216, 'Blood Test Clinics'));
  add('Blood tests', null, 'Blood results at the front desk', () => take(198, '(intro)'));
  add('Blood tests', null, 'Chasing blood test results (triage)', () => take(167, 'Patient Query: Blood Test Results'));

  /* --------------------------------------------- Registration & records */
  add('Registration and records', null, 'Registration day', () => take(207, '(intro)'));
  add('Registration and records', null, 'Registering a patient on EMIS', () => [
    take(227, 'New Patient Registration'),
    take(227, 'How to register a patient on EMIS'),
  ].join('\n\n'));
  add('Registration and records', null, 'Lloyd George (LG) paper records', () => take(208, 'Lloyd George (LG) Record Digitisation Status'));
  add('Registration and records', null, 'Proof of registration confirmation', () => take(195, '(intro)'));

  /* ------------------------------------------- Reports, letters, payment */
  add('Reports, letters and payments', null, 'Medical reports and records requests', () => take(194, '(intro)'));
  add('Reports, letters and payments', null, 'Private letters (non-NHS work)', () => [
    take(196, '(intro)'),
    take(196, 'Process'),
  ].join('\n\n'));
  add('Reports, letters and payments', null, 'Sick notes and self-certification', () => take(269, 'Sick Notes & Self-Certification'));

  /* ---------------------------------------------------- Using EMIS Web */
  add('Using EMIS Web', null, 'Inbox vs Workflow Manager', () => take(170, 'Inbox vs Workflow Manager'));
  add('Using EMIS Web', null, 'Group tasks, auditing and open documents', () => take(170, 'Group tasks'));
  add('Using EMIS Web', null, 'Handling tasks and replying', () => [
    take(172, '(intro)'),
    take(172, 'To close a task'),
  ].join('\n\n'));
  add('Using EMIS Web', null, 'Editing patient details', () => take(173, '(intro)'));
  add('Using EMIS Web', null, 'Emergencies and the red button', () => [
    take(171, '(intro)'),
    take(171, 'Press the red button if…'),
  ].join('\n\n'));
  add('Using EMIS Web', null, 'Using the phone bar and transferring a call', () => take(220, 'Phone Bar Usage'));
  add('Using EMIS Web', null, 'Practice rules and formatting conventions', () => take(226, 'Rules and Guidelines'));

  /* -------------------------------------------------------------- Triage */
  add('Triaging', null, 'Triage guidelines — pharmacy requests and blood forms', () => take(248, '(intro)'));

  /* ------------------------------------------------------ Coding (EMIS) */
  add('Document coding', null, 'Retinal eye and diabetes review coding', () => take(266, 'Retinal Eye Coding'));

  /* ----------------------------------------------------------- Reference */
  add('Reference', null, 'Hospital codes', () => [
    take(210, '(intro)'),
    take(210, 'Hospital Codes'),
  ].join('\n\n'));
  add('Reference', null, 'Abbreviations — practice and referral terms', () => [
    take(211, '(intro)'),
    take(211, 'Terms worth knowing'),
    take(211, 'Terms to confirm with the practice manager'),
  ].join('\n\n'));
  add('Reference', null, 'Abbreviations — blood tests and clinical terms', () => [
    take(214, 'Common Abbreviations & Terms'),
    take(214, 'Gastrointestinal Tract Anatomy'),
  ].join('\n\n'));
  add('Reference', null, 'Glossary of service acronyms', () => take(225, 'Glossary and Terms'));

  /* ------------------------------------------------------------ Contacts */
  add('Contacts', null, 'Contact directory — services and departments', () => take(269, 'Organisation Notepad'));
  add('Contacts', null, 'Mental health crisis support', () => take(269, 'Mental Health Crisis Support'));
  add('Contacts', null, 'Dementia service contacts', () => take(269, 'Dementia Service'));
  add('Contacts', null, 'Maternity services contacts', () => take(269, 'Maternity Services'));
  add('Contacts', null, 'Health visiting', () => take(269, 'Health Visiting'));
  add('Contacts', null, 'Paradoc (out of hours)', () => take(269, 'Paradoc'));
  add('Contacts', null, 'Self-referral links and booking websites', () => take(269, 'Booking & Referral Information'));
  add('Contacts', null, 'Asva Care bypass number', () => take(272, '*'));

  /* ------------------------------------------------------------ Policies */
  add('Policies', null, 'HPV vaccine eligibility', () => take(269, 'HPV Vaccine Policy'));

  /* -------------------------------------------------------------- Logins */
  // Isolated deliberately: these are live credentials, they were being sent to
  // the model with every question, and keeping them on one page means removing
  // them is a single delete rather than an edit buried inside a directory.
  add('Shared logins — REVIEW AND REMOVE', null, 'Shared logins and passwords', () => take(269, 'Accurx & Digital Logins'));

  /* -------------------------------------------------------- Needs review */
  // Near-duplicates of pages above. Kept verbatim rather than deleted: which
  // wording survives is the practice's call, not this script's.
  add('Needs review — duplicates', null, 'Duplicate: sending a referral via e-RS (second copy)', () => take(179, 'Sending a referral via ERS (e-Referral Service)'));

  return P;
}

/* ------------------------------------------------------------------- run */

const rows = await sql`
  SELECT id, parent_id AS "parentId", title, body, position,
         is_section AS "isSection", updated_at AS "updatedAt"
  FROM notes ORDER BY position ASC, id ASC
`;
const atts = await sql`SELECT id, note_id AS "noteId", url, filename FROM note_attachments ORDER BY id ASC`;
for (const n of rows) notesById.set(n.id, n);

fs.writeFileSync(
  path.join(root, 'scripts', 'notebook-backup.json'),
  JSON.stringify({ takenAt: new Date().toISOString(), notes: rows, attachments: atts }, null, 2),
);

const built = [];
const errors = [];
for (const entry of plan()) {
  try { built.push({ ...entry, markdown: entry.build() }); }
  catch (e) { errors.push(`${entry.section} / ${entry.page}: ${e.message}`); }
}

// Coverage: every non-whitespace character of every source page must have been
// claimed by the plan. Anything left over is content about to be lost.
const uncovered = [];
for (const n of rows) {
  if (!n.parentId || n.isSection) continue;
  const body = String(n.body || '');
  if (!body.trim()) continue;
  const covered = new Array(body.length).fill(false);
  for (const [s, e] of claimed.get(n.id) || []) for (let i = s; i < e; i++) covered[i] = true;
  let run = '';
  const gaps = [];
  for (let i = 0; i < body.length; i++) {
    if (covered[i]) { if (run.trim()) gaps.push(run.trim()); run = ''; }
    else run += body[i];
  }
  if (run.trim()) gaps.push(run.trim());
  for (const g of gaps) if (g.replace(/[\s#*_>|-]/g, '').length > 3) uncovered.push({ id: n.id, title: n.title, text: g.slice(0, 300) });
}

console.log(`\nPLAN: ${built.length} pages`);
const bySection = new Map();
for (const b of built) {
  const key = b.section + (b.sub ? ' / ' + b.sub : '');
  if (!bySection.has(key)) bySection.set(key, []);
  bySection.get(key).push(b);
}
for (const [key, list] of bySection) {
  console.log(`\n[${key}]`);
  for (const b of list) console.log(`   - ${b.page}  (${b.markdown.length}c)`);
}

if (errors.length) {
  console.log(`\nPLAN ERRORS (${errors.length}):`);
  for (const e of errors) console.log('  ! ' + e);
}
if (uncovered.length) {
  console.log(`\nUNCOVERED SOURCE TEXT (${uncovered.length}) — these would be lost:`);
  for (const u of uncovered) console.log(`  #${u.id} ${u.title}:\n      ${u.text.replace(/\n/g, '\n      ')}`);
}
console.log(`\ncoverage: ${uncovered.length === 0 && errors.length === 0 ? 'COMPLETE' : 'INCOMPLETE'}`);

if (!APPLY) { console.log('\nDry run. Pass --apply to write.'); process.exit(errors.length || uncovered.length ? 1 : 0); }
if (errors.length || uncovered.length) { console.error('\nRefusing to apply an incomplete plan.'); process.exit(1); }

const sectionIds = new Map();
async function ensureSection(title, parentId) {
  const key = (parentId || 0) + '|' + title.toLowerCase();
  if (sectionIds.has(key)) return sectionIds.get(key);
  const ins = await sql`
    INSERT INTO notes (title, parent_id, is_section) VALUES (${title.slice(0, 200)}, ${parentId}, ${true}) RETURNING id
  `;
  sectionIds.set(key, ins[0].id);
  return ins[0].id;
}

for (const b of built) {
  const secId = await ensureSection(b.section, null);
  const parent = b.sub ? await ensureSection(b.sub, secId) : secId;
  await sql`
    INSERT INTO notes (title, parent_id, is_section, body)
    VALUES (${b.page.slice(0, 200)}, ${parent}, ${false}, ${b.markdown})
  `;
}

// Attachments outlive their old page. Every file lands on one holding page so
// nothing is deleted with the old tree; each is then moved onto the page it
// illustrates by hand, which is a judgement about pictures, not about text.
const holdSection = await ensureSection('Needs review — attachments', null);
const holdPage = await sql`
  INSERT INTO notes (title, parent_id, is_section, body)
  VALUES (${'Files from the restructure'}, ${holdSection}, ${false},
          ${'Every file that was attached to a page before the restructure. Move each one onto the page it illustrates, then delete this page.'})
  RETURNING id
`;
const oldPageIds = rows.map((r) => r.id);
await sql`UPDATE note_attachments SET note_id = ${holdPage[0].id} WHERE note_id = ANY(${oldPageIds})`;

// Old tree out. Roots only — children cascade.
for (const id of rows.filter((r) => !r.parentId).map((r) => r.id)) {
  await sql`DELETE FROM notes WHERE id = ${id}`;
}

// The canonical mirror still holds an entry per deleted note. Nothing reads a
// note entry for answers today, but leaving rows that point at ids which no
// longer exist would have the knowledge admin listing pages nobody can open.
// New pages index themselves the first time they are saved in the editor.
try {
  const staleIds = rows.map((r) => `note:${r.id}`);
  await sql`UPDATE knowledge_entries SET status = 'archived' WHERE id = ANY(${staleIds})`;
} catch (e) {
  console.warn('could not archive the old knowledge entries:', String(e).slice(0, 160));
}

console.log(`\nAPPLIED: ${built.length} pages in ${sectionIds.size} sections. Old tree removed.`);
console.log('Backup: scripts/notebook-backup.json');
