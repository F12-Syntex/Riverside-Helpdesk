// PowerPoint (.pptx) decks. A .pptx is a zip of OOXML parts; the visible text of
// each slide lives in ppt/slides/slideN.xml as <a:t> runs grouped into <a:p>
// paragraphs. We emit one section per slide, numbered by the deck's real display
// order (ppt/presentation.xml's <p:sldIdLst>), so a citation's "Slide N" matches
// what the reader sees — the slideN.xml filename is assigned at creation and does
// NOT track reordering or deletion, so it cannot be trusted for the number.
import fs from 'node:fs';

export const exts = ['.pptx'];

const MAX_BYTES = 50 * 1024 * 1024;       // compressed archive ceiling
const MAX_SLIDE_BYTES = 8 * 1024 * 1024;  // per-slide decompressed ceiling (zip-bomb guard)

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]{1,6});/g, (m, h) => { const c = parseInt(h, 16); return c <= 0x10ffff ? String.fromCodePoint(c) : m; })
    .replace(/&#(\d{1,7});/g, (m, d) => { const c = parseInt(d, 10); return c <= 0x10ffff ? String.fromCodePoint(c) : m; })
    .replace(/&amp;/g, '&'); // last, so "&amp;lt;" survives intact
}

// Resolve the deck's slide parts in DISPLAY order. presentation.xml lists slides
// as <p:sldId r:id="rIdN"/> in the order they appear; presentation.xml.rels maps
// each rId to its slide part. Returns [{ name, num }] where num is the 1-based
// position the reader sees. Falls back to filename-number order (numbered by
// position) when either part is missing or unparseable, so ingestion never fails
// on an unusual deck. Exported for unit testing.
export function orderSlides(presentationXml, relsXml, slideNames) {
  const byFilename = [...slideNames].sort(
    (a, b) => parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10),
  );
  const fallback = () => byFilename.map((name, i) => ({ name, num: i + 1 }));
  if (!presentationXml || !relsXml) return fallback();

  const relMap = new Map();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0]);
    const target = /\bTarget="([^"]+)"/.exec(m[0]);
    if (id && target) relMap.set(id[1], target[1]);
  }
  const known = new Set(slideNames);
  const ordered = [];
  const seen = new Set();
  for (const m of presentationXml.matchAll(/<p:sldId\b[^>]*>/g)) {
    const rid = /\br:id="([^"]+)"/.exec(m[0]);
    if (!rid) continue;
    const target = relMap.get(rid[1]);
    if (!target) continue;
    // Targets are relative to ppt/ (e.g. "slides/slide3.xml"); normalise to the
    // zip's part name and only accept a slide part we actually have.
    const name = ('ppt/' + target.replace(/^\.?\/*/, '').replace(/^\.\.\//, '')).replace(/\/{2,}/g, '/');
    if (known.has(name) && !seen.has(name)) { ordered.push(name); seen.add(name); }
  }
  if (!ordered.length) return fallback();
  // Append any slide part not referenced by the list (rare) so nothing is lost.
  for (const name of byFilename) if (!seen.has(name)) ordered.push(name);
  return ordered.map((name, i) => ({ name, num: i + 1 }));
}

// Pull the slide's text, one line per <a:p> paragraph, in document order. The
// <a:t ...> match allows attributes (e.g. xml:space="preserve") which real
// OOXML uses for whitespace-only runs.
function slideText(xml) {
  const lines = [];
  for (const para of xml.match(/<a:p\b[\s\S]*?<\/a:p>/g) || []) {
    const runs = (para.match(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g) || [])
      .map((t) => decodeEntities(t.replace(/<a:t[^>]*>([\s\S]*?)<\/a:t>/, '$1')));
    const line = runs.join('').trim();
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

export async function parse(filePath, ctx) {
  if (fs.statSync(filePath).size > MAX_BYTES) {
    throw new Error(`PPTX exceeds ${MAX_BYTES / (1024 * 1024)}MB limit`);
  }

  let JSZip;
  try {
    JSZip = (await import('jszip')).default;
  } catch (e) {
    throw new Error('PPTX support needs jszip. Install it with:  npm i jszip', { cause: e });
  }

  // loadAsync stores entries compressed and only decompresses on .async(), so a
  // bomb in unrelated parts (e.g. ppt/media) is never expanded — we only read
  // slide XML, and guard each entry's declared uncompressed size below.
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));

  const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const readPart = async (n) => (zip.files[n] ? zip.files[n].async('string') : '');
  const [presentationXml, relsXml] = await Promise.all([
    readPart('ppt/presentation.xml'),
    readPart('ppt/_rels/presentation.xml.rels'),
  ]);
  const order = orderSlides(presentationXml, relsXml, slideNames);

  const sections = [];
  for (const { name, num } of order) {
    const entry = zip.files[name];
    const declared = entry._data && entry._data.uncompressedSize;
    if (declared && declared > MAX_SLIDE_BYTES) continue; // skip a suspiciously large slide part
    const xml = await entry.async('string');
    const text = slideText(xml);
    if (!text.trim()) continue;
    const heading = `Slide ${num}`;
    sections.push({
      text: `${heading}\n${text}`,
      headingPath: [heading],
      section: heading,
      images: [],
    });
  }
  return sections;
}
