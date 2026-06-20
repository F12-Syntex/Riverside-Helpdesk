// Knowledge-base listing for the in-app "Knowledge base" tab. Reads the RAG
// catalogue (the documents every answer is grounded in) and, for each one,
// finds its openable file and page thumbnails under public/assets/rag, then
// groups them into human-friendly sections. Read-only; safe to call any time.
import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const ROOT = process.cwd();
const CATALOG = path.join(ROOT, 'rag', 'processed', 'catalog.json');
const ASSETS = path.join(ROOT, 'public', 'assets', 'rag');
const MAX_THUMBS = 16;

function pageNumber(name) {
  const m = /page-(\d+)\.png$/i.exec(name);
  return m ? parseInt(m[1], 10) : 0;
}

// Inspect a document's asset folder to decide how it opens and which thumbnails
// to show. PDFs render to page-N.png; DOCX/DOC/RTF render to document.html.
function assetInfo(docId, ext) {
  const dir = path.join(ASSETS, docId);
  let files = [];
  try { files = fs.readdirSync(dir); } catch (e) { return { view: null, thumbs: [], pages: 0 }; }

  const pages = files.filter((f) => /^page-\d+\.png$/i.test(f)).sort((a, b) => pageNumber(a) - pageNumber(b));
  const base = `assets/rag/${docId}`;

  if (pages.length) {
    const pdf = files.find((f) => /\.pdf$/i.test(f));
    return {
      view: pdf ? { kind: 'pdf', url: `${base}/${pdf}` } : { kind: 'image', url: `${base}/${pages[0]}` },
      thumbs: pages.slice(0, MAX_THUMBS).map((p) => `${base}/${p}`),
      pages: pages.length,
    };
  }
  if (files.includes('document.html')) {
    return { view: { kind: 'html', url: `${base}/document.html` }, thumbs: [], pages: 0 };
  }
  const img = files.find((f) => /\.(png|jpe?g|gif|webp)$/i.test(f));
  if (img) return { view: { kind: 'image', url: `${base}/${img}` }, thumbs: [], pages: 0 };
  return { view: null, thumbs: [], pages: 0 };
}

function extOf(source) {
  const m = /\.([a-z0-9]+)$/i.exec(source || '');
  return m ? m[1].toLowerCase() : '';
}

function typeLabel(ext, pages) {
  if (pages) return `${pages} page${pages === 1 ? '' : 's'} · PDF`;
  if (ext === 'docx' || ext === 'doc') return 'Word document';
  if (ext === 'rtf') return 'Rich text document';
  if (ext === 'pptx') return 'Presentation';
  if (ext === 'pdf') return 'PDF document';
  if (ext === 'md' || ext === 'markdown') return 'Markdown document';
  if (ext === 'txt') return 'Text document';
  return 'Document';
}

// Sort documents into a small set of sections. EMIS guides are pinned first to
// mirror the practice's own framing; the rest fall into intuitive buckets.
const GROUPS = [
  { key: 'emis', label: 'Official EMIS Web guides', test: (t, s) => /emis/i.test(t) || /emis/i.test(s) },
  { key: 'policy', label: 'Policies', test: (t) => /\bpolicy|policies\b/i.test(t) },
  { key: 'protocol', label: 'Protocols & procedures', test: (t) => /protocol|procedure|sop\b/i.test(t) },
  { key: 'guide', label: 'Guides & references', test: (t) => /guide|how to|reference|induction|handbook|standard/i.test(t) },
  { key: 'form', label: 'Forms, posters & checklists', test: (t) => /form|poster|checklist|template|questionnaire|sheet|leaflet/i.test(t) },
  { key: 'other', label: 'Other documents', test: () => true },
];

export async function GET() {
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  } catch (e) {
    return NextResponse.json({ groups: [], total: 0 });
  }

  const buckets = new Map(GROUPS.map((g) => [g.key, []]));
  for (const d of catalog.documents || []) {
    const ext = extOf(d.source);
    const info = assetInfo(d.docId, ext);
    const doc = {
      docId: d.docId,
      title: d.title,
      summary: d.summary || '',
      subtitle: typeLabel(ext, info.pages),
      view: info.view,
      thumbs: info.thumbs,
      pages: info.pages,
    };
    const group = GROUPS.find((g) => g.test(d.title || '', d.source || ''));
    buckets.get(group.key).push(doc);
  }

  const groups = GROUPS
    .map((g) => ({ key: g.key, label: g.label, docs: buckets.get(g.key).sort((a, b) => a.title.localeCompare(b.title)) }))
    .filter((g) => g.docs.length);

  return NextResponse.json({ groups, total: (catalog.documents || []).length });
}
