// Plain text and Markdown. Markdown is split into sections on its headings so
// each chunk carries a heading path (good for retrieval and citation).
import fs from 'node:fs';
import path from 'node:path';
import { slugify } from '../lib/chunk.mjs';

export const exts = ['.txt', '.md', '.markdown'];

export async function parse(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.txt') return [{ text: raw, headingPath: [] }];

  const lines = raw.split(/\r?\n/);
  const sections = [];
  let headingPath = [];
  let buf = [];
  const push = () => {
    const body = buf.join('\n').trim();
    if (body) {
      const prefix = headingPath.length ? headingPath.join(' › ') + '\n' : '';
      const last = headingPath[headingPath.length - 1] || '';
      sections.push({
        text: prefix + body,
        headingPath: headingPath.slice(),
        section: last,
        view: last ? { anchor: slugify(last) } : undefined,
      });
    }
    buf = [];
  };

  for (const ln of lines) {
    const h = /^(#{1,6})\s+(.*)$/.exec(ln);
    if (h) {
      push();
      const depth = h[1].length;
      headingPath = headingPath.slice(0, depth - 1);
      headingPath[depth - 1] = h[2].trim();
    } else {
      buf.push(ln);
    }
  }
  push();
  return sections.length ? sections : [{ text: raw, headingPath: [] }];
}
