// Reads an image into searchable text using a vision-capable model the practice
// has chosen (/settings) — deliberately NOT a separate OCR engine, so every
// input type is understood by the same model for consistency.
import fs from 'node:fs';
import path from 'node:path';
import { config, imageReaderModels } from './config.mjs';

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export function isImage(ext) {
  return Object.prototype.hasOwnProperty.call(MIME, ext.toLowerCase());
}

function instructionFor(hint) {
  return 'You are building a searchable knowledge base for NHS GP reception staff using EMIS Web. '
    + 'Transcribe and describe this image so it can be found and fully understood from the text alone. '
    + 'Capture any visible on-screen text, menu paths, button and field labels, and the order of steps. '
    + 'Do not invent anything that is not visible. Reply with plain text only, no preamble.'
    + (hint ? ('\nContext: ' + hint) : '');
}

// One attempt, on one model.
async function readWith(model, dataUrl, hint) {
  const { apiKey, base, referer, title } = config();
  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': referer,
      'X-Title': title,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: instructionFor(hint) },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Vision request failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || '').trim();
}

// Core call — describes an image given as a data URL.
//
// Tried on the fast role first and the reasoning model second (see
// imageReaderModels): transcribing a screenshot is reading, and this runs over
// a whole folder of them, but a fast model the practice has chosen may not read
// images at all. Only the last model's failure is raised — a fallback that
// worked is not an error, and one that did not must not hide the real reason.
async function describeDataUrl(dataUrl, hint = '') {
  const { apiKey } = config();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');
  const models = await imageReaderModels();
  if (!models.length) throw new Error('No model is configured to read images');

  for (let i = 0; i < models.length; i++) {
    try {
      return await readWith(models[i], dataUrl, hint);
    } catch (e) {
      if (i === models.length - 1) throw e;
      console.warn(`[vision] ${models[i]} could not read the image (${String(e.message || e).slice(0, 160)}) — trying ${models[i + 1]}`);
    }
  }
  return '';
}

export async function describeImageBuffer(buffer, mime = 'image/png', hint = '') {
  const b64 = Buffer.from(buffer).toString('base64');
  return describeDataUrl(`data:${mime};base64,${b64}`, hint);
}

export async function describeImage(filePath, hint = '') {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'image/png';
  return describeImageBuffer(fs.readFileSync(filePath), mime, hint);
}
