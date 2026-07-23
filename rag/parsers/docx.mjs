// Word documents. Uses mammoth to build an HTML rendition (embedded images are
// written under public/ so answers can show them) and splits that rendition into
// heading-delimited sections. Each section carries ONLY the images positioned
// within it, so a chunk from one step no longer inherits every screenshot in the
// document — the picture stays tied to the step it illustrates. Documents with no
// headings fall back to a single section, exactly as before.
import fs from 'node:fs';

export const exts = ['.docx'];

// Only formats a browser can render inline. Word frequently embeds legacy vector
// art as WMF/EMF ("image/x-wmf"), which no browser displays — keep those out of
// the citable image set so a step never renders a broken thumbnail.
const DISPLAYABLE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

// Turn a run of mammoth HTML into readable text, preserving block boundaries
// (paragraphs, list items, headings) as blank lines so the downstream chunker
// still splits on paragraphs. Pure string work — no DOM.
export function htmlBlockText(html) {
  return String(html || '')
    .replace(/<\/(p|h[1-6]|li|tr|div|blockquote|section|figure|figcaption)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-zA-Z]+;/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Split a mammoth HTML rendition into ordered sections at h1–h3 boundaries.
// Each returned section is { text, headingPath, section, images } with images
// (leading slash stripped, non-displayable formats dropped) positioned inside
// that section. Exported and pure so it is unit-tested without a real .docx.
export function htmlToSections(html) {
  const src = String(html || '');

  const heads = [];
  const headRe = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  for (let m; (m = headRe.exec(src)); ) {
    heads.push({ index: m.index, level: Number(m[1]), title: htmlBlockText(m[2]) });
  }

  const imgs = [];
  const imgRe = /<img\b[^>]*\bsrc="([^"]*)"[^>]*>/gi;
  for (let m; (m = imgRe.exec(src)); ) {
    imgs.push({ index: m.index, url: m[1].replace(/^\//, '') });
  }
  const imagesIn = (start, end) => imgs
    .filter((im) => im.index >= start && im.index < end)
    .map((im) => im.url)
    .filter((u) => DISPLAYABLE.test(u));

  // Boundaries: a lead-in span before the first heading, then one span per
  // heading up to the next heading (or the end of the document).
  const bounds = [];
  if (!heads.length) {
    bounds.push({ start: 0, end: src.length, headingPath: [] });
  } else {
    if (heads[0].index > 0) bounds.push({ start: 0, end: heads[0].index, headingPath: [] });
    heads.forEach((h, i) => {
      const end = i + 1 < heads.length ? heads[i + 1].index : src.length;
      bounds.push({ start: h.index, end, headingPath: h.title ? [h.title] : [] });
    });
  }

  const sections = [];
  for (const b of bounds) {
    const text = htmlBlockText(src.slice(b.start, b.end));
    const images = imagesIn(b.start, b.end);
    if (!text && !images.length) continue;
    sections.push({ text, headingPath: b.headingPath, section: b.headingPath[0] || '', images });
  }
  return sections;
}

export async function parse(filePath, ctx) {
  let mammoth;
  try {
    mammoth = await import('mammoth');
  } catch (e) {
    throw new Error('DOCX support needs mammoth. Install it with:  npm i mammoth');
  }
  const buffer = fs.readFileSync(filePath);

  let i = 0;
  const convertImage = mammoth.images.imgElement(async (image) => {
    const b64 = await image.read('base64');
    const ext = (image.contentType && image.contentType.split('/')[1]) || 'png';
    let src = '';
    if (ctx && ctx.publicWrite) {
      src = ctx.publicWrite(`img-${i++}.${ext}`, Buffer.from(b64, 'base64'));
    }
    return { src: src ? '/' + src : `data:${image.contentType};base64,${b64}` };
  });

  const html = (await mammoth.convertToHtml({ buffer }, { convertImage })).value || '';

  // Without a place to serve assets there is no viewer document and no image
  // URLs to cite, so fall back to plain extracted text as a single section.
  if (!ctx || !ctx.publicWrite) {
    const text = (await mammoth.extractRawText({ buffer })).value || '';
    return text.trim() ? [{ text, headingPath: [], section: '', images: [], view: undefined }] : [];
  }

  const doc = '<!doctype html><meta charset="utf-8"><body style="font-family:Hanken Grotesk,system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.6;">'
    + html + '</body>';
  const view = { kind: 'html', url: ctx.publicWrite('document.html', Buffer.from(doc, 'utf8')) };

  const sections = htmlToSections(html);
  if (!sections.length) {
    const text = (await mammoth.extractRawText({ buffer })).value || '';
    return [{ text, headingPath: [], section: '', images: [], view }];
  }
  return sections.map((sec) => ({ ...sec, view }));
}
