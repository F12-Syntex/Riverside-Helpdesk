// Word documents. Uses mammoth to extract the raw text, pull out embedded
// images (written under public/ via ctx.publicWrite so answers can show them),
// and produce an HTML rendition that the in-app viewer can open.
import fs from 'node:fs';

export const exts = ['.docx'];

export async function parse(filePath, ctx) {
  let mammoth;
  try {
    mammoth = await import('mammoth');
  } catch (e) {
    throw new Error('DOCX support needs mammoth. Install it with:  npm i mammoth');
  }
  const buffer = fs.readFileSync(filePath);

  const images = [];
  let i = 0;
  const convertImage = mammoth.images.imgElement(async (image) => {
    const b64 = await image.read('base64');
    const ext = (image.contentType && image.contentType.split('/')[1]) || 'png';
    let src = '';
    if (ctx && ctx.publicWrite) {
      src = ctx.publicWrite(`img-${i++}.${ext}`, Buffer.from(b64, 'base64'));
      images.push(src);
    }
    return { src: src ? '/' + src : `data:${image.contentType};base64,${b64}` };
  });

  const html = (await mammoth.convertToHtml({ buffer }, { convertImage })).value || '';
  const text = (await mammoth.extractRawText({ buffer })).value || '';

  let view;
  if (ctx && ctx.publicWrite) {
    const doc = '<!doctype html><meta charset="utf-8"><body style="font-family:Hanken Grotesk,system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.6;">'
      + html + '</body>';
    view = { kind: 'html', url: ctx.publicWrite('document.html', Buffer.from(doc, 'utf8')) };
  }

  return [{ text, headingPath: [], section: '', images, view }];
}
