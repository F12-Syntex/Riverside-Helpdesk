// PDFs. For each page we extract the selectable text (pdfjs-dist) AND render the
// page to a PNG, so answers can show the page and link to it. A page with no
// selectable text (scanned) is read by the vision model instead — no OCR engine.
// Page images are written under public/ via ctx.publicWrite.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../lib/config.mjs';
import { describeImageBuffer } from '../lib/vision.mjs';

export const exts = ['.pdf'];

const RENDER_SCALE = 2;

export async function parse(filePath, ctx) {
  let pdfjs;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (e) {
    throw new Error('PDF support needs pdfjs-dist. Install it with:  npm i pdfjs-dist');
  }
  let createCanvas = null;
  try { ({ createCanvas } = await import('@napi-rs/canvas')); } catch (e) { /* render disabled */ }

  const data = new Uint8Array(fs.readFileSync(filePath));
  // pdfjs needs a URL ending in "/" (not an OS path) for the bundled fonts.
  const standardFontDataUrl = pathToFileURL(path.join(ROOT, 'node_modules', 'pdfjs-dist', 'standard_fonts')).href + '/';
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, standardFontDataUrl }).promise;

  const sections = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let text = content.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();

    let images = [];
    if (createCanvas && ctx && ctx.publicWrite) {
      try {
        const viewport = page.getViewport({ scale: RENDER_SCALE });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const canvasContext = canvas.getContext('2d');
        await page.render({ canvasContext, viewport, canvas }).promise;
        const buf = canvas.toBuffer('image/png');
        images = [ctx.publicWrite(`page-${p}.png`, buf)];
        // Scanned page: no selectable text, so read the rendered image instead.
        if (!text) {
          text = await describeImageBuffer(buf, 'image/png', ctx.docTitle ? 'Page ' + p + ' of ' + ctx.docTitle : '');
        }
      } catch (e) {
        // Rendering failed for this page — keep the text, skip the image.
      }
    }

    if (text || images.length) {
      sections.push({ text: text || '', page: p, headingPath: [`Page ${p}`], section: `Page ${p}`, images });
    }
  }

  if (!sections.length) {
    throw new Error('No text or renderable pages in PDF. Install @napi-rs/canvas to render scanned pages (see rag/README.md).');
  }
  return sections;
}
