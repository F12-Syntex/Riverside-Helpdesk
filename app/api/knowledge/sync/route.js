// One-time/repeatable migration from the three legacy stores into the canonical
// knowledge tables. IDs are stable and upserts are idempotent, so this is safe
// to run after document ingestion or when deploying the unified store.
import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import CONTACTS from '@/lib/contacts.data.json';
import { listNotes } from '@/lib/notebook';
import { embedTexts } from '@/rag/lib/embed.mjs';
import { knowledgeId, replaceClaims, upsertKnowledgeEntry } from '@/lib/knowledge';
import { extractClaims } from '@/lib/ai/claims';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

let syncRunning = false;

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

function dedupeContacts() {
  const byLabel = new Map();
  for (const raw of CONTACTS) {
    const label = String(raw.label || '').trim();
    if (!label) continue;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!byLabel.has(key)) byLabel.set(key, { label, phones: [], emails: [] });
    const item = byLabel.get(key);
    for (const p of (raw.phones || [])) if (!item.phones.some((x) => x.tel === p.tel && x.display === p.display)) item.phones.push(p);
    for (const email of (raw.emails || [])) if (!item.emails.some((x) => x.toLowerCase() === String(email).toLowerCase())) item.emails.push(email);
  }
  return [...byLabel.values()];
}

export async function POST() {
  if (syncRunning) return NextResponse.json({ error: 'A knowledge migration is already running.' }, { status: 409 });
  syncRunning = true;
  try {
  const root = process.cwd();
  const catalog = readJson(path.join(root, 'rag', 'processed', 'catalog.json'), { documents: [] });
  const embeddings = readJson(path.join(root, 'rag', 'processed', 'embeddings.json'), {});
  const chunks = [];
  try {
    for (const line of fs.readFileSync(path.join(root, 'rag', 'processed', 'chunks.jsonl'), 'utf8').split(/\n/)) if (line.trim()) chunks.push(JSON.parse(line));
  } catch (e) { /* an empty document store is allowed */ }
  const vecByHash = new Map();
  if (Array.isArray(embeddings.hashes)) embeddings.hashes.forEach((h, i) => vecByHash.set(h, embeddings.vectors?.[i]));
  const vecById = new Map();
  if (Array.isArray(embeddings.ids)) embeddings.ids.forEach((id, i) => vecById.set(id, embeddings.vectors?.[i]));
  const chunksByDoc = new Map();
  for (const chunk of chunks) {
    if (!chunksByDoc.has(chunk.docId)) chunksByDoc.set(chunk.docId, []);
    chunksByDoc.get(chunk.docId).push(chunk);
  }

  const summary = { documents: 0, notes: 0, contacts: 0, errors: [] };
  for (const doc of (catalog.documents || [])) {
    try {
      const sourceChunks = chunksByDoc.get(doc.docId) || [];
      const passages = sourceChunks.map((c) => ({
        heading: c.section || (c.headingPath || []).join(' › '), text: c.text,
        embedding: vecByHash.get(c.contentHash) || vecById.get(c.id) || null,
        location: { ...(c.view || {}), images: c.images || [], source: c.source || null },
      }));
      await upsertKnowledgeEntry({
        id: `document:${doc.docId}`, kind: 'document', title: doc.title,
        content: sourceChunks.map((c) => c.text).join('\n\n'), passages,
        data: { summary: doc.summary || '', tags: doc.tags || [] },
        sourceRef: doc.source || `rag/sources/${doc.docId}`, authority: 70,
      }, { embed: false, skipUnchanged: true });
      summary.documents++;
    } catch (e) { summary.errors.push(`Document ${doc.title}: ${String(e).slice(0, 160)}`); }
  }

  try {
    const notes = await listNotes();
    for (const note of notes.filter((n) => n.parentId && String(n.body || '').trim())) {
      try {
        const entry = await upsertKnowledgeEntry({
          id: `note:${note.id}`, kind: 'note', title: note.title, content: note.body,
          data: { legacyNoteId: note.id, parentId: note.parentId }, sourceRef: `notebook:${note.id}`, authority: 90,
        }, { skipUnchanged: true });
        if (!entry.unchanged) await replaceClaims(entry.id, await extractClaims(entry));
        summary.notes++;
      } catch (e) { summary.errors.push(`Note ${note.title}: ${String(e).slice(0, 160)}`); }
    }
  } catch (e) { summary.errors.push(`Notebook: ${String(e).slice(0, 160)}`); }

  const contacts = dedupeContacts();
  let contactVectors = [];
  try { contactVectors = await embedTexts(contacts.map((c) => `${c.label}\n${c.phones.map((p) => p.display).join(' ')}\n${c.emails.join(' ')}`)); }
  catch (e) { summary.errors.push(`Contact embeddings: ${String(e).slice(0, 160)}`); }
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];
    try {
      const sourceRef = `contacts:${contact.label.toLowerCase()}`;
      const content = [contact.label, ...contact.phones.map((p) => p.display), ...contact.emails].join('\n');
      const entry = await upsertKnowledgeEntry({
        id: knowledgeId('contact', sourceRef, contact.label), kind: 'contact', title: contact.label,
        content, data: { phones: contact.phones, emails: contact.emails }, sourceRef, authority: 85,
        passages: [{ text: content, embedding: contactVectors[i] || null }],
      }, { embed: false, skipUnchanged: true });
      if (!entry.unchanged) await replaceClaims(entry.id, await extractClaims(entry));
      summary.contacts++;
    } catch (e) { summary.errors.push(`Contact ${contact.label}: ${String(e).slice(0, 160)}`); }
  }

  return NextResponse.json({ ok: summary.errors.length === 0, summary });
  } finally {
    syncRunning = false;
  }
}
