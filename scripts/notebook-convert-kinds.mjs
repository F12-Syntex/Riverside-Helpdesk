// Give every page filed under an old tagged folder the kind it was filed as.
//
// Before kinds, a page's shape came from its folder: everything under the
// section tagged `ers` was drawn as the e-RS screen, `profMessage` as an
// AccurX message, `pathology` as the blood-test screen, and the values were
// lifted out of the prose by a model at answer time. Those pages are all
// plain notes now, so they answer as prose and draw nothing.
//
// This moves them onto the kind their folder implied, with the values stored
// in `fields` - once, here, where a person can read the result - rather than
// guessed at every answer.
//
// WHAT KEEPS IT SAFE.
//   - A model reads each page, but NOTHING it returns is trusted: every value
//     must appear in the page's own title or writing, or it is dropped. A
//     service name the page never mentions cannot become a field.
//   - A page that comes out INCOMPLETE is still converted, as a DRAFT, with
//     whatever values were grounded. A draft keeps answering from its prose
//     (lib/knowledge-context.mjs) and draws no card until somebody fills in
//     what is missing - which the notebook shows in red. Drafts are listed
//     separately so a person can work through them.
//   - The writing (`body`) is not touched. Converting back is setting the kind
//     to 'note'; the backup the run writes holds every row as it was.
//   - The dry run writes a plan file and --apply writes exactly that plan, so
//     what was read is what lands - the model is not asked twice.
//   - It will not write to the live database unless told to: --apply needs
//     DEV_DATABASE_URL set, or --live.
//   - It can run BEFORE the version that reads kinds is deployed. --apply adds
//     the kind/fields/status columns itself (additive, IF NOT EXISTS - the same
//     statements ensureNotebookSchema runs), and the version still serving
//     ignores them and keeps reading output_tag, which this never touches. So
//     there is no moment where a tagged page has lost its card and not yet
//     gained its type. The dry run writes nothing at all.
//
// USAGE
//   node scripts/notebook-convert-kinds.mjs .                 # dry run on DEV_DATABASE_URL
//   node scripts/notebook-convert-kinds.mjs . --live          # dry run on DATABASE_URL (live)
//   node scripts/notebook-convert-kinds.mjs . --apply         # applies it (DEV_DATABASE_URL)
//   node scripts/notebook-convert-kinds.mjs . --apply --live  # applies it to DATABASE_URL
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { noteKind, normaliseFields, noteIssues, statusFor } from '../lib/notebook/kinds.mjs';

const root = process.argv[2] || '.';
const APPLY = process.argv.includes('--apply');
const LIVE = process.argv.includes('--live');
const PLAN = path.join(os.tmpdir(), 'notebook-convert-kinds.plan.json');

for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
// --live means the live database, whether or not .env.local also names a
// development one: the dry run that shows what will happen to live must read
// live, not whatever branch this checkout happens to point at.
const onLive = LIVE || !process.env.DEV_DATABASE_URL;
const url = onLive ? process.env.DATABASE_URL : process.env.DEV_DATABASE_URL;
const sql = neon(url, { fetchOptions: { cache: 'no-store' } });
console.log('database:', new URL(url).host, onLive ? '(DATABASE_URL - LIVE)' : '(DEV_DATABASE_URL)');

const TAG_KIND = { ers: 'ersReferral', profMessage: 'emailReferral', pathology: 'bloodTestSet' };

// The comparison form: markdown, HTML and typography stripped, so "**Audiology
// - Hearing Assess**" in the page matches "Audiology – Hearing Assess" back.
const flat = (s) => String(s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/[*_`#>|\\]/g, ' ')
  .replace(/[‐-―−]/g, '-')
  .replace(/[‘’]/g, "'")
  .replace(/ |‑/g, ' ')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const words = (s) => flat(s).split(/[^a-z0-9@.'-]+/).filter((w) => w.length > 2);

// Rules are sentences the model may shorten, so they need most of their words
// in the page rather than every character.
const RULE_FIELDS = new Set(['hospitalRule', 'toRule', 'clinicTypeCondition', 'timing', 'clinicalDetails']);

// The pathway-card template writes "Standard" where it means "the usual one".
// That is not a name e-RS or EMIS will show, and drawn on the screen as a
// hospital or form called "Standard" it would send somebody looking for it.
const PLACEHOLDER = /^(standard|usual|as normal|normal|n\/?a|none|-)$/;

function grounded(field, value, source) {
  if (field.type === 'enum') return true; // a fixed choice cannot be invented
  const v = flat(value);
  if (!v || PLACEHOLDER.test(v)) return false;
  if (source.includes(v)) return true;
  if (RULE_FIELDS.has(field.key)) {
    const w = words(value);
    return w.length > 0 && w.filter((x) => source.includes(x)).length / w.length >= 0.75;
  }
  return false;
}

async function extract(kind, note) {
  const def = noteKind(kind);
  const spec = def.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, hint: f.hint, options: f.options.length ? f.options : undefined }));
  const prompt = [
    `A practice procedure page is to be stored as a "${def.label}" (${def.summary}).`,
    'Fill in the fields below from the page. Copy values EXACTLY as the page writes them - same words, same spelling.',
    'Leave a field "" (or [] for a list) when the page does not say it. Never guess, never fill from general knowledge.',
    'For "enum" fields pick one of the options, or "" if the page does not say.',
    'Reply with one JSON object, keys exactly as given, nothing else.',
    '', 'FIELDS:', JSON.stringify(spec, null, 1),
    '', 'PAGE TITLE: ' + note.title, 'PAGE:', note.body,
  ].join('\n');
  const [setting] = await sql`SELECT value FROM app_settings WHERE key = 'ai_model'`;
  const model = (setting && setting.value) || 'google/gemini-3.7-flash';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('OpenRouter ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const text = (await res.json()).choices?.[0]?.message?.content || '{}';
  return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

// Whether the kind columns exist yet. Before the first --apply, or the first
// request to a version that reads kinds, they do not - and every page is then
// a plain note, which is what the dry run should see.
async function hasKindColumns() {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'notes' AND column_name IN ('kind', 'fields', 'status')`;
  return cols.length === 3;
}

async function plan() {
  const rows = (await hasKindColumns())
    ? await sql`SELECT id, parent_id AS "parentId", title, body, is_section AS "isSection", kind, fields, status, output_tag AS "tag" FROM notes`
    : (await sql`SELECT id, parent_id AS "parentId", title, body, is_section AS "isSection", output_tag AS "tag" FROM notes`)
      .map((r) => ({ ...r, kind: 'note', fields: {}, status: 'live' }));
  const kids = (id) => rows.filter((r) => r.parentId === id);
  const out = [];
  for (const folder of rows.filter((r) => TAG_KIND[r.tag])) {
    const kind = TAG_KIND[folder.tag];
    const def = noteKind(kind);
    const walk = (id) => kids(id).forEach((r) => { if (r.isSection) walk(r.id); else out.push({ r, kind, def, folder: folder.title }); });
    walk(folder.id);
  }

  const results = [];
  for (const { r, kind, def, folder } of out) {
    const base = { id: r.id, title: r.title, folder, kind, before: { kind: r.kind, fields: r.fields, status: r.status } };
    if (r.kind && r.kind !== 'note') { results.push({ ...base, action: 'skip', reason: 'already ' + r.kind }); continue; }
    if (!String(r.body || '').trim()) { results.push({ ...base, action: 'skip', reason: 'empty page' }); continue; }
    let raw;
    try { raw = await extract(kind, r); } catch (e) { results.push({ ...base, action: 'skip', reason: 'extract failed: ' + e.message }); continue; }
    const source = flat(r.title + '\n' + r.body);
    const kept = {};
    const dropped = [];
    for (const field of def.fields) {
      const value = raw[field.key];
      if (Array.isArray(value)) {
        const ok = value.filter((item) => grounded(field, item, source));
        value.filter((item) => !ok.includes(item)).forEach((item) => dropped.push(field.key + ': ' + item));
        kept[field.key] = ok;
      } else if (value != null && String(value).trim()) {
        if (grounded(field, value, source)) kept[field.key] = value;
        else dropped.push(field.key + ': ' + value);
      }
    }
    // A page is named for the service it describes, so a card whose page
    // never repeats the name in its text takes the title rather than going
    // into draft over the one value everybody can see.
    if (def.fields.some((f) => f.key === 'service') && !String(kept.service || '').trim()) {
      kept.service = String(r.title || '').trim();
    }
    const fields = normaliseFields(kind, kept);
    const issues = noteIssues(kind, fields);
    results.push({ ...base, fields, dropped, issues: issues.map((i) => i.message),
      action: issues.length ? 'convert-draft' : 'convert', status: statusFor(kind, fields) });
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  return results;
}

function report(results) {
  for (const action of ['convert', 'convert-draft', 'skip']) {
    const list = results.filter((x) => x.action === action);
    console.log(`\n=== ${action.toUpperCase()} (${list.length})`);
    for (const x of list) {
      console.log(`#${x.id} [${x.kind}] ${x.title}`);
      if (x.reason) console.log('    ' + x.reason);
      if (x.fields) for (const [k, v] of Object.entries(x.fields)) if (Array.isArray(v) ? v.length : String(v).trim()) console.log(`    ${k}: ${Array.isArray(v) ? v.join(' | ') : v}`);
      if (x.issues && x.issues.length) console.log('    missing: ' + x.issues.join(' '));
      if (x.dropped && x.dropped.length) console.log('    dropped (not in the page): ' + x.dropped.join(' ; '));
    }
  }
}

if (!APPLY) {
  const results = await plan();
  fs.writeFileSync(PLAN, JSON.stringify({ host: new URL(url).host, at: new Date().toISOString(), results }, null, 2));
  report(results);
  console.log('\nplan written to', PLAN, '- rerun with --apply to write it.');
} else {
  if (onLive && !LIVE) throw new Error('Refusing to write to the live database: set DEV_DATABASE_URL, or pass --live.');
  const saved = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
  if (saved.host !== new URL(url).host) throw new Error('The plan was made against ' + saved.host + ', not this database.');
  const todo = saved.results.filter((x) => x.action === 'convert' || x.action === 'convert-draft');
  const ids = todo.map((x) => x.id);
  // The columns the new version reads. Adding is safe; see ensureNotebookSchema.
  await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS kind   text  NOT NULL DEFAULT 'note'`;
  await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS fields jsonb NOT NULL DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS status text  NOT NULL DEFAULT 'live'`;
  const backup = path.join(os.tmpdir(), 'notebook-convert-kinds.backup-' + Date.now() + '.json');
  fs.writeFileSync(backup, JSON.stringify(await sql`SELECT * FROM notes WHERE id = ANY(${ids})`, null, 2));
  console.log('backup of', ids.length, 'rows:', backup);
  for (const x of todo) {
    // Only a row still as the plan saw it: a page someone converted or retyped
    // since the dry run is theirs, not this script's.
    const rows = await sql`
      UPDATE notes SET kind = ${x.kind}, fields = ${JSON.stringify(x.fields)}::jsonb,
             status = ${statusFor(x.kind, x.fields)}, updated_at = now()
      WHERE id = ${x.id} AND COALESCE(kind, 'note') = 'note' AND is_section = false
      RETURNING id, status`;
    console.log(rows[0] ? `converted #${x.id} ${x.title} -> ${x.kind} (${rows[0].status})` : `skipped #${x.id} ${x.title}: changed since the plan`);
  }
}
