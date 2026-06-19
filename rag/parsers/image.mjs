// Images (screenshots, posters, scanned forms). The vision-capable chat model
// reads the image into text — no OCR engine — and a display copy is placed under
// public/ so the answer UI can show it.
import path from 'node:path';
import { describeImage } from '../lib/vision.mjs';

export const exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

export async function parse(filePath, ctx) {
  const hint = ctx && ctx.docTitle ? 'From document: ' + ctx.docTitle : '';
  const text = await describeImage(filePath, hint);
  const web = ctx && ctx.publicCopy ? ctx.publicCopy(filePath) : '';
  return [{
    text,
    images: web ? [web] : [],
    headingPath: [],
    section: path.basename(filePath),
    view: web ? { kind: 'image', url: web } : undefined,
  }];
}
