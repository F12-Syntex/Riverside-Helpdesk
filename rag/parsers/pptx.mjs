// PowerPoint (.pptx) decks. A .pptx is a zip of OOXML parts; the visible text of
// each slide lives in ppt/slides/slideN.xml as <a:t> runs grouped into <a:p>
// paragraphs. We emit one section per slide (carrying its real "Slide N" number
// from the filename) so retrieval and citations point at the right slide.
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

  // Order slides by their numeric index (slide2 before slide10).
  const slideNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => (parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10)));

  const sections = [];
  for (const name of slideNames) {
    const entry = zip.files[name];
    const declared = entry._data && entry._data.uncompressedSize;
    if (declared && declared > MAX_SLIDE_BYTES) continue; // skip a suspiciously large slide part
    const xml = await entry.async('string');
    const text = slideText(xml);
    if (!text.trim()) continue;
    const slideNum = parseInt(name.match(/(\d+)/)[1], 10);
    const heading = `Slide ${slideNum}`;
    sections.push({
      text: `${heading}\n${text}`,
      headingPath: [heading],
      section: heading,
      images: [],
    });
  }
  return sections;
}
