// AI organiser for a notebook section — typically an "Uncategorised" holding
// area. Two-phase, so nothing moves without the user seeing where it will go:
//   POST { sectionId }        — dry run: the model reads every page in the
//                               section plus the notebook outline and returns
//                               an allocation plan (which existing or new
//                               section/page each piece of content belongs on,
//                               reformatted for its new home). Nothing is saved.
//   POST { sectionId, plan }  — apply a confirmed plan (lib/notebook.js):
//                               find-or-create the targets, append the text,
//                               move attachments with their note, remove the
//                               emptied source pages.
import { NextResponse } from 'next/server';
import { listNotes, applyOrganizePlan } from '@/lib/notebook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_RETENTION = { data_collection: 'deny' };
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_HEADERS = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://riverside-practice.local',
  'X-Title': 'Riverside Practice Q&A',
});

const MAX_TOTAL_CHARS = 120000; // all source pages together
const isSectionRow = (r) => !r.parentId || r.isSection;

// Organise applies only to the "Uncategorised" holding section — other
// sections are already where their content belongs.
const UNCAT_RE = /^\s*uncategori[sz]ed\s*$/i;
const canOrganize = (r) => !!r && isSectionRow(r) && UNCAT_RE.test(r.title || '');

// Indented outline of the notebook (sections → pages) for the prompt.
function outlineFor(rows, skipId) {
  const kids = new Map();
  for (const r of rows) {
    const k = r.parentId || 0;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k).push(r);
  }
  const lines = [];
  const walk = (pid, depth) => {
    for (const r of kids.get(pid) || []) {
      if (r.id === skipId) continue;
      lines.push('  '.repeat(depth) + '- ' + (isSectionRow(r) ? 'Section: ' : 'Page: ') + (r.title || 'Untitled'));
      walk(r.id, depth + 1);
    }
  };
  walk(0, 0);
  return lines.join('\n') || '(the notebook has no other sections yet)';
}

// The section's whole subtree (the pages whose content is to be moved).
function subtree(rows, rootId) {
  const out = [];
  let frontier = [rootId];
  while (frontier.length) {
    const next = [];
    for (const r of rows) if (frontier.includes(r.parentId)) { out.push(r); next.push(r.id); }
    frontier = next;
  }
  return out;
}

function buildPrompt({ sectionTitle, outline, notes }) {
  const noteBlocks = notes.map((n) => `--- Note ${n.id}: "${n.title || 'Untitled'}"\n${n.body.trim()}`).join('\n\n');
  return `You are reorganising a GP practice's internal notebook.

The notebook is a tree of sections (name-only containers) holding pages (the content). Below is the current outline, then the full text of every page in the "${sectionTitle}" section — a holding area whose content must be redistributed to where it belongs. The pages themselves will be removed afterwards; only the content you allocate survives, so every fact must be placed.

NOTEBOOK OUTLINE:
${outline}

PAGES TO REDISTRIBUTE:
${noteBlocks}

Decide where each piece of content belongs and return ONLY this JSON — no code fences, no commentary:
{"allocations":[{"noteId":12,"parts":[{"section":"Referrals","page":"Two-week-wait referrals","markdown":"…"}]}]}

Rules:
- Cover every note listed. A note's content must be fully reallocated across its parts — a note that belongs together gets exactly one part; split a note when different parts belong in different places (e.g. some content to Referrals, some to Protocols).
- "section": the exact title of an existing section where the content fits; otherwise a sensible new section name. Never "${sectionTitle}". You may nest one level with " / " (e.g. "Clinical / Referrals") when a sub-section genuinely helps.
- "page": the page inside that section to put the text on — an existing page's exact title to add to it, or a short new page name for the topic.
- "markdown": the content itself, reformatted to read well on the target page: ## / ### headings, bullet and numbered lists, markdown tables for anything tabular, **bold** key facts, <mark>highlight</mark> for safety-critical warnings. Start each part with a ## heading naming its topic so it stands on its own inside the target page.
- Keep EVERY fact. Never invent, drop or summarise away information; names, phone numbers, doses, dates and times must stay exactly as written. Fixing spelling and grammar is fine.
- A note may contain inline images, written as ![alt](url) on their own line. Keep every image, character-for-character (never alter the URL), inside the part whose content it illustrates, placed right after the text it belongs to.`;
}

// The model's JSON, tolerantly parsed and reduced to the exact shape we apply.
function parsePlan(text, sourceIds) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed;
  try { parsed = JSON.parse(t.slice(start, end + 1)); } catch (e) { return null; }
  const allocations = [];
  for (const a of Array.isArray(parsed?.allocations) ? parsed.allocations : []) {
    const noteId = parseInt(a?.noteId, 10);
    if (!noteId || !sourceIds.has(noteId)) continue;
    const parts = [];
    for (const p of Array.isArray(a?.parts) ? a.parts : []) {
      const markdown = String(p?.markdown || '').trim().slice(0, 30000);
      if (!markdown) continue;
      parts.push({
        section: String(p?.section || '').trim().slice(0, 120) || 'General',
        page: String(p?.page || '').trim().slice(0, 200),
        markdown,
      });
    }
    if (parts.length) allocations.push({ noteId, parts });
  }
  return allocations.length ? allocations : null;
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch (e) { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const sectionId = parseInt(body?.sectionId, 10);
  if (!sectionId) return NextResponse.json({ error: 'A valid sectionId is required.' }, { status: 400 });

  // Phase 2 — a reviewed plan comes back to be applied.
  if (body?.plan) {
    try {
      const rows = await listNotes();
      if (!canOrganize(rows.find((r) => r.id === sectionId))) {
        return NextResponse.json({ error: 'Only the Uncategorised section can be organised.' }, { status: 400 });
      }
      const applied = await applyOrganizePlan({ sectionId, allocations: body.plan.allocations });
      return NextResponse.json({ applied });
    } catch (e) {
      return NextResponse.json({ error: 'Could not apply the plan.', detail: String(e.message || e).slice(0, 300) }, { status: 500 });
    }
  }

  // Phase 1 — build the plan.
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_AI_MODEL;
  if (!apiKey || !model) {
    return NextResponse.json({ error: 'Server is missing OPENROUTER_API_KEY or OPENROUTER_AI_MODEL.' }, { status: 500 });
  }

  let rows;
  try { rows = await listNotes(); } catch (e) {
    return NextResponse.json({ error: 'Could not load notes.', detail: String(e).slice(0, 300) }, { status: 500 });
  }
  const section = rows.find((r) => r.id === sectionId);
  if (!canOrganize(section)) return NextResponse.json({ error: 'Only the Uncategorised section can be organised.' }, { status: 400 });

  const notes = subtree(rows, sectionId).filter((r) => !isSectionRow(r) && (r.body || '').trim());
  if (!notes.length) return NextResponse.json({ error: 'Nothing to organise: this section has no page content.' }, { status: 400 });
  if (notes.reduce((n, r) => n + r.body.length, 0) > MAX_TOTAL_CHARS) {
    return NextResponse.json({ error: 'This section is too large to organise in one go.' }, { status: 400 });
  }

  const sectionTitle = section.title || 'Untitled';
  const prompt = buildPrompt({ sectionTitle, outline: outlineFor(rows, sectionId), notes });

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: OPENROUTER_HEADERS(apiKey),
      // Only providers that do not retain prompt data (same policy as /api/ask).
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: 'user', content: prompt }], provider: NO_RETENTION }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenRouter error (${res.status}).`, detail: detail.slice(0, 500) }, { status: 502 });
    }
    const data = await res.json();
    const allocations = parsePlan(data?.choices?.[0]?.message?.content, new Set(notes.map((n) => n.id)));
    if (!allocations) return NextResponse.json({ error: 'The model did not return a usable plan. Please try again.' }, { status: 502 });

    // Flag new targets so the review can show "(new)". Containers are root
    // sections and converted sub-sections; pages are matched inside them.
    const containers = rows.filter(isSectionRow);
    const norm = (t) => String(t || '').trim().toLowerCase();
    const titleById = new Map(rows.map((r) => [r.id, r.title || 'Untitled']));
    for (const a of allocations) {
      a.noteTitle = titleById.get(a.noteId) || 'Untitled';
      for (const p of a.parts) {
        const segs = p.section.split('/').map((x) => x.trim()).filter(Boolean).slice(0, 2);
        const root = containers.find((c) => !c.parentId && c.id !== sectionId && norm(c.title) === norm(segs[0]));
        const leaf = segs[1] && root ? containers.find((c) => c.parentId === root.id && norm(c.title) === norm(segs[1])) : root;
        p.isNewSection = !root || (segs.length > 1 && !leaf);
        p.isNewPage = !leaf || !rows.some((r) => r.parentId === leaf.id && !isSectionRow(r) && norm(r.title) === norm(p.page || a.noteTitle));
      }
    }
    return NextResponse.json({ plan: { sectionId, sectionTitle, allocations } });
  } catch (e) {
    return NextResponse.json({ error: 'Could not reach OpenRouter.', detail: String(e).slice(0, 300) }, { status: 502 });
  }
}
