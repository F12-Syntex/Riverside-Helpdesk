// What the reader actually saw, written down as text.
//
// A template answer is data — a list of blocks (see lib/templates/blocks.mjs) —
// and the browser renders it as a card. The question log has to store what was
// shown, not the shape it was shown in, so the blocks are flattened here into
// the plainest thing that still reads like the card: headings stay headings,
// steps stay numbered, a disclosure keeps its label so whoever reads the log
// knows that text was behind one.
//
// Pure and free of the database, so the flattening can be tested directly and
// so the same function can be used anywhere an answer has to become text.

// Everything the card puts on screen that is not part of the wording.
const clean = (value) => String(value == null ? '' : value)
  .replace(/<\/?mark>/g, '')
  .replace(/\r\n/g, '\n')
  .trim();

function contactLine(item) {
  if (!item) return '';
  if (typeof item === 'string') return clean(item);
  return [item.label, item.tel, item.email, item.note].map(clean).filter(Boolean).join(' · ');
}

function askOption(option) {
  if (!option) return '';
  if (typeof option === 'string') return clean(option);
  return clean(option.label || option.text || option.ask || '');
}

function blockLines(block, indent) {
  if (!block || !block.type) return [];
  const pad = (line) => (indent ? indent + line : line);
  const out = [];

  switch (block.type) {
    case 'fields':
      if (block.title) out.push(pad(clean(block.title)));
      for (const item of block.items || []) {
        const value = clean(item?.value) || clean(item?.missing);
        out.push(pad(`${clean(item?.label)}: ${value}`.trim()));
      }
      break;

    case 'steps':
      (block.items || []).forEach((item, i) => {
        out.push(pad(`${i + 1}. ${clean(item?.text ?? item)}`));
      });
      break;

    case 'bullets':
      if (block.title) out.push(pad(clean(block.title)));
      for (const item of block.items || []) out.push(pad(`- ${clean(item?.text ?? item)}`));
      break;

    case 'note':
      out.push(pad(`[${clean(block.tone) || 'info'}] ${clean(block.text)}`));
      break;

    case 'table': {
      const head = (block.head || []).map(clean);
      if (head.length) out.push(pad(head.join(' | ')));
      for (const row of block.rows || []) out.push(pad((row || []).map(clean).join(' | ')));
      break;
    }

    case 'expand':
      out.push(pad(`▸ ${clean(block.label)}${block.hint ? ' — ' + clean(block.hint) : ''}`));
      for (const inner of block.blocks || []) out.push(...blockLines(inner, indent + '   '));
      break;

    case 'contacts':
      for (const item of block.items || []) {
        const line = contactLine(item);
        if (line) out.push(pad(line));
      }
      break;

    case 'message':
      out.push(pad(`${clean(block.label) || 'Message'}:`));
      out.push(pad(clean(block.text)));
      break;

    case 'ask':
      out.push(pad(clean(block.question)));
      for (const option of block.options || []) {
        const line = askOption(option);
        if (line) out.push(pad(`- ${line}`));
      }
      break;

    case 'text':
    default:
      out.push(clean(block.markdown ?? block.text ?? ''));
      break;
  }

  return out.filter((line) => line.trim());
}

/**
 * A rendered template answer, as the text of what was shown.
 *
 * @param {object} answer the object lib/templates/blocks.mjs `answer()` builds
 * @param {number} [max]  hard cap, so one enormous Notebook page cannot fill a row
 */
export function answerToText(answer, max = 20000) {
  if (!answer) return '';
  const parts = [];
  if (answer.title) parts.push('# ' + clean(answer.title));
  if (answer.subtitle) parts.push(clean(answer.subtitle));
  if (answer.warn) parts.push('[warn] ' + clean(answer.warn));
  for (const block of answer.blocks || []) {
    const lines = blockLines(block, '');
    if (lines.length) parts.push(lines.join('\n'));
  }
  const text = parts.filter(Boolean).join('\n\n').trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// The first real line of an answer, for a list showing one row per question.
export function answerSummary(text, max = 160) {
  const line = String(text || '')
    .split('\n')
    .map((l) => l.replace(/^[#>\-*\d.)\s]+/, '').trim())
    .find(Boolean) || '';
  return line.length > max ? line.slice(0, max - 1) + '…' : line;
}
