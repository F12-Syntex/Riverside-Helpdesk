// Read-only dump of the Notebook: every note, plus attachment counts.
// Writes notes.json (full backup) and outline.txt (a shape to read).
import fs from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';

const root = process.argv[2];
const out = process.argv[3];

// .env.local, parsed by hand — no dotenv dependency in this project.
const env = fs.readFileSync(path.join(root, '.env.local'), 'utf8');
for (const line of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const sql = neon(process.env.DATABASE_URL, { fetchOptions: { cache: 'no-store' } });

const notes = await sql`
  SELECT id, parent_id AS "parentId", title, body, position,
         is_section AS "isSection", updated_at AS "updatedAt"
  FROM notes ORDER BY position ASC, id ASC
`;
const atts = await sql`
  SELECT id, note_id AS "noteId", url, pathname, filename,
         content_type AS "contentType", size, created_at AS "createdAt"
  FROM note_attachments ORDER BY created_at ASC, id ASC
`;

fs.writeFileSync(path.join(out, 'notes.json'), JSON.stringify({ notes, attachments: atts }, null, 2));

const attCount = new Map();
for (const a of atts) attCount.set(a.noteId, (attCount.get(a.noteId) || 0) + 1);

const kids = new Map();
for (const n of notes) {
  const k = n.parentId || 0;
  if (!kids.has(k)) kids.set(k, []);
  kids.get(k).push(n);
}
const lines = [];
const walk = (pid, depth) => {
  for (const n of kids.get(pid) || []) {
    const isSec = !n.parentId || n.isSection;
    const chars = String(n.body || '').length;
    const files = attCount.get(n.id) || 0;
    lines.push(
      '  '.repeat(depth) + (isSec ? '[S] ' : '[P] ') + `#${n.id} ${n.title || 'Untitled'}`
      + (isSec ? '' : `  (${chars} chars${files ? ', ' + files + ' files' : ''})`),
    );
    walk(n.id, depth + 1);
  }
};
walk(0, 0);

const totalChars = notes.reduce((n, r) => n + String(r.body || '').length, 0);
lines.push('', `TOTAL: ${notes.length} rows, ${totalChars} chars of body, ${atts.length} attachments`);
fs.writeFileSync(path.join(out, 'outline.txt'), lines.join('\n'));
console.log(lines.join('\n'));
