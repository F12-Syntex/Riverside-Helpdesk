'use client';

// Safe block-level markdown renderer for the assistant's answer sections — the
// same vocabulary the notebook's AI formatter produces: ##/### headings,
// bullet/numbered lists (with simple nesting and task items), tables,
// blockquotes, horizontal rules and paragraphs. Inline content inside every
// block goes through Rich's whitelist renderer (**bold**, <mark>, <u>, <kbd>
// and the three NHS colour spans) — nothing is ever injected as HTML.
//
// Visual styling lives in globals.css under .riva-md, mirroring the notebook's
// .nb-prose look so answers read like a well-formatted practice note.

import React from 'react';
import { renderInline, plainText } from './Rich';

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const LIST_RE = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const TASK_RE = /^\[([ xX])\]\s+(.*)$/;

function isTableSep(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes('-') && line.includes('|');
}

function splitRow(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

function isBlockStart(line) {
  return HEADING_RE.test(line) || HR_RE.test(line) || LIST_RE.test(line)
    || QUOTE_RE.test(line) || TABLE_ROW_RE.test(line);
}

// Parse the markdown into a flat list of typed blocks.
function parseBlocks(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (HR_RE.test(line)) { blocks.push({ t: 'hr' }); i++; continue; }

    const h = HEADING_RE.exec(line);
    if (h) {
      // The card supplies its own h1-level title, so clamp everything to h2–h4.
      blocks.push({ t: 'h', level: Math.min(Math.max(h[1].length, 2), 4), text: h[2].trim() });
      i++; continue;
    }

    if (QUOTE_RE.test(line)) {
      const quote = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) { quote.push(lines[i].replace(QUOTE_RE, '')); i++; }
      blocks.push({ t: 'q', lines: quote });
      continue;
    }

    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i]) && !isTableSep(lines[i])) { rows.push(splitRow(lines[i])); i++; }
      blocks.push({ t: 'table', header, rows });
      continue;
    }

    if (LIST_RE.test(line)) {
      const items = [];
      while (i < lines.length) {
        const m = LIST_RE.exec(lines[i]);
        if (m) {
          items.push({ depth: Math.min(Math.floor(m[1].length / 2), 3), ordered: !!m[3], text: m[4] });
          i++; continue;
        }
        // An indented continuation line belongs to the previous item.
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && !isBlockStart(lines[i]) && items.length) {
          items[items.length - 1].text += ' ' + lines[i].trim();
          i++; continue;
        }
        break;
      }
      blocks.push({ t: 'list', items: nestItems(items) });
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) { para.push(lines[i].trim()); i++; }
    blocks.push({ t: 'p', text: para.join(' ') });
  }
  return blocks;
}

// Turn the flat {depth, ordered, text} items into a tree by indentation.
function nestItems(items) {
  const root = { depth: -1, children: [] };
  const stack = [root];
  for (const it of items) {
    const node = { ...it, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].depth >= node.depth) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return root.children;
}

// An item may be a "- [ ] task" — render a static checkbox glyph before it.
function itemContent(text, key) {
  const task = TASK_RE.exec(text);
  if (!task) return renderInline(text, key);
  const done = task[1] !== ' ';
  return (
    <>
      <span aria-hidden style={{ color: done ? '#007f3b' : '#768692', fontWeight: 700, marginRight: 7 }}>
        {done ? '☑' : '☐'}
      </span>
      {renderInline(task[2], key)}
    </>
  );
}

function ListNodes({ nodes, keyBase }) {
  if (!nodes.length) return null;
  const Tag = nodes[0].ordered ? 'ol' : 'ul';
  return (
    <Tag>
      {nodes.map((n, i) => (
        <li key={i}>
          {itemContent(n.text, keyBase + '-' + i)}
          {n.children.length > 0 && <ListNodes nodes={n.children} keyBase={keyBase + '-' + i} />}
        </li>
      ))}
    </Tag>
  );
}

function Block({ b, k }) {
  if (b.t === 'hr') return <hr />;
  if (b.t === 'h') {
    const Tag = 'h' + b.level;
    return <Tag>{renderInline(b.text, k)}</Tag>;
  }
  if (b.t === 'q') {
    return (
      <blockquote>
        {b.lines.filter((l) => l.trim()).map((l, i) => <p key={i}>{renderInline(l, k + '-' + i)}</p>)}
      </blockquote>
    );
  }
  if (b.t === 'table') {
    return (
      <div className="riva-md-tablewrap">
        <table>
          <thead>
            <tr>{b.header.map((c, i) => <th key={i}>{renderInline(c, k + '-h' + i)}</th>)}</tr>
          </thead>
          <tbody>
            {b.rows.map((row, ri) => (
              <tr key={ri}>{row.map((c, ci) => <td key={ci}>{renderInline(c, k + '-' + ri + '-' + ci)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (b.t === 'list') return <ListNodes nodes={b.items} keyBase={k} />;
  return <p>{renderInline(b.text, k)}</p>;
}

export default function Md({ text }) {
  const blocks = parseBlocks(text);
  return (
    <div className="riva-md">
      {blocks.map((b, i) => <Block key={i} b={b} k={'b' + i} />)}
    </div>
  );
}

// The section as readable plain text — for clipboard copies, the save-to-guide
// prefill and the conversation history sent back to the model. Headings lose
// their #s, table rows become "a | b" lines, list markers are kept.
export function mdPlain(md) {
  const out = [];
  for (const raw of String(md || '').replace(/\r\n?/g, '\n').split('\n')) {
    let line = raw;
    if (isTableSep(line)) continue;
    if (HR_RE.test(line)) continue;
    line = line.replace(/^(#{1,6})\s+/, '');
    line = line.replace(QUOTE_RE, '');
    if (TABLE_ROW_RE.test(line)) line = splitRow(line).join(' | ');
    line = line.replace(/^(\s*)[-*+]\s+/, '$1- ');
    out.push(plainText(line));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
