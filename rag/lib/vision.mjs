// Reads an image into searchable text using the vision-capable chat model
// (OPENROUTER_AI_MODEL) — deliberately NOT a separate OCR engine, so every
// input type is understood by the same model for consistency.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';

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

export async function describeImage(filePath, hint = '') {
  const { apiKey, chatModel, base, referer, title } = config();
  if (!apiKey || !chatModel) throw new Error('OPENROUTER_API_KEY / OPENROUTER_AI_MODEL not set');

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'image/png';
  const b64 = fs.readFileSync(filePath).toString('base64');

  const instruction =
    'You are building a searchable knowledge base for NHS GP reception staff using EMIS Web. '
    + 'Transcribe and describe this image so it can be found and fully understood from the text alone. '
    + 'Capture any visible on-screen text, menu paths, button and field labels, and the order of steps. '
    + 'Do not invent anything that is not visible. Reply with plain text only, no preamble.'
    + (hint ? ('\nContext: ' + hint) : '');

  const res = await fetch(base + '/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': referer,
      'X-Title': title,
    },
    body: JSON.stringify({
      model: chatModel,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: instruction },
          { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
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
