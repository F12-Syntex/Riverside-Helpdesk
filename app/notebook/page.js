'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Notebook — practice notes the assistant uses automatically.
 *
 * Sidebar on the far left holds the section tree; the entire right
 * side is the notes area with its own header bar (breadcrumb, save
 * state, attach/delete). Sections are name-only containers: content
 * lives in pages beneath them, so creating a section also creates its
 * first page and opens that page for writing. Files upload by
 * drag-and-drop onto a page (or the paperclip button). Notes persist
 * to Postgres (/api/notebook); files go to Vercel Blob
 * (/api/notebook/attachments). Destructive actions confirm through the
 * shared NHS-style sheet (riva-modal-overlay / riva-sheet).
 * ------------------------------------------------------------------ */

const C = {
  ink: '#212b32', mut: '#4c6272', dim: '#768692', line: '#d8dde0',
  soft: '#eef1f2', blue: '#005eb8', navy: '#003087', sel: '#e8f1f8',
  bg: '#f0f4f5', red: '#d5281b', green: '#007f3b',
};

// Hover-reveal row actions + the parent→child connector lines live in real
// CSS. Each nested level is indented inside .nb-kids, which draws a vertical
// guide; each row in it draws a short horizontal tick joining the guide.
const CSS = `
.nb-row .nb-actions{opacity:0;transition:opacity .12s;}
.nb-row:hover .nb-actions,.nb-row:focus-within .nb-actions{opacity:1;}
.nb-row:hover{background:#f7fbff;}
.nb-kids{margin-left:13px;padding-left:6px;border-left:1.5px solid ${C.line};}
.nb-kids>div>.nb-row{position:relative;}
.nb-kids>div>.nb-row::before{content:"";position:absolute;left:-6px;top:50%;width:5px;height:1.5px;background:${C.line};}
.nb-crumb{border:none;background:none;font:inherit;font-size:15.5px;font-weight:600;color:${C.ink};cursor:pointer;padding:4px 0;border-bottom:1.5px dashed transparent;}
.nb-crumb:hover{color:${C.blue};}
.nb-block{padding:2px 0;}
.nb-scroll{scrollbar-width:none;-ms-overflow-style:none;}
.nb-scroll::-webkit-scrollbar{display:none;}
.nb-title{border-bottom:1.5px dashed transparent;transition:border-color .12s;}
.nb-title:hover{border-bottom-color:${C.blue};}
.nb-title:focus{border-bottom:1.5px solid ${C.blue};}
`;

const MAX_DEPTH = 4; // sections + 3 levels of pages keeps the tree sane

function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

const actBtn = 'flex:none;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:none;background:none;cursor:pointer;color:' + C.mut + ';border-radius:6px;';

// Formatting-toolbar glyphs (same 24×24 stroke style as Icons in ui.js —
// geometry from the Lucide set). Local to the notebook: no other page
// needs them.
const TIcons = {
  h1: (<><path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="m17 12 3-2v8" /></>),
  h2: (<><path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1" /></>),
  h3: (<><path d="M4 12h8" /><path d="M4 18V6" /><path d="M12 18V6" /><path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2 2 2 0 0 1 2 2c0 1.5-1.8 2.5-3.5 1.5" /></>),
  bold: (<><path d="M14 12a4 4 0 0 0 0-8H6v8" /><path d="M15 20a4 4 0 0 0 0-8H6v8Z" /></>),
  italic: (<><line x1="19" x2="10" y1="4" y2="4" /><line x1="14" x2="5" y1="20" y2="20" /><line x1="15" x2="9" y1="4" y2="20" /></>),
  strike: (<><path d="M16 4H9a3 3 0 0 0-2.83 4" /><path d="M14 12a4 4 0 0 1 0 8H6" /><line x1="4" x2="20" y1="12" y2="12" /></>),
  code: (<><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>),
  list: (<><line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" /><line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" /></>),
  listOrdered: (<><line x1="10" x2="21" y1="6" y2="6" /><line x1="10" x2="21" y1="12" y2="12" /><line x1="10" x2="21" y1="18" y2="18" /><path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></>),
  listChecks: (<><path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" /><path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" /></>),
  indent: (<><polyline points="3 8 7 12 3 16" /><line x1="21" x2="11" y1="12" y2="12" /><line x1="21" x2="11" y1="6" y2="6" /><line x1="21" x2="11" y1="18" y2="18" /></>),
  outdent: (<><polyline points="7 8 3 12 7 16" /><line x1="21" x2="11" y1="12" y2="12" /><line x1="21" x2="11" y1="6" y2="6" /><line x1="21" x2="11" y1="18" y2="18" /></>),
  quote: (<><path d="M17 6H3" /><path d="M21 12H8" /><path d="M21 18H8" /><path d="M3 12v6" /></>),
  divider: (<><line x1="5" x2="19" y1="12" y2="12" /><circle cx="12" cy="6" r="0.5" /><circle cx="12" cy="18" r="0.5" /></>),
  underline: (<><path d="M6 4v6a6 6 0 0 0 12 0V4" /><line x1="4" x2="20" y1="20" y2="20" /></>),
  highlighter: (<><path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4a2 2 0 0 1 2.8 0l5.2 5.2a2 2 0 0 1 0 2.8Z" /></>),
  table: (<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M3 15h18" /><path d="M12 3v18" /></>),
};

// Text-colour swatches for the toolbar (NHS palette).
const TEXT_COLORS = [
  { name: 'Red', hex: '#d5281b' },
  { name: 'Green', hex: '#007f3b' },
  { name: 'Blue', hex: '#005eb8' },
];

const TABLE_SNIPPET = '\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n';

/* --------------------------- Markdown view --------------------------- *
 * Notes are stored as markdown; Preview renders it. Small hand-rolled
 * renderer (headings, lists incl. tasks, quotes, hr, bold/italic/strike/
 * code/links) — enough for notes without pulling in a dependency.       */

// Inline markdown plus a safe HTML subset: <u>, <mark>, <sup>, <sub>, <br>,
// <big>, <small>, <kbd>, and <span style="color:…">. Only these exact shapes
// are recognised — anything else renders as literal text, so no arbitrary
// HTML/attributes ever reach the DOM. Recursive, so tags nest with markdown.
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/;

function renderInline(str) {
  const out = [];
  let rest = String(str);
  let k = 0;
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(~~[^~]+~~)|(\[[^\]]+\]\([^)\s]+\))|(<(u|mark|sup|sub|big|small|kbd)>[\s\S]*?<\/\7>)|(<span style="color:\s*[^">]+;?\s*">[\s\S]*?<\/span>)|(<br\s*\/?>)/;
  while (rest) {
    const m = rest.match(re);
    if (!m) { out.push(rest); break; }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const t = m[0];
    let mm;
    if (t.startsWith('`')) out.push(<code key={k++} style={s('font-family:Consolas,Menlo,monospace;font-size:.9em;background:' + C.soft + ';border-radius:4px;padding:1px 5px;')}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<strong key={k++}>{renderInline(t.slice(2, -2))}</strong>);
    else if (t.startsWith('~~')) out.push(<s key={k++}>{renderInline(t.slice(2, -2))}</s>);
    else if (t.startsWith('*')) out.push(<em key={k++}>{renderInline(t.slice(1, -1))}</em>);
    else if (t.startsWith('[')) {
      mm = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      out.push(<a key={k++} href={mm[2]} target="_blank" rel="noopener noreferrer" style={s('color:' + C.blue + ';')}>{mm[1]}</a>);
    } else if (/^<br/i.test(t)) out.push(<br key={k++} />);
    else if ((mm = t.match(/^<span style="color:\s*([^">;]+);?\s*">([\s\S]*?)<\/span>$/))) {
      out.push(SAFE_COLOR.test(mm[1].trim())
        ? <span key={k++} style={{ color: mm[1].trim() }}>{renderInline(mm[2])}</span>
        : <span key={k++}>{renderInline(mm[2])}</span>);
    } else if ((mm = t.match(/^<(u|mark|sup|sub|big|small|kbd)>([\s\S]*?)<\/\1>$/))) {
      const inner = renderInline(mm[2]);
      const tag = mm[1];
      if (tag === 'u') out.push(<u key={k++}>{inner}</u>);
      else if (tag === 'mark') out.push(<mark key={k++} style={s('background:#fff6cc;border-radius:3px;padding:0 2px;')}>{inner}</mark>);
      else if (tag === 'sup') out.push(<sup key={k++}>{inner}</sup>);
      else if (tag === 'sub') out.push(<sub key={k++}>{inner}</sub>);
      else if (tag === 'big') out.push(<span key={k++} style={s('font-size:1.2em;font-weight:600;')}>{inner}</span>);
      else if (tag === 'small') out.push(<span key={k++} style={s('font-size:.85em;color:' + C.mut + ';')}>{inner}</span>);
      else out.push(<kbd key={k++} style={s('font-family:Consolas,Menlo,monospace;font-size:.85em;background:' + C.soft + ';border:1px solid ' + C.line + ';border-bottom-width:2px;border-radius:5px;padding:1px 6px;')}>{inner}</kbd>);
    } else out.push(t);
    rest = rest.slice(m.index + t.length);
  }
  return out;
}

const H_SIZE = { 1: 26, 2: 22, 3: 18.5, 4: 16.5, 5: 15.5, 6: 15 };

function MdView({ text }) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0, k = 0;
  const para = 'margin:0 0 12px;font-size:16px;line-height:1.65;color:' + C.ink + ';';
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)/))) {
      const lv = m[1].length;
      blocks.push(<div key={k++} style={s('margin:' + (blocks.length ? 22 : 0) + 'px 0 10px;font-size:' + H_SIZE[lv] + 'px;font-weight:700;letter-spacing:-0.01em;color:' + C.ink + ';' + (lv <= 2 ? 'padding-bottom:6px;border-bottom:1px solid ' + C.soft + ';' : ''))}>{renderInline(m[2])}</div>);
      i++; continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(l.trim())) {
      blocks.push(<hr key={k++} style={s('border:none;border-top:1px solid ' + C.line + ';margin:18px 0;')} />);
      i++; continue;
    }
    if (/^>\s?/.test(l)) {
      const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      blocks.push(<div key={k++} style={s('margin:0 0 12px;border-left:4px solid ' + C.blue + ';background:' + C.sel + ';padding:10px 14px;border-radius:0 8px 8px 0;font-size:15.5px;line-height:1.6;color:' + C.ink + ';')}>{renderInline(q.join(' '))}</div>);
      continue;
    }
    // Markdown table: header row, |---| separator, body rows.
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      const cellS = 'padding:8px 12px;border:1px solid ' + C.line + ';font-size:15px;line-height:1.5;text-align:left;vertical-align:top;';
      blocks.push(
        <div key={k++} style={s('margin:0 0 14px;overflow-x:auto;')}>
          <table style={s('border-collapse:collapse;min-width:50%;')}>
            <thead><tr>{head.map((c, j) => <th key={j} style={s(cellS + 'background:' + C.soft + ';font-weight:700;color:' + C.ink + ';')}>{renderInline(c)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => (
              <tr key={ri} style={s(ri % 2 ? 'background:#fafcfd;' : '')}>{head.map((_, j) => <td key={j} style={s(cellS + 'color:' + C.ink + ';')}>{renderInline(r[j] || '')}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const im = lines[i].match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
        const depth = Math.min(4, Math.floor(im[1].replace(/\t/g, '  ').length / 2));
        const tm = im[3].match(/^\[([ xX])\]\s+(.*)$/);
        items.push({ depth, num: /^\d+\.$/.test(im[2]) ? im[2] : null, task: !!tm, checked: !!tm && tm[1] !== ' ', text: tm ? tm[2] : im[3] });
        i++;
      }
      blocks.push(
        <div key={k++} style={s('margin:0 0 12px;display:flex;flex-direction:column;gap:5px;')}>
          {items.map((it, j) => (
            <div key={j} style={s('display:flex;gap:9px;padding-left:' + (4 + it.depth * 22) + 'px;font-size:16px;line-height:1.55;color:' + C.ink + ';')}>
              <span style={s('flex:none;min-width:14px;text-align:center;color:' + (it.task ? (it.checked ? C.green : C.dim) : C.blue) + ';' + (it.num ? 'font-variant-numeric:tabular-nums;font-weight:600;font-size:15px;' : 'font-weight:700;'))}>
                {it.task ? (it.checked ? '☑' : '☐') : it.num ? it.num : '•'}
              </span>
              <span style={s('flex:1;min-width:0;' + (it.task && it.checked ? 'text-decoration:line-through;color:' + C.dim + ';' : ''))}>{renderInline(it.text)}</span>
            </div>
          ))}
        </div>
      );
      continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\s*([-*+]|\d+\.)\s|(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i])) { p.push(lines[i]); i++; }
    blocks.push(<p key={k++} style={s(para)}>{renderInline(p.join(' '))}</p>);
  }
  return <div>{blocks.length ? blocks : <p style={s(para + 'color:' + C.dim + ';')}>Nothing here yet — switch to Write to add content.</p>}</div>;
}

// Line-level diff (LCS) for the AI-format preview: ' ' unchanged, '-' removed,
// '+' added. Notes are small, so the quadratic table is fine.
function lineDiff(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: ' ', s: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: '-', s: A[i] }); i++; }
    else { out.push({ t: '+', s: B[j] }); j++; }
  }
  while (i < n) out.push({ t: '-', s: A[i++] });
  while (j < m) out.push({ t: '+', s: B[j++] });
  return out;
}

// NHS-style confirmation sheet — same pattern as the rota system so popups
// stay consistent across the app.
function Sheet({ maxWidth = 420, onClose, children }) {
  return (
    <div className="riva-modal-overlay" onClick={onClose}>
      <div className="riva-sheet" style={{ maxWidth: maxWidth + 'px' }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ConfirmSheet({ confirm, onClose }) {
  return (
    <Sheet onClose={onClose}>
      <div style={s('padding:26px 26px 8px;')}>
        <h2 style={s('font-size:21px;font-weight:700;margin:0 0 8px;color:' + C.ink + ';')}>{confirm.title}</h2>
        <p style={s('font-size:16px;line-height:1.5;margin:0;color:' + C.mut + ';')}>{confirm.message}</p>
      </div>
      <div style={s('display:flex;align-items:center;gap:10px;padding:20px 26px 24px;')}>
        <Hover tag="button" onClick={confirm.onConfirm}
          base="font-family:inherit;font-size:16px;font-weight:700;color:#fff;background:#d5281b;border:none;border-radius:8px;padding:11px 22px;cursor:pointer;box-shadow:0 4px 0 #7a160d;"
          active="transform:translateY(4px);box-shadow:none;">{confirm.confirmLabel || 'Delete'}</Hover>
        <Hover tag="button" onClick={onClose}
          base="font-family:inherit;font-size:16px;font-weight:600;color:#4c6272;background:transparent;border:none;border-radius:8px;padding:11px 16px;cursor:pointer;"
          hover="color:#212b32;">Cancel</Hover>
      </div>
    </Sheet>
  );
}

// One tree row; children render recursively inside .nb-kids, which draws the
// parent→child connector lines. Defined at module level (not inside the page
// component) so React keeps the same component identity across renders —
// defining it inline remounted the whole tree on every state change, which is
// what made the sidebar blink.
function SideRow({ n, depth, ctx }) {
  const { selectedId, ancestors, expanded, setExpanded, q, childrenOf, treeMatch, attachments, selectNote, newNote, openMenu } = ctx;
  const isSel = selectedId === n.id;
  const onPath = ancestors.some((a) => a.id === n.id);
  const kids = q ? childrenOf(n.id).filter(treeMatch) : childrenOf(n.id);
  const open = !!expanded[n.id] || (!!q && kids.length > 0);
  const fileCount = attachments.filter((a) => a.noteId === n.id).length;
  return (
    <div>
      <div className="nb-row" onContextMenu={(e) => openMenu(e, n.id)}
        style={s('display:flex;align-items:center;gap:2px;border-radius:9px;padding:0 4px;' +
        (isSel ? 'background:' + C.sel + ';' : onPath ? 'background:#f7fbff;' : ''))}>
        {kids.length > 0 ? (
          <Hover tag="button" onClick={() => setExpanded((e) => ({ ...e, [n.id]: !open }))} aria-label={open ? 'Collapse' : 'Expand'}
            base={actBtn + 'width:24px;height:24px;'} hover={'background:' + C.soft + ';'}>
            <Svg w={16} sw={2.4} style={s('transform:rotate(' + (open ? 90 : 0) + 'deg);transition:transform .15s;')}>{Icons.chevronRight}</Svg>
          </Hover>
        ) : (<span style={s('flex:none;width:24px;')} />)}
        <button onClick={() => selectNote(n.id)}
          style={s('flex:1;min-width:0;display:flex;align-items:center;gap:7px;text-align:left;border:none;background:none;font:inherit;font-size:14.5px;cursor:pointer;padding:8px 4px;color:' + (isSel ? C.navy : C.ink) + ';' + (isSel ? 'font-weight:600;' : ''))}>
          <Svg w={17} sw={2} style={s('flex:none;color:' + (isSel ? C.blue : C.mut) + ';')}>{depth === 0 || n.isSection ? Icons.book : Icons.fileLines}</Svg>
          <span style={s('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{n.title || 'Untitled'}</span>
          {fileCount > 0 && <Svg w={13} sw={2.2} style={s('flex:none;color:' + C.dim + ';')}>{Icons.paperclip}</Svg>}
        </button>
        <span className="nb-actions" style={s('flex:none;display:flex;align-items:center;gap:1px;')}>
          {depth < MAX_DEPTH - 1 && (
            <Hover tag="button" onClick={() => newNote(n.id)} aria-label="Add page" title="Add page"
              base={actBtn} hover={'background:' + C.sel + ';color:' + C.blue + ';'}>
              <Svg w={16} sw={2.2}>{Icons.plus}</Svg>
            </Hover>
          )}
        </span>
      </div>
      {open && kids.length > 0 && (
        <div className="nb-kids">
          {kids.map((k) => <SideRow key={k.id} n={k} depth={depth + 1} ctx={ctx} />)}
        </div>
      )}
    </div>
  );
}

export default function NotebookPage() {
  const [notes, setNotes] = React.useState([]);
  const [attachments, setAttachments] = React.useState([]);
  const [status, setStatus] = React.useState('loading'); // loading | ready | error
  const [selectedId, setSelectedId] = React.useState(null);
  // Which sections are open — persisted so the tree doesn't collapse on reload.
  const [expanded, setExpanded] = React.useState(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(window.localStorage.getItem('nb-expanded') || '{}') || {}; } catch (e) { return {}; }
  });
  React.useEffect(() => {
    try { window.localStorage.setItem('nb-expanded', JSON.stringify(expanded)); } catch (e) { /* ignore */ }
  }, [expanded]);
  const [search, setSearch] = React.useState('');
  const [saveState, setSaveState] = React.useState('');     // '' | 'saving' | 'saved' | 'unsaved'
  const [uploading, setUploading] = React.useState(false);
  const [uploadErr, setUploadErr] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const [confirm, setConfirm] = React.useState(null);       // { title, message, confirmLabel, onConfirm }
  const [menu, setMenu] = React.useState(null);              // { id, x, y } — sidebar right-click menu
  const [aiFmt, setAiFmt] = React.useState(null);            // null | {status:'loading'} | {status:'error',message} | {status:'ready',formatted,diff}
  const [activeBlock, setActiveBlock] = React.useState(null); // index of the block being edited (blocks.length = new block at end)
  const [draft, setDraft] = React.useState('');               // raw markdown of the active block
  const dragDepth = React.useRef(0);
  const saved = React.useRef(new Map());   // id -> { title, body } last persisted
  const dirty = React.useRef(new Set());   // ids edited since their last save
  const notesRef = React.useRef([]);
  const fileInput = React.useRef(null);
  const titleInput = React.useRef(null);
  const bodyRef = React.useRef(null);
  notesRef.current = notes;

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/notebook');
        if (!res.ok) throw new Error('bad status');
        const data = await res.json();
        const list = Array.isArray(data.notes) ? data.notes : [];
        for (const n of list) saved.current.set(n.id, { title: n.title || '', body: n.body || '' });
        setNotes(list);
        setAttachments(Array.isArray(data.attachments) ? data.attachments : []);
        setStatus('ready');
        // Open on the first page (sections are name-only), else the first section.
        if (list.length) {
          const first = list.find((n) => n.parentId && !n.isSection) || list[0];
          setSelectedId(first.id);
          if (first.parentId) setExpanded((e) => ({ ...e, [first.parentId]: true }));
        }
      } catch (e) {
        setStatus('error');
      }
    })();
  }, []);

  const byId = React.useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);
  const childrenOf = React.useCallback((id) => notes.filter((n) => n.parentId === id), [notes]);
  const selected = byId.get(selectedId) || null;
  const isSection = !!selected && (!selected.parentId || !!selected.isSection);
  const selectedFiles = attachments.filter((a) => a.noteId === selectedId);

  // Ancestor chain of the selection, root first (breadcrumb + auto-expand).
  const ancestors = React.useMemo(() => {
    const chain = [];
    for (let cur = selected && byId.get(selected.parentId); cur && chain.length < 12; cur = byId.get(cur.parentId)) {
      chain.unshift(cur);
    }
    return chain;
  }, [selected, byId]);

  // Descendants of a note (for delete bookkeeping).
  const descendantIds = React.useCallback((id) => {
    const out = new Set([id]);
    let frontier = [id];
    while (frontier.length) {
      const next = [];
      for (const n of notes) if (frontier.includes(n.parentId) && !out.has(n.id)) { out.add(n.id); next.push(n.id); }
      frontier = next;
    }
    return out;
  }, [notes]);

  // Search: a note matching by title/body keeps its whole ancestor chain visible.
  const q = search.trim().toLowerCase();
  const selfMatch = (n) => !q || (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q);
  const treeMatch = React.useCallback(function treeMatch(n) {
    return selfMatch(n) || childrenOf(n.id).some(treeMatch);
  }, [childrenOf, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const sections = notes.filter((n) => !n.parentId).filter(treeMatch);

  /* ------------------------------ Saving ------------------------------ *
   * Time-based, not per-keystroke: edits only mark the note dirty; a 1s
   * interval diffs each dirty note against its last persisted snapshot and
   * PATCHes only the fields that actually changed — no change, no request. */

  async function flush() {
    for (const id of Array.from(dirty.current)) {
      const n = notesRef.current.find((x) => x.id === id);
      if (!n) { dirty.current.delete(id); continue; } // deleted while dirty
      const prev = saved.current.get(id) || {};
      const patch = {};
      if ((n.title || '') !== (prev.title || '')) patch.title = n.title || '';
      if ((n.body || '') !== (prev.body || '')) patch.body = n.body || '';
      if (!Object.keys(patch).length) { dirty.current.delete(id); continue; }
      try {
        setSaveState('saving');
        const res = await fetch('/api/notebook', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, id }) });
        if (!res.ok) throw new Error('bad status');
        saved.current.set(id, { title: n.title || '', body: n.body || '' });
        dirty.current.delete(id);
        setSaveState('saved');
        setTimeout(() => setSaveState((s2) => (s2 === 'saved' ? '' : s2)), 1500);
      } catch (e) {
        setSaveState('unsaved');
      }
    }
  }

  // flush() reads only refs, so the interval's first-render closure stays valid.
  React.useEffect(() => {
    const iv = setInterval(flush, 1000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function editSelected(patch) {
    if (isSection && 'body' in patch) return; // sections are name-only
    setNotes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, ...patch } : n)));
    dirty.current.add(selectedId);
    setSaveState('saving');
  }

  /* ------------------------ Formatting toolbar ------------------------ *
   * Notes are markdown, so the toolbar inserts/toggles markdown around the
   * textarea selection. All writes go through execCommand('insertText') so
   * the browser's native undo/redo stack stays intact, and the input event
   * it fires runs the normal onChange → dirty → interval-save path.       */

  function applyWrap(before, after = before) {
    const ta = bodyRef.current; if (!ta) return; ta.focus();
    const { selectionStart: a, selectionEnd: b, value: v } = ta;
    const sel = v.slice(a, b) || 'text';
    const wrapped = v.slice(Math.max(0, a - before.length), a) === before && v.slice(b, b + after.length) === after;
    if (wrapped) { // toggle off
      ta.setSelectionRange(a - before.length, b + after.length);
      document.execCommand('insertText', false, sel);
      ta.setSelectionRange(a - before.length, a - before.length + sel.length);
    } else {
      document.execCommand('insertText', false, before + sel + after);
      ta.setSelectionRange(a + before.length, a + before.length + sel.length);
    }
  }

  // Rewrite the full lines covered by the selection.
  function applyLines(fn) {
    const ta = bodyRef.current; if (!ta) return; ta.focus();
    const { selectionStart: a, selectionEnd: b, value: v } = ta;
    const start = v.lastIndexOf('\n', a - 1) + 1;
    let end = v.indexOf('\n', b); if (end === -1) end = v.length;
    const block = v.slice(start, end);
    const out = fn(block.split('\n')).join('\n');
    if (out === block) return;
    ta.setSelectionRange(start, end);
    document.execCommand('insertText', false, out);
    ta.setSelectionRange(start, start + out.length);
  }

  const toggleHeading = (level) => applyLines((lines) => {
    const mark = '#'.repeat(level) + ' ';
    const all = lines.every((l) => l.startsWith(mark) || !l.trim());
    return lines.map((l) => (!l.trim() ? l : all ? l.slice(mark.length) : mark + l.replace(/^#{1,6}\s+/, '')));
  });

  const togglePrefix = (prefix, re) => applyLines((lines) => {
    const all = lines.every((l) => re.test(l) || !l.trim());
    return lines.map((l, i) => {
      if (!l.trim()) return l;
      if (all) return l.replace(re, '');
      const p = prefix === '1. ' ? (i + 1) + '. ' : prefix;
      return re.test(l) ? l : p + l;
    });
  });

  const bullets = () => togglePrefix('- ', /^\s*[-•]\s+(?!\[)/);
  const numbers = () => togglePrefix('1. ', /^\s*\d+\.\s+/);
  const tasks = () => togglePrefix('- [ ] ', /^\s*[-•]\s+\[[ xX]\]\s+/);
  const quote = () => togglePrefix('> ', /^>\s+/);
  const indent = () => applyLines((lines) => lines.map((l) => (l.trim() ? '  ' + l : l)));
  const outdent = () => applyLines((lines) => lines.map((l) => l.replace(/^ {1,2}/, '')));
  const divider = () => { const ta = bodyRef.current; if (!ta) return; ta.focus(); document.execCommand('insertText', false, '\n\n---\n\n'); };
  const doUndo = () => { const ta = bodyRef.current; if (!ta) return; ta.focus(); document.execCommand('undo'); };
  const doRedo = () => { const ta = bodyRef.current; if (!ta) return; ta.focus(); document.execCommand('redo'); };

  /* -------------------------- Smart blocks ---------------------------- *
   * The note renders as markdown; clicking a block swaps just that block
   * for a raw-markdown textarea. Leaving the block (blur/Escape) commits
   * it and it renders again — so **test** turns bold once you're done,
   * never mid-keystroke. Blocks are paragraphs separated by blank lines;
   * a blank line typed inside a block splits it on commit.               */

  const blocks = React.useMemo(
    () => ((selected && selected.body) ? selected.body.replace(/\r\n/g, '\n').split(/\n{2,}/) : []),
    [selected && selected.body] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function startBlock(i, text) {
    if (activeBlock !== null) return; // the blur of the open editor commits first; next click opens
    setDraft(text);
    setActiveBlock(i);
  }

  function commitBlock() {
    if (activeBlock === null) return;
    const next = blocks.slice();
    if (activeBlock >= next.length) { if (draft.trim()) next.push(draft); }
    else if (!draft.trim()) next.splice(activeBlock, 1);
    else next[activeBlock] = draft;
    const body = next.join('\n\n');
    setActiveBlock(null);
    if (body !== (selected.body || '')) editSelected({ body });
  }

  const autoGrow = (el) => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; } };

  // AI format: send the body off, then show the proposed change as a diff the
  // user must confirm — nothing is applied (or saved) until they accept.
  async function runAiFormat() {
    const original = (selected && selected.body) || '';
    if (!original.trim() || (aiFmt && aiFmt.status === 'loading')) return;
    setAiFmt({ status: 'loading' });
    try {
      const res = await fetch('/api/notebook/format', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: original }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Formatting failed.');
      const formatted = String(data.formatted || '');
      if (formatted.trim() === original.trim()) { setAiFmt({ status: 'error', message: 'Nothing to change — the note is already tidy.' }); return; }
      setAiFmt({ status: 'ready', formatted, diff: lineDiff(original, formatted) });
    } catch (e) {
      setAiFmt({ status: 'error', message: String(e.message || e) });
    }
  }

  function applyAiFormat() {
    if (!aiFmt || aiFmt.status !== 'ready') return;
    setNotes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, body: aiFmt.formatted } : n)));
    dirty.current.add(selectedId);
    setSaveState('saving');
    setAiFmt(null);
    setActiveBlock(null);
  }

  function editorKeys(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); applyWrap('**'); }
    else if (k === 'i') { e.preventDefault(); applyWrap('*'); }
  }

  /* --------------------------- Note actions --------------------------- */

  async function selectNote(id) {
    await flush();
    setUploadErr('');
    setAiFmt(null);
    setActiveBlock(null);
    setSelectedId(id);
    // Open the path to the selection so it is always visible in the tree.
    setExpanded((e) => {
      const next = { ...e };
      for (let cur = byId.get(id); cur && cur.parentId; cur = byId.get(cur.parentId)) next[cur.parentId] = true;
      return next;
    });
  }

  async function createNoteApi(title, parentId) {
    const res = await fetch('/api/notebook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, parentId: parentId || null }),
    });
    if (!res.ok) throw new Error('bad status');
    const { note } = await res.json();
    saved.current.set(note.id, { title: note.title || '', body: note.body || '' });
    return note;
  }

  // New page under a parent — or, with no parent, a new section. A section is
  // a name-only container, so it is always created together with its first
  // page, and the page (the writing surface) is what opens.
  async function newNote(parentId) {
    await flush();
    try {
      if (parentId) {
        const note = await createNoteApi('New page', parentId);
        setNotes((ns) => ns.concat([note]));
        setExpanded((e) => ({ ...e, [parentId]: true }));
        setSelectedId(note.id);
      } else {
        const section = await createNoteApi('New section', null);
        const page = await createNoteApi('New page', section.id);
        setNotes((ns) => ns.concat([section, page]));
        setExpanded((e) => ({ ...e, [section.id]: true }));
        setSelectedId(page.id);
      }
    } catch (e) { /* ignore */ }
  }

  function askRemoveNote(id) {
    const n = byId.get(id);
    const kids = descendantIds(id).size - 1;
    const sec = n && !n.parentId;
    setConfirm({
      title: sec ? 'Delete section' : 'Delete page',
      message: 'Delete "' + (n ? n.title || 'Untitled' : 'this note') + '"' + (kids ? ' and the ' + kids + ' page(s) inside it' : '') + '? Attached files are deleted too. This cannot be undone.',
      confirmLabel: sec ? 'Delete section' : 'Delete page',
      onConfirm: () => { setConfirm(null); removeNote(id); },
    });
  }

  async function removeNote(id) {
    const n = byId.get(id);
    const gone = descendantIds(id);
    try {
      await fetch('/api/notebook?id=' + id, { method: 'DELETE' });
      setNotes((ns) => ns.filter((x) => !gone.has(x.id)));
      setAttachments((as) => as.filter((a) => !gone.has(a.noteId)));
      if (gone.has(selectedId)) {
        // Prefer staying near the deleted note: its parent, else the first section.
        const parent = n && n.parentId && !gone.has(n.parentId) ? n.parentId : null;
        if (parent) setSelectedId(parent);
        else {
          const remaining = notes.filter((x) => !gone.has(x.id) && !x.parentId);
          setSelectedId(remaining.length ? remaining[0].id : null);
        }
      }
    } catch (e) { /* ignore */ }
  }

  /* --------------------------- Attachments ---------------------------- */

  async function uploadFiles(files) {
    if (!selectedId || isSection || !files || !files.length) return;
    setUploading(true);
    setUploadErr('');
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('noteId', String(selectedId));
      form.append('file', file);
      try {
        const res = await fetch('/api/notebook/attachments', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Upload failed.');
        setAttachments((as) => as.concat([data.attachment]));
      } catch (e) {
        setUploadErr(String(e.message || e));
      }
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  function askRemoveAttachment(a) {
    setConfirm({
      title: 'Remove file',
      message: 'Remove "' + a.filename + '" from this page? This cannot be undone.',
      confirmLabel: 'Remove file',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await fetch('/api/notebook/attachments?id=' + a.id, { method: 'DELETE' });
          setAttachments((as) => as.filter((x) => x.id !== a.id));
        } catch (e) { /* ignore */ }
      },
    });
  }

  // Drag-and-drop anywhere on the editor uploads to the open page.
  const dropHandlers = selected && !isSection ? {
    onDragEnter: (e) => { e.preventDefault(); if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { dragDepth.current++; setDragging(true); } },
    onDragOver: (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); },
    onDrop: (e) => { e.preventDefault(); dragDepth.current = 0; setDragging(false); uploadFiles(e.dataTransfer.files); },
  } : {};

  // Rename = select the note, then put the caret in the header title input.
  async function renameNote(id) {
    await selectNote(id);
    setTimeout(() => { if (titleInput.current) { titleInput.current.focus(); titleInput.current.select(); } }, 0);
  }

  // Promote a note to a section (name-only container for sub-notes) or back.
  async function toggleSection(id, val) {
    try {
      const res = await fetch('/api/notebook', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isSection: val }),
      });
      if (!res.ok) throw new Error('bad status');
      const { note } = await res.json();
      setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, isSection: !!note.isSection } : n)));
      if (val) setExpanded((e) => ({ ...e, [id]: true }));
    } catch (e) { /* ignore */ }
  }

  /* --------------------------- Backup ---------------------------------- */

  const importInput = React.useRef(null);

  async function reloadAll() {
    try {
      const res = await fetch('/api/notebook');
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      const list = Array.isArray(data.notes) ? data.notes : [];
      for (const n of list) if (!saved.current.has(n.id)) saved.current.set(n.id, { title: n.title || '', body: n.body || '' });
      setNotes(list);
      setAttachments(Array.isArray(data.attachments) ? data.attachments : []);
    } catch (e) { /* ignore */ }
  }

  function onImportFile(e) {
    const file = e.target.files && e.target.files[0];
    if (importInput.current) importInput.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(String(reader.result)); } catch (err) { data = null; }
      const count = data && Array.isArray(data.notes) ? data.notes.length : 0;
      if (!count) {
        setConfirm({ title: 'Import failed', message: 'That file is not a notebook backup (no notes found).', confirmLabel: 'OK', onConfirm: () => setConfirm(null) });
        return;
      }
      setConfirm({
        title: 'Import backup',
        message: 'Import ' + count + ' note(s) from "' + file.name + '"? They are added alongside your existing notes — nothing is overwritten.',
        confirmLabel: 'Import',
        onConfirm: async () => {
          setConfirm(null);
          try {
            const res = await fetch('/api/notebook/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
            const out = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(out.error || 'Import failed.');
            await reloadAll();
          } catch (err) {
            setConfirm({ title: 'Import failed', message: String(err.message || err), confirmLabel: 'OK', onConfirm: () => setConfirm(null) });
          }
        },
      });
    };
    reader.readAsText(file);
  }

  /* -------------------- Sidebar right-click menu ---------------------- */

  function openMenu(e, id) {
    e.preventDefault();
    e.stopPropagation(); // keep the window-level close handler from eating the new menu
    setMenu({ id, x: Math.min(e.clientX, window.innerWidth - 180), y: Math.min(e.clientY, window.innerHeight - 110) });
  }

  React.useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [menu]);

  const rowCtx = { selectedId, ancestors, expanded, setExpanded, q, childrenOf, treeMatch, attachments, selectNote, newNote, openMenu };
  const sectionPages = isSection ? childrenOf(selected.id) : [];

  /* ------------------------------ Render ------------------------------- */

  return (
    <div style={s('display:flex;flex-direction:column;height:100vh;min-height:100vh;background:' + C.bg + ';')}>
      {/* dangerouslySetInnerHTML: a plain {CSS} text child gets HTML-escaped
          on the server (> and ") but not on the client — hydration mismatch. */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <AppHeader subtitle="Notebook" />
      <div style={s('flex:1;min-height:0;display:flex;width:100%;')}>

      {/* --------------------------- Sidebar --------------------------- */}
      <aside style={s('flex:none;width:290px;border-right:1px solid ' + C.line + ';background:#fff;display:flex;flex-direction:column;min-height:0;')}>
        <div style={s('flex:none;padding:12px 14px 6px;display:flex;flex-direction:column;gap:10px;')}>
          <div style={s('display:flex;align-items:center;gap:8px;')}>
            <span style={s('flex:1;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + C.mut + ';')}>Sections</span>
            <Hover tag="button" onClick={() => newNote(null)} aria-label="New section" title="New section (with its first page)"
              base={'flex:none;display:inline-flex;align-items:center;gap:6px;background:' + C.blue + ';color:#fff;border:none;border-radius:8px;padding:7px 13px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;'}
              hover={'background:' + C.navy + ';'}>
              <Svg w={14} sw={2.4}>{Icons.plus}</Svg>New
            </Hover>
          </div>
          <div style={s('display:flex;align-items:center;gap:8px;border:1px solid ' + C.line + ';border-radius:9px;padding:7px 10px;background:' + C.bg + ';')}>
            <Svg w={16} sw={2} style={s('flex:none;color:' + C.mut + ';')}>{Icons.search}</Svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes"
              style={s('flex:1;min-width:0;border:none;outline:none;background:none;font:inherit;font-size:14px;color:' + C.ink + ';')} />
            {search && (
              <Hover tag="button" onClick={() => setSearch('')} aria-label="Clear search" base={actBtn + 'width:18px;height:18px;'} hover={'color:' + C.ink + ';'}>
                <Svg w={12} sw={2.4}>{Icons.close}</Svg>
              </Hover>
            )}
          </div>
        </div>

        <div className="nb-scroll" style={s('flex:1;overflow-y:auto;padding:4px 10px 14px;display:flex;flex-direction:column;gap:1px;')}>
          {status === 'loading' && <p style={s('color:' + C.mut + ';font-size:14px;padding:8px 10px;')}>Loading…</p>}
          {status === 'error' && <p style={s('color:' + C.red + ';font-size:14px;padding:8px 10px;')}>Could not load notes. Is the database configured?</p>}
          {status === 'ready' && sections.length === 0 && (
            <p style={s('color:' + C.dim + ';font-size:14px;padding:8px 10px;line-height:1.5;')}>
              {q ? 'No notes match your search.' : 'No sections yet. Create one — e.g. “Instructions” with pages like “How to book appointments”.'}
            </p>
          )}
          {sections.map((n) => <SideRow key={n.id} n={n} depth={0} ctx={rowCtx} />)}
        </div>

        <div style={s('flex:none;border-top:1px solid ' + C.soft + ';padding:10px 14px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:' + C.dim + ';line-height:1.45;')}>
          <span style={s('display:inline-flex;align-items:center;gap:6px;')}>
            <Svg w={13} sw={2.2} stroke={C.green}>{Icons.shield}</Svg>Notes are used by the assistant automatically.
          </span>
          {/* Backup: export downloads every note as JSON; import restores it. */}
          <div style={s('display:flex;align-items:center;gap:6px;')}>
            <input ref={importInput} type="file" accept=".json,application/json" style={s('display:none;')} onChange={onImportFile} />
            <Hover tag="button" onClick={() => { window.location.href = '/api/notebook/export'; }} title="Download all notes as a JSON backup"
              base={'flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid ' + C.line + ';background:#fff;border-radius:7px;font:inherit;font-size:12.5px;font-weight:600;color:' + C.mut + ';cursor:pointer;padding:6px 10px;'}
              hover={'border-color:' + C.blue + ';color:' + C.blue + ';'}>
              <Svg w={13} sw={2.2}>{Icons.external}</Svg>Export
            </Hover>
            <Hover tag="button" onClick={() => importInput.current && importInput.current.click()} title="Restore notes from a JSON backup (added alongside existing notes)"
              base={'flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid ' + C.line + ';background:#fff;border-radius:7px;font:inherit;font-size:12.5px;font-weight:600;color:' + C.mut + ';cursor:pointer;padding:6px 10px;'}
              hover={'border-color:' + C.blue + ';color:' + C.blue + ';'}>
              <Svg w={13} sw={2.2}>{Icons.refresh}</Svg>Import
            </Hover>
          </div>
        </div>
      </aside>

      {/* ------------------------- Notes area --------------------------- */}
      <main style={s('flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;position:relative;')} {...dropHandlers}>
        {/* Notes header — breadcrumb, save state and actions for the open note. */}
        <div style={s('flex:none;display:flex;align-items:center;gap:10px;background:#fff;border-bottom:1px solid ' + C.line + ';padding:10px 22px;min-height:56px;')}>
          <div style={s('flex:1;min-width:0;display:flex;align-items:center;gap:7px;font-size:14px;color:' + C.mut + ';overflow:hidden;white-space:nowrap;')}>
            {!selected && <span>Notebook</span>}
            {selected && (
              <>
                {ancestors.map((a) => (
                  <React.Fragment key={a.id}>
                    <button className="nb-crumb" onClick={() => selectNote(a.id)}>
                      {a.title || 'Untitled'}
                    </button>
                    <Svg w={12} sw={2.2} style={s('flex:none;color:' + C.dim + ';')}>{Icons.chevronRight}</Svg>
                  </React.Fragment>
                ))}
                <input
                  ref={titleInput}
                  className="nb-title"
                  value={selected.title || ''}
                  onChange={(e) => editSelected({ title: e.target.value })}
                  placeholder={isSection ? 'Section name' : 'Page title'}
                  aria-label={isSection ? 'Section name' : 'Page title'}
                  title="Click to rename"
                  style={s('flex:1;min-width:60px;font:inherit;font-size:15.5px;font-weight:600;border:none;outline:none;background:none;color:' + C.ink + ';padding:4px 0;')}
                />
              </>
            )}
          </div>
          <span style={s('flex:none;font-size:13px;min-width:64px;text-align:right;color:' + (saveState === 'unsaved' ? C.red : C.dim) + ';')}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'unsaved' ? 'Not saved' : ''}
          </span>
          {selected && !isSection && (
            <>
              <input ref={fileInput} type="file" multiple style={s('display:none;')} onChange={(e) => uploadFiles(e.target.files)} />
              <Hover tag="button" onClick={() => fileInput.current && fileInput.current.click()} disabled={uploading} aria-label="Attach files" title="Attach files (or drag and drop onto the page)"
                base={'flex:none;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid ' + C.line + ';background:#fff;border-radius:9px;cursor:pointer;color:' + C.mut + ';' + (uploading ? 'opacity:.6;' : '')}
                hover={'border-color:' + C.blue + ';color:' + C.blue + ';'}>
                <Svg w={16} sw={2}>{Icons.paperclip}</Svg>
              </Hover>
            </>
          )}
          {selected && (
            <Hover tag="button" onClick={() => askRemoveNote(selected.id)} aria-label={isSection ? 'Delete section' : 'Delete page'} title={isSection ? 'Delete section' : 'Delete page'}
              base={'flex:none;width:36px;height:36px;display:flex;align-items:center;justify-content:center;border:1px solid ' + C.line + ';background:#fff;border-radius:9px;cursor:pointer;color:' + C.mut + ';'}
              hover={'border-color:' + C.red + ';color:' + C.red + ';'}>
              <Svg w={16} sw={2}>{Icons.trash}</Svg>
            </Hover>
          )}
        </div>

        {!selected && (
          <div style={s('flex:1;display:flex;align-items:center;justify-content:center;color:' + C.dim + ';font-size:16px;text-align:center;padding:24px;')}>
            <div>
              <div style={s('margin-bottom:8px;')}><Svg w={30} stroke="#a3b1ba" sw={1.8}>{Icons.book}</Svg></div>
              Select a note, or create one to get started.
            </div>
          </div>
        )}

        {/* Section view — name only; content lives in the pages beneath it. */}
        {selected && isSection && (
          <div className="nb-scroll" style={s('flex:1;min-height:0;overflow-y:auto;width:100%;max-width:1000px;margin:0 auto;padding:26px 28px;')}>
            <p style={s('margin:0 0 20px;font-size:14.5px;color:' + C.dim + ';line-height:1.5;')}>
              Sections only have a name — they organise pages, and the assistant uses this grouping to navigate the notebook. Write content in a page below.
            </p>
            <div style={s('display:flex;flex-direction:column;gap:8px;')}>
              {sectionPages.map((p) => (
                <Hover key={p.id} tag="button" onClick={() => selectNote(p.id)}
                  base={'display:flex;align-items:center;gap:10px;text-align:left;border:1px solid ' + C.line + ';border-radius:11px;background:#fff;padding:13px 16px;font:inherit;font-size:15px;font-weight:600;color:' + C.ink + ';cursor:pointer;'}
                  hover={'border-color:' + C.blue + ';background:#f7fbff;'}>
                  <Svg w={17} sw={2} style={s('flex:none;color:' + C.blue + ';')}>{Icons.fileLines}</Svg>
                  <span style={s('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{p.title || 'Untitled'}</span>
                  {(p.body || '').trim() ? null : <span style={s('flex:none;font-size:12.5px;font-weight:500;color:' + C.dim + ';')}>Empty</span>}
                </Hover>
              ))}
              <Hover tag="button" onClick={() => newNote(selected.id)}
                base={'display:flex;align-items:center;justify-content:center;gap:8px;border:1.5px dashed ' + C.line + ';border-radius:11px;background:none;padding:13px 16px;font:inherit;font-size:14.5px;font-weight:600;color:' + C.mut + ';cursor:pointer;'}
                hover={'border-color:' + C.blue + ';color:' + C.blue + ';'}>
                <Svg w={15} sw={2.4}>{Icons.plus}</Svg>New page
              </Hover>
            </div>
          </div>
        )}

        {/* Page view — the title lives in the header; the whole content area
            is the note body, with attachments docked below. */}
        {selected && !isSection && (
          <div style={s('flex:1;min-height:0;display:flex;flex-direction:column;width:100%;background:#fff;')}>
            {/* Formatting toolbar — OneNote-style, but for markdown. */}
            <div style={s('flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:2px;background:#fff;border-bottom:1px solid ' + C.soft + ';padding:5px 20px;')}
              onMouseDown={(e) => e.preventDefault() /* keep the textarea selection */}>
              {[
                { title: 'Undo (Ctrl+Z)', run: doUndo, icon: Icons.undo },
                { title: 'Redo (Ctrl+Y)', run: doRedo, icon: Icons.redo },
                null,
                { title: 'Heading 1', run: () => toggleHeading(1), icon: TIcons.h1 },
                { title: 'Heading 2', run: () => toggleHeading(2), icon: TIcons.h2 },
                { title: 'Heading 3', run: () => toggleHeading(3), icon: TIcons.h3 },
                null,
                { title: 'Bold (Ctrl+B)', run: () => applyWrap('**'), icon: TIcons.bold },
                { title: 'Italic (Ctrl+I)', run: () => applyWrap('*'), icon: TIcons.italic },
                { title: 'Strikethrough', run: () => applyWrap('~~'), icon: TIcons.strike },
                { title: 'Inline code', run: () => applyWrap('`'), icon: TIcons.code },
                null,
                { title: 'Bulleted list', run: bullets, icon: TIcons.list },
                { title: 'Numbered list', run: numbers, icon: TIcons.listOrdered },
                { title: 'Task list', run: tasks, icon: TIcons.listChecks },
                null,
                { title: 'Decrease indent', run: outdent, icon: TIcons.outdent },
                { title: 'Increase indent', run: indent, icon: TIcons.indent },
                { title: 'Quote', run: quote, icon: TIcons.quote },
                { title: 'Divider', run: divider, icon: TIcons.divider },
                null,
                { title: 'Underline', run: () => applyWrap('<u>', '</u>'), icon: TIcons.underline },
                { title: 'Highlight', run: () => applyWrap('<mark>', '</mark>'), icon: TIcons.highlighter },
                ...TEXT_COLORS.map((c2) => ({ title: c2.name + ' text', run: () => applyWrap('<span style="color:' + c2.hex + '">', '</span>'), swatch: c2.hex })),
                { title: 'Insert table', run: () => { const ta = bodyRef.current; if (!ta) return; ta.focus(); document.execCommand('insertText', false, TABLE_SNIPPET); }, icon: TIcons.table },
                null,
                { title: 'AI format — tidy this note (you confirm the changes first)', run: runAiFormat, icon: Icons.sparkle, accent: true },
              ].map((btn, i) => btn === null
                ? <span key={'sep' + i} style={s('flex:none;width:1px;height:18px;background:' + C.line + ';margin:0 7px;')} />
                : (
                  <Hover key={btn.title} tag="button" onClick={btn.run} aria-label={btn.title} title={btn.title}
                    base={'flex:none;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:none;background:none;border-radius:7px;cursor:pointer;color:' + (btn.accent ? C.blue : C.mut) + ';' + (btn.accent && aiFmt && aiFmt.status === 'loading' ? 'opacity:.5;' : '')}
                    hover={'background:' + C.sel + ';color:' + C.blue + ';'}>
                    {btn.swatch
                      ? <span style={s('width:14px;height:14px;border-radius:99px;background:' + btn.swatch + ';border:1.5px solid #fff;box-shadow:0 0 0 1px ' + C.line + ';')} />
                      : <Svg w={16} sw={2}>{btn.icon}</Svg>}
                  </Hover>
                ))}
            </div>

            {/* AI-format status bar — the diff below replaces the editor until
                the user applies or cancels. */}
            {aiFmt && (
              <div style={s('flex:none;display:flex;align-items:center;gap:10px;background:' + C.sel + ';border-bottom:1px solid ' + C.line + ';padding:9px 20px;')}>
                <Svg w={16} sw={2} stroke={C.blue}>{Icons.sparkle}</Svg>
                <span style={s('flex:1;min-width:0;font-size:14.5px;color:' + C.navy + ';')}>
                  {aiFmt.status === 'loading' && 'Tidying the note — checking spelling and structure…'}
                  {aiFmt.status === 'error' && aiFmt.message}
                  {aiFmt.status === 'ready' && 'Review the proposed changes below. Wording stays as written — only typos, punctuation and layout change. Nothing is saved until you apply.'}
                </span>
                {aiFmt.status === 'ready' && (
                  <Hover tag="button" onClick={applyAiFormat}
                    base={'flex:none;font:inherit;font-size:13.5px;font-weight:700;color:#fff;background:' + C.green + ';border:none;border-radius:7px;padding:7px 15px;cursor:pointer;'}
                    hover="background:#00542b;">Apply changes</Hover>
                )}
                {aiFmt.status !== 'loading' && (
                  <Hover tag="button" onClick={() => setAiFmt(null)}
                    base={'flex:none;font:inherit;font-size:13.5px;font-weight:600;color:' + C.mut + ';background:none;border:none;border-radius:7px;padding:7px 10px;cursor:pointer;'}
                    hover={'color:' + C.ink + ';'}>{aiFmt.status === 'ready' ? 'Cancel' : 'Dismiss'}</Hover>
                )}
              </div>
            )}

            {/* Body — the entire content area is the writing surface (or the
                rendered markdown in Preview, or the AI diff while reviewing);
                attachments dock below and never push it down. */}
            {aiFmt && aiFmt.status === 'ready' ? (
              <div className="nb-scroll" style={s('flex:1;min-height:0;overflow:auto;background:#fafcfd;font-family:Consolas,Menlo,monospace;font-size:13.5px;line-height:1.6;padding:14px 0;')}>
                {aiFmt.diff.map((l, i) => (
                  <div key={i} style={s('display:flex;gap:10px;padding:1px 20px;white-space:pre-wrap;word-break:break-word;' +
                    (l.t === '-' ? 'background:#fbe9e7;color:#8a1206;text-decoration:line-through;' :
                     l.t === '+' ? 'background:#e7f5ec;color:#00542b;' : 'color:' + C.mut + ';'))}>
                    <span style={s('flex:none;width:12px;user-select:none;opacity:.7;')}>{l.t === ' ' ? '' : l.t}</span>
                    <span style={s('flex:1;min-width:0;')}>{l.s || ' '}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="nb-scroll" style={s('flex:1;min-height:0;overflow-y:auto;background:#fff;padding:20px 28px;cursor:text;')}
                onMouseDown={(e) => { if (e.target === e.currentTarget && activeBlock === null) startBlock(blocks.length, ''); }}>
                {blocks.map((b, i) => (
                  activeBlock === i ? (
                    <textarea
                      key={'edit' + i}
                      ref={(el) => { bodyRef.current = el; if (el && !el.dataset.init) { el.dataset.init = '1'; autoGrow(el); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }}
                      value={draft}
                      onChange={(e) => { setDraft(e.target.value); autoGrow(e.target); }}
                      onBlur={commitBlock}
                      onKeyDown={(e) => { editorKeys(e); if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); } }}
                      style={s('display:block;width:100%;resize:none;overflow:hidden;font:inherit;font-size:16px;line-height:1.65;border:none;outline:none;color:' + C.ink + ';background:none;padding:2px 0;margin:0 0 12px;')}
                    />
                  ) : (
                    <div key={'blk' + i} className="nb-block" onClick={() => startBlock(i, b)} title="Click to edit">
                      <MdView text={b} />
                    </div>
                  )
                ))}
                {activeBlock === blocks.length && (
                  <textarea
                    key="edit-new"
                    ref={(el) => { bodyRef.current = el; if (el && !el.dataset.init) { el.dataset.init = '1'; autoGrow(el); el.focus(); } }}
                    value={draft}
                    onChange={(e) => { setDraft(e.target.value); autoGrow(e.target); }}
                    onBlur={commitBlock}
                    onKeyDown={(e) => { editorKeys(e); if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); } }}
                    placeholder="Write markdown — it renders when you click away. Use the toolbar for headings, lists, tables, highlights and colours."
                    style={s('display:block;width:100%;resize:none;overflow:hidden;font:inherit;font-size:16px;line-height:1.65;border:none;outline:none;color:' + C.ink + ';background:none;padding:2px 0;margin:0 0 12px;min-height:56px;')}
                  />
                )}
                {blocks.length === 0 && activeBlock === null && (
                  <p style={s('margin:4px 0;font-size:16px;color:' + C.dim + ';')}>
                    Click anywhere to start writing. Markdown renders as you go — finish a block and it turns into headings, lists, tables… Anything you write is used by the assistant to answer and triage.
                  </p>
                )}
                {/* Click-to-continue area below the last block. */}
                {activeBlock === null && blocks.length > 0 && <div style={s('min-height:120px;')} />}
              </div>
            )}

            {/* Attachments — docked at the bottom of the page. */}
            {(selectedFiles.length > 0 || uploadErr || uploading) && (
              <div style={s('flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 28px 14px;border-top:1px solid ' + C.soft + ';')}>
                {selectedFiles.map((a) => (
                  <span key={a.id} style={s('display:inline-flex;align-items:center;gap:7px;border:1px solid ' + C.line + ';border-radius:99px;background:#fff;padding:5px 6px 5px 11px;max-width:280px;')}>
                    <Svg w={14} sw={2} style={s('flex:none;color:' + C.blue + ';')}>{(a.contentType || '').startsWith('image/') ? Icons.image : Icons.file}</Svg>
                    <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.filename + (a.size ? ' · ' + fmtSize(a.size) : '')}
                      style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:600;color:' + C.ink + ';text-decoration:none;')}>
                      {a.filename}
                    </a>
                    <Hover tag="button" onClick={() => askRemoveAttachment(a)} aria-label={'Remove ' + a.filename} title="Remove"
                      base={'flex:none;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border:none;background:' + C.soft + ';border-radius:99px;cursor:pointer;color:' + C.mut + ';'}
                      hover={'background:#fbe9e7;color:' + C.red + ';'}>
                      <Svg w={12} sw={2.6}>{Icons.close}</Svg>
                    </Hover>
                  </span>
                ))}
                {uploading && <span style={s('font-size:13px;color:' + C.dim + ';')}>Uploading…</span>}
                {uploadErr && <span style={s('font-size:13px;color:' + C.red + ';')}>{uploadErr}</span>}
              </div>
            )}
          </div>
        )}

        {/* Drop overlay */}
        {dragging && selected && !isSection && (
          <div style={s('position:absolute;inset:10px;border:2.5px dashed ' + C.blue + ';border-radius:14px;background:rgba(232,241,248,.85);display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:5;')}>
            <div style={s('display:flex;align-items:center;gap:10px;font-size:17px;font-weight:600;color:' + C.navy + ';')}>
              <Svg w={22} sw={2.2}>{Icons.paperclip}</Svg>
              Drop files to attach to “{selected.title || 'Untitled'}”
            </div>
          </div>
        )}
      </main>
      </div>

      {/* Sidebar right-click menu — rename / delete. */}
      {menu && (
        <div style={s('position:fixed;left:' + menu.x + 'px;top:' + menu.y + 'px;z-index:90;min-width:168px;background:#fff;border:1px solid ' + C.line + ';border-radius:10px;box-shadow:0 8px 24px rgba(33,43,50,.18);padding:5px;display:flex;flex-direction:column;')}
          onClick={(e) => e.stopPropagation()}>
          <Hover tag="button" onClick={() => { setMenu(null); renameNote(menu.id); }}
            base={'display:flex;align-items:center;gap:9px;border:none;background:none;border-radius:7px;font:inherit;font-size:14.5px;color:' + C.ink + ';cursor:pointer;padding:9px 11px;text-align:left;'}
            hover={'background:' + C.sel + ';color:' + C.blue + ';'}>
            <Svg w={15} sw={2.2}>{Icons.edit}</Svg>Rename
          </Hover>
          {(() => { const n = byId.get(menu.id); return n && n.parentId ? (
            <Hover tag="button" onClick={() => { setMenu(null); toggleSection(menu.id, !n.isSection); }}
              base={'display:flex;align-items:center;gap:9px;border:none;background:none;border-radius:7px;font:inherit;font-size:14.5px;color:' + C.ink + ';cursor:pointer;padding:9px 11px;text-align:left;'}
              hover={'background:' + C.sel + ';color:' + C.blue + ';'}>
              <Svg w={15} sw={2.2}>{n.isSection ? Icons.fileLines : Icons.book}</Svg>{n.isSection ? 'Convert to page' : 'Convert to section'}
            </Hover>
          ) : null; })()}
          <Hover tag="button" onClick={() => { setMenu(null); askRemoveNote(menu.id); }}
            base={'display:flex;align-items:center;gap:9px;border:none;background:none;border-radius:7px;font:inherit;font-size:14.5px;color:' + C.red + ';cursor:pointer;padding:9px 11px;text-align:left;'}
            hover={'background:#fbe9e7;'}>
            <Svg w={15} sw={2.2}>{Icons.trash}</Svg>Delete
          </Hover>
        </div>
      )}

      {confirm && <ConfirmSheet confirm={confirm} onClose={() => setConfirm(null)} />}
    </div>
  );
}
