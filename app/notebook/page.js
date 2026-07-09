'use client';

import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Link from '@tiptap/extension-link';
import TipTapImage from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { Mark, mergeAttributes } from '@tiptap/core';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * Notebook — practice notes the assistant uses automatically.
 *
 * Sidebar on the far left holds the section tree; the entire right
 * side is the notes area with its own header bar (breadcrumb, save
 * state, attach/delete). Sections are name-only containers: content
 * lives in pages beneath them, so creating a section also creates its
 * first page and opens that page for writing. Pages can be dragged
 * onto another section in the sidebar to move them. Files upload by
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
.nb-row.nb-dragging{opacity:.45;}
.nb-row.nb-drop-ok{background:${C.sel} !important;box-shadow:inset 0 0 0 2px ${C.blue};}
.nb-crumb{border:none;background:none;font:inherit;font-size:15.5px;font-weight:600;color:${C.ink};cursor:pointer;padding:4px 0;border-bottom:1.5px dashed transparent;}
.nb-crumb:hover{color:${C.blue};}
.nb-scroll{scrollbar-width:none;-ms-overflow-style:none;}
.nb-scroll::-webkit-scrollbar{display:none;}
.nb-title{border-bottom:1.5px dashed transparent;transition:border-color .12s;}
.nb-title:hover{border-bottom-color:${C.blue};}
.nb-title:focus{border-bottom:1.5px solid ${C.blue};}
/* Notion-style writing surface (TipTap). Same visual language the old
   markdown preview used, applied to the always-rendered editor. */
.nb-prose{flex:1;outline:none;padding:22px 28px 140px;font-size:16px;line-height:1.65;color:${C.ink};caret-color:${C.blue};}
/* The global NHS focus style (yellow bg on [tabindex]:focus-visible) is for
   buttons/controls — the editor is a writing surface, keep it white. */
.nb-prose:focus-visible{background:#fff !important;color:${C.ink} !important;box-shadow:none !important;}
.nb-prose>:first-child{margin-top:0;}
.nb-prose p{margin:0 0 10px;}
.nb-prose h1,.nb-prose h2,.nb-prose h3,.nb-prose h4{margin:22px 0 10px;font-weight:700;letter-spacing:-0.01em;color:${C.ink};}
.nb-prose h1{font-size:26px;padding-bottom:6px;border-bottom:1px solid ${C.soft};}
.nb-prose h2{font-size:22px;padding-bottom:6px;border-bottom:1px solid ${C.soft};}
.nb-prose h3{font-size:18.5px;}
.nb-prose h4{font-size:16.5px;}
.nb-prose ul,.nb-prose ol{margin:0 0 12px;padding-left:24px;}
.nb-prose ul ul,.nb-prose ol ol,.nb-prose ul ol,.nb-prose ol ul{margin-bottom:0;}
.nb-prose li{margin:3px 0;}
.nb-prose li>p{margin:0;}
.nb-prose ul>li::marker{color:${C.blue};}
.nb-prose ol>li::marker{color:${C.blue};font-weight:600;font-variant-numeric:tabular-nums;}
.nb-prose ul[data-type="taskList"]{list-style:none;padding-left:2px;}
.nb-prose ul[data-type="taskList"] li{display:flex;gap:9px;align-items:flex-start;}
.nb-prose ul[data-type="taskList"] li>label{flex:none;margin-top:4.5px;}
.nb-prose ul[data-type="taskList"] li>label input{width:15px;height:15px;accent-color:${C.blue};cursor:pointer;margin:0;}
.nb-prose ul[data-type="taskList"] li>div{flex:1;min-width:0;}
.nb-prose li[data-checked="true"]>div{text-decoration:line-through;color:${C.dim};}
.nb-prose blockquote{margin:0 0 12px;border-left:4px solid ${C.blue};background:${C.sel};padding:10px 14px;border-radius:0 8px 8px 0;font-size:15.5px;}
.nb-prose blockquote p{margin:0;}
.nb-prose code{font-family:Consolas,Menlo,monospace;font-size:.9em;background:${C.soft};border-radius:4px;padding:1px 5px;}
.nb-prose pre{margin:0 0 12px;background:${C.soft};border-radius:8px;padding:12px 14px;overflow-x:auto;}
.nb-prose pre code{background:none;padding:0;}
.nb-prose mark{background:#fff6cc;border-radius:3px;padding:0 2px;}
.nb-prose kbd{font-family:Consolas,Menlo,monospace;font-size:.85em;background:${C.soft};border:1px solid ${C.line};border-bottom-width:2px;border-radius:5px;padding:1px 6px;}
.nb-prose img{max-width:100%;height:auto;display:block;margin:6px 0 14px;border-radius:9px;border:1px solid ${C.soft};}
.nb-prose img.ProseMirror-selectednode{outline:2.5px solid ${C.blue};outline-offset:1px;}
.nb-prose hr{border:none;border-top:1px solid ${C.line};margin:18px 0;}
.nb-prose hr.ProseMirror-selectednode{border-top:2px solid ${C.blue};}
.nb-prose a{color:${C.blue};}
.nb-prose s{color:${C.dim};}
.nb-prose .tableWrapper{margin:0 0 14px;overflow-x:auto;}
.nb-prose table{border-collapse:collapse;min-width:50%;}
.nb-prose th,.nb-prose td{border:1px solid ${C.line};padding:8px 12px;font-size:15px;line-height:1.5;text-align:left;vertical-align:top;position:relative;min-width:48px;}
.nb-prose th{background:${C.soft};font-weight:700;}
.nb-prose th p,.nb-prose td p{margin:0;}
.nb-prose .selectedCell::after{content:"";position:absolute;inset:0;background:rgba(0,94,184,.08);pointer-events:none;}
.nb-prose p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:${C.dim};float:left;height:0;pointer-events:none;white-space:pre-wrap;}
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

/* --------------------------- Page editor ----------------------------- *
 * Notion-style writing surface: the note is always rendered formatted and
 * edited in place — no raw-markdown flip. TipTap drives the editing (with
 * live shortcuts: "## ", "- ", "1. ", "> ", "**bold**", "---"); the
 * Markdown extension keeps the stored format exactly what it was before —
 * markdown plus the small HTML subset — so autosave, the AI formatter,
 * export/import and the assistant's RAG chunking are all untouched.      */

// <kbd> mark — a couple of notes use it for keyboard keys; supporting it
// keeps the editor lossless for existing content.
const Kbd = Mark.create({
  name: 'kbd',
  parseHTML() { return [{ tag: 'kbd' }]; },
  renderHTML({ HTMLAttributes }) { return ['kbd', mergeAttributes(HTMLAttributes), 0]; },
});

const EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
  Underline, Kbd, Highlight, TextStyle, Color,
  TaskList, TaskItem.configure({ nested: true }),
  Table, TableRow, TableHeader, TableCell,
  Link.configure({ openOnClick: false, autolink: true }),
  // Inline images ("![alt](url)" in the stored markdown). inline:true matches
  // how markdown treats images (inside paragraphs), so the body round-trips
  // cleanly; CSS still displays them as blocks. Pasted pictures are uploaded
  // to blob storage first (see PageEditor's handlePaste) — data URLs would
  // bloat the note body and the assistant's index.
  TipTapImage.configure({ inline: true, allowBase64: false }),
  Placeholder.configure({ placeholder: 'Write here — headings, lists and tables format as you type ("## ", "- ", "1. ", "> "). Everything you write is used by the assistant to answer and triage.' }),
  // html:true keeps the <mark>/<u>/<span style="color:…">/<kbd> subset intact
  // in both directions (stored markdown → editor, editor → stored markdown).
  Markdown.configure({ html: true, linkify: true }),
];

// Keyed by note id in the parent, so switching pages gets a fresh editor and
// its own undo history. onChange receives the serialized markdown on every
// edit and feeds the existing dirty → interval-save pipeline.
function PageEditor({ initialBody, onChange, onReady, uploadImage }) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const uploadRef = React.useRef(uploadImage);
  uploadRef.current = uploadImage;
  const editorRef = React.useRef(null);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: EXTENSIONS,
    content: initialBody || '',
    editorProps: {
      attributes: { class: 'nb-prose' },
      // Pasted pictures: upload to blob storage (tracked as attachments of
      // this note), then insert inline at the caret as an image node.
      handlePaste: (view, event) => {
        const files = Array.from((event.clipboardData && event.clipboardData.files) || [])
          .filter((f) => /^image\//.test(f.type));
        if (!files.length || !uploadRef.current) return false;
        event.preventDefault();
        (async () => {
          for (const f of files) {
            const url = await uploadRef.current(f);
            const ed = editorRef.current;
            if (url && ed) ed.chain().focus().setImage({ src: url, alt: f.name || '' }).run();
          }
        })();
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => onChangeRef.current(ed.storage.markdown.getMarkdown()),
  });
  editorRef.current = editor;
  // Hand the instance up for the toolbar (and take it back on unmount).
  React.useEffect(() => {
    onReady(editor || null);
    return () => onReady(null);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="nb-scroll" style={s('flex:1;min-height:0;overflow-y:auto;background:#fff;cursor:text;display:flex;flex-direction:column;')}
      onMouseDown={(e) => { if (e.target === e.currentTarget && editor) { e.preventDefault(); editor.chain().focus('end').run(); } }}>
      <EditorContent editor={editor} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} />
    </div>
  );
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
  const { selectedId, ancestors, expanded, setExpanded, q, childrenOf, treeMatch, attachments, selectNote, newNote, openMenu,
    dragId, setDragId, dropId, setDropId, canDropOn, moveNoteTo } = ctx;
  const isSel = selectedId === n.id;
  const onPath = ancestors.some((a) => a.id === n.id);
  const kids = q ? childrenOf(n.id).filter(treeMatch) : childrenOf(n.id);
  const open = !!expanded[n.id] || (!!q && kids.length > 0);
  const fileCount = attachments.filter((a) => a.noteId === n.id).length;
  // Drag a note (anything below the root) onto a section row to move it there.
  const draggable = !!n.parentId;
  const dropOk = dragId != null && canDropOn(dragId, n.id);
  return (
    <div>
      <div className={'nb-row' + (dragId === n.id ? ' nb-dragging' : '') + (dropOk && dropId === n.id ? ' nb-drop-ok' : '')}
        onContextMenu={(e) => openMenu(e, n.id)}
        draggable={draggable}
        onDragStart={draggable ? (e) => {
          e.dataTransfer.setData('application/x-nb-note', String(n.id));
          e.dataTransfer.effectAllowed = 'move';
          setDragId(n.id);
        } : undefined}
        onDragEnd={draggable ? () => { setDragId(null); setDropId(null); } : undefined}
        onDragOver={(e) => {
          if (!dropOk) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          if (dropId !== n.id) setDropId(n.id);
        }}
        onDragLeave={() => { if (dropId === n.id) setDropId(null); }}
        onDrop={(e) => {
          if (!dropOk) return;
          e.preventDefault();
          e.stopPropagation();
          setDropId(null);
          setDragId(null);
          moveNoteTo(dragId, n.id);
        }}
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
  const [dragId, setDragId] = React.useState(null);           // note being dragged in the sidebar
  const [dropId, setDropId] = React.useState(null);           // section row currently hovered as a drop target
  const [aiFmt, setAiFmt] = React.useState(null);            // null | {status:'loading'} | {status:'error',message} | {status:'ready',formatted,diff}
  const [aiOrg, setAiOrg] = React.useState(null);             // AI organise (sections): null | {status:'loading'|'applying'} | {status:'error',message} | {status:'ready',plan} | {status:'done',applied}
  const [editor, setEditor] = React.useState(null);           // TipTap instance of the open page (from PageEditor)
  const dragDepth = React.useRef(0);
  const saved = React.useRef(new Map());   // id -> { title, body } last persisted
  const dirty = React.useRef(new Set());   // ids edited since their last save
  const notesRef = React.useRef([]);
  const fileInput = React.useRef(null);
  const titleInput = React.useRef(null);
  notesRef.current = notes;

  // Re-render on every editor transaction so the toolbar's active states
  // (bold on, "in a table", …) track the caret.
  const [, onEditorTx] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (!editor) return;
    editor.on('transaction', onEditorTx);
    return () => { editor.off('transaction', onEditorTx); };
  }, [editor]);

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
  // Files docked below the page. Images embedded inline in the text are shown
  // there, not repeated here — a chip reappears if its image is deleted from
  // the text, so the file can still be removed (or re-embedded) from the strip.
  const selectedFiles = attachments.filter((a) => a.noteId === selectedId
    && !(selected && (selected.body || '').includes(a.url)));

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
   * Buttons drive the TipTap editor directly, so formatting applies in
   * place (Notion-style) and undo/redo is the editor's own history.      */

  const chain = () => editor.chain().focus();
  const listKind = () => (editor.isActive('taskItem') ? 'taskItem' : 'listItem');
  // The DOM normalises hex colours to rgb(…) on save, so match either form
  // when deciding whether a swatch is active (and should toggle off).
  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return 'rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')';
  };
  const colorActive = (hex) => {
    if (!editor) return false;
    const c = editor.getAttributes('textStyle').color;
    return c === hex || c === hexToRgb(hex);
  };

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

  // AI organise: for a section (typically "Uncategorised"), ask the server for
  // a plan of where every page's content belongs — existing sections, new ones
  // or sub-sections — then show the plan for review. Nothing moves until the
  // user applies it; applying redistributes the content (formatted for its new
  // home), moves attachments along, and removes the emptied pages.
  // AI organise applies only to the "Uncategorised" holding section — other
  // sections are already where their content belongs.
  const canOrganize = (n) => !!n && (!n.parentId || !!n.isSection) && /^\s*uncategori[sz]ed\s*$/i.test(n.title || '');

  async function runAiOrganize(id = selectedId) {
    const n = byId.get(id);
    if (!canOrganize(n)) return;
    if (aiOrg && (aiOrg.status === 'loading' || aiOrg.status === 'applying')) return;
    await selectNote(id); // the plan shows in the section view (also flushes edits)
    setAiOrg({ status: 'loading' });
    try {
      const res = await fetch('/api/notebook/organize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Organise failed.');
      setAiOrg({ status: 'ready', plan: data.plan });
    } catch (e) {
      setAiOrg({ status: 'error', message: String(e.message || e) });
    }
  }

  async function applyAiOrganize() {
    if (!aiOrg || aiOrg.status !== 'ready') return;
    const plan = aiOrg.plan;
    setAiOrg({ status: 'applying' });
    try {
      const res = await fetch('/api/notebook/organize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: plan.sectionId, plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not apply the plan.');
      await reloadAll();
      setAiOrg({ status: 'done', applied: data.applied || {} });
    } catch (e) {
      setAiOrg({ status: 'error', message: String(e.message || e) });
    }
  }

  function applyAiFormat() {
    if (!aiFmt || aiFmt.status !== 'ready') return;
    // Load the formatted markdown into the editor; emitting the update runs
    // the normal onChange → dirty → interval-save path.
    if (editor) editor.commands.setContent(aiFmt.formatted, true);
    else {
      setNotes((ns) => ns.map((n) => (n.id === selectedId ? { ...n, body: aiFmt.formatted } : n)));
      dirty.current.add(selectedId);
      setSaveState('saving');
    }
    setAiFmt(null);
  }

  /* --------------------------- Note actions --------------------------- */

  async function selectNote(id) {
    await flush();
    setUploadErr('');
    setAiFmt(null);
    setAiOrg(null);
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

  // A pasted image goes through the same attachments API (so the file is tied
  // to the note and its blob is cleaned up with it) and returns the URL the
  // editor embeds inline.
  async function uploadInlineImage(file) {
    if (!selectedId || isSection || !file) return null;
    setUploading(true);
    setUploadErr('');
    try {
      const form = new FormData();
      form.append('noteId', String(selectedId));
      form.append('file', file, file.name || 'pasted-image.png');
      const res = await fetch('/api/notebook/attachments', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      setAttachments((as) => as.concat([data.attachment]));
      return data.attachment.url;
    } catch (e) {
      setUploadErr(String(e.message || e));
      return null;
    } finally {
      setUploading(false);
    }
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

  /* ------------------- Drag notes between sections --------------------- */

  // Whether the dragged note may land on this row: only sections receive
  // drops, never a note's own subtree (no cycles), never its current parent
  // (a no-op), and the result must stay within the depth cap.
  const canDropOn = React.useCallback((id, targetId) => {
    const drag = byId.get(id);
    const target = byId.get(targetId);
    if (!drag || !target || id === targetId) return false;
    if (!drag.parentId) return false;                            // root sections stay put
    if (target.parentId && !target.isSection) return false;      // pages aren't containers
    if (drag.parentId === target.id) return false;               // already there
    if (descendantIds(id).has(targetId)) return false;           // no cycles
    let depth = 0;
    for (let cur = byId.get(target.parentId); cur && depth < 12; cur = byId.get(cur.parentId)) depth++;
    // Height of the dragged subtree: longest parent chain inside it.
    let height = 0;
    const inTree = descendantIds(id);
    for (const x of notes) {
      if (!inTree.has(x.id)) continue;
      let d = 0;
      for (let cur = x; cur && cur.id !== id && d < 12; cur = byId.get(cur.parentId)) d++;
      if (d > height) height = d;
    }
    return depth + 1 + height <= MAX_DEPTH - 1;
  }, [byId, notes, descendantIds]);

  // Persist the move, reparent locally and open the target so the note is
  // visible in its new home.
  async function moveNoteTo(id, parentId) {
    if (!canDropOn(id, parentId)) return;
    try {
      const res = await fetch('/api/notebook', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, parentId }),
      });
      if (!res.ok) throw new Error('bad status');
      const { note } = await res.json();
      setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, parentId: note.parentId } : n)));
      setExpanded((e) => ({ ...e, [parentId]: true }));
    } catch (e) { /* ignore — the note simply stays where it was */ }
  }

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

  const rowCtx = { selectedId, ancestors, expanded, setExpanded, q, childrenOf, treeMatch, attachments, selectNote, newNote, openMenu,
    dragId, setDragId, dropId, setDropId, canDropOn, moveNoteTo };
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
          {selected && canOrganize(selected) && (
            <Hover tag="button" onClick={() => runAiOrganize()} aria-label="AI organise" title="AI organise — move every page's content in this section to the section it belongs in (you review the plan first)"
              base={'flex:none;display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 13px;border:1px solid ' + C.line + ';background:#fff;border-radius:9px;cursor:pointer;font:inherit;font-size:13.5px;font-weight:600;color:' + C.blue + ';' + (aiOrg && (aiOrg.status === 'loading' || aiOrg.status === 'applying') ? 'opacity:.55;' : '')}
              hover={'border-color:' + C.blue + ';background:#f7fbff;'}>
              <Svg w={15} sw={2}>{Icons.sparkle}</Svg>AI organise
            </Hover>
          )}
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

            {/* AI organise — status banner and, when ready, the reviewable plan. */}
            {aiOrg && (
              <div style={s('margin:0 0 20px;border:1px solid ' + C.line + ';border-radius:12px;background:#fff;overflow:hidden;')}>
                <div style={s('display:flex;align-items:center;gap:10px;background:' + C.sel + ';border-bottom:1px solid ' + C.line + ';padding:10px 16px;')}>
                  <Svg w={16} sw={2} stroke={C.blue}>{Icons.sparkle}</Svg>
                  <span style={s('flex:1;min-width:0;font-size:14.5px;color:' + C.navy + ';')}>
                    {aiOrg.status === 'loading' && 'Reading every page in this section and deciding where each part belongs…'}
                    {aiOrg.status === 'applying' && 'Moving the content into place…'}
                    {aiOrg.status === 'error' && aiOrg.message}
                    {aiOrg.status === 'ready' && 'Review where each page’s content will go. Every fact is kept; emptied pages are removed and their files move with the content. Nothing changes until you apply.'}
                    {aiOrg.status === 'done' && ('Done — moved the content of ' + (aiOrg.applied.moved || 0) + ' page(s)'
                      + ((aiOrg.applied.newSections || 0) ? ', created ' + aiOrg.applied.newSections + ' section(s)' : '')
                      + ((aiOrg.applied.newPages || 0) ? ', created ' + aiOrg.applied.newPages + ' page(s)' : '')
                      + ((aiOrg.applied.removed || 0) ? ', removed ' + aiOrg.applied.removed + ' emptied page(s)' : '') + '.')}
                  </span>
                  {aiOrg.status === 'ready' && (
                    <Hover tag="button" onClick={applyAiOrganize}
                      base={'flex:none;font:inherit;font-size:13.5px;font-weight:700;color:#fff;background:' + C.green + ';border:none;border-radius:7px;padding:7px 15px;cursor:pointer;'}
                      hover="background:#00542b;">Apply plan</Hover>
                  )}
                  {(aiOrg.status === 'ready' || aiOrg.status === 'error' || aiOrg.status === 'done') && (
                    <Hover tag="button" onClick={() => setAiOrg(null)}
                      base={'flex:none;font:inherit;font-size:13.5px;font-weight:600;color:' + C.mut + ';background:none;border:none;border-radius:7px;padding:7px 10px;cursor:pointer;'}
                      hover={'color:' + C.ink + ';'}>{aiOrg.status === 'ready' ? 'Cancel' : 'Dismiss'}</Hover>
                  )}
                </div>
                {aiOrg.status === 'ready' && (
                  <div style={s('padding:6px 16px 14px;display:flex;flex-direction:column;gap:2px;')}>
                    {aiOrg.plan.allocations.map((a) => (
                      <div key={a.noteId} style={s('padding:10px 0 4px;border-bottom:1px solid ' + C.soft + ';')}>
                        <div style={s('display:flex;align-items:center;gap:8px;font-size:14.5px;font-weight:700;color:' + C.ink + ';')}>
                          <Svg w={15} sw={2} style={s('flex:none;color:' + C.mut + ';')}>{Icons.fileLines}</Svg>
                          {a.noteTitle || 'Untitled'}
                        </div>
                        {a.parts.map((p, i) => (
                          <div key={i} style={s('display:flex;gap:9px;align-items:flex-start;margin:8px 0 8px 23px;')}>
                            <Svg w={14} sw={2.2} style={s('flex:none;margin-top:3px;color:' + C.blue + ';')}>{Icons.arrow}</Svg>
                            <div style={s('flex:1;min-width:0;')}>
                              <div style={s('font-size:13.5px;font-weight:600;color:' + C.navy + ';')}>
                                {p.section}{p.isNewSection ? ' (new section)' : ''}
                                <span style={s('color:' + C.dim + ';margin:0 5px;')}>›</span>
                                {p.page || a.noteTitle || 'Untitled'}{p.isNewPage ? ' (new page)' : ''}
                              </div>
                              <div style={s('margin-top:3px;font-size:12.5px;line-height:1.5;color:' + C.mut + ';overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;')}>
                                {p.markdown.replace(/<[^>]+>/g, '').replace(/[#*>`|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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
            {/* Formatting toolbar — drives the TipTap editor in place. */}
            <div style={s('flex:none;display:flex;align-items:center;flex-wrap:wrap;gap:2px;background:#fff;border-bottom:1px solid ' + C.soft + ';padding:5px 20px;')}
              onMouseDown={(e) => e.preventDefault() /* keep the editor selection */}>
              {[
                { title: 'Undo (Ctrl+Z)', run: () => chain().undo().run(), icon: Icons.undo },
                { title: 'Redo (Ctrl+Y)', run: () => chain().redo().run(), icon: Icons.redo },
                null,
                { title: 'Heading 1', run: () => chain().toggleHeading({ level: 1 }).run(), icon: TIcons.h1, active: editor && editor.isActive('heading', { level: 1 }) },
                { title: 'Heading 2', run: () => chain().toggleHeading({ level: 2 }).run(), icon: TIcons.h2, active: editor && editor.isActive('heading', { level: 2 }) },
                { title: 'Heading 3', run: () => chain().toggleHeading({ level: 3 }).run(), icon: TIcons.h3, active: editor && editor.isActive('heading', { level: 3 }) },
                null,
                { title: 'Bold (Ctrl+B)', run: () => chain().toggleBold().run(), icon: TIcons.bold, active: editor && editor.isActive('bold') },
                { title: 'Italic (Ctrl+I)', run: () => chain().toggleItalic().run(), icon: TIcons.italic, active: editor && editor.isActive('italic') },
                { title: 'Strikethrough', run: () => chain().toggleStrike().run(), icon: TIcons.strike, active: editor && editor.isActive('strike') },
                { title: 'Inline code', run: () => chain().toggleCode().run(), icon: TIcons.code, active: editor && editor.isActive('code') },
                null,
                { title: 'Bulleted list', run: () => chain().toggleBulletList().run(), icon: TIcons.list, active: editor && editor.isActive('bulletList') },
                { title: 'Numbered list', run: () => chain().toggleOrderedList().run(), icon: TIcons.listOrdered, active: editor && editor.isActive('orderedList') },
                { title: 'Task list', run: () => chain().toggleTaskList().run(), icon: TIcons.listChecks, active: editor && editor.isActive('taskList') },
                null,
                { title: 'Decrease indent', run: () => chain().liftListItem(listKind()).run(), icon: TIcons.outdent },
                { title: 'Increase indent', run: () => chain().sinkListItem(listKind()).run(), icon: TIcons.indent },
                { title: 'Quote', run: () => chain().toggleBlockquote().run(), icon: TIcons.quote, active: editor && editor.isActive('blockquote') },
                { title: 'Divider', run: () => chain().setHorizontalRule().run(), icon: TIcons.divider },
                null,
                { title: 'Underline (Ctrl+U)', run: () => chain().toggleUnderline().run(), icon: TIcons.underline, active: editor && editor.isActive('underline') },
                { title: 'Highlight', run: () => chain().toggleHighlight().run(), icon: TIcons.highlighter, active: editor && editor.isActive('highlight') },
                ...TEXT_COLORS.map((c2) => ({
                  title: c2.name + ' text',
                  run: () => (colorActive(c2.hex) ? chain().unsetColor().run() : chain().setColor(c2.hex).run()),
                  swatch: c2.hex,
                  active: colorActive(c2.hex),
                })),
                { title: 'Insert table', run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), icon: TIcons.table },
                // Table controls appear only while the caret is inside a table.
                ...(editor && editor.isActive('table') ? [
                  null,
                  { title: 'Add row below', run: () => chain().addRowAfter().run(), label: '+ Row' },
                  { title: 'Add column right', run: () => chain().addColumnAfter().run(), label: '+ Col' },
                  { title: 'Delete row', run: () => chain().deleteRow().run(), label: '− Row' },
                  { title: 'Delete column', run: () => chain().deleteColumn().run(), label: '− Col' },
                  { title: 'Delete table', run: () => chain().deleteTable().run(), label: '✕ Table' },
                ] : []),
                null,
                { title: 'AI format — restructure this note into headings, lists, tables and highlights (you confirm the changes first)', run: runAiFormat, icon: Icons.sparkle, accent: true },
              ].map((btn, i) => btn === null
                ? <span key={'sep' + i} style={s('flex:none;width:1px;height:18px;background:' + C.line + ';margin:0 7px;')} />
                : (
                  <Hover key={btn.title} tag="button" onClick={() => { if (!editor && !btn.accent) return; btn.run(); }} aria-label={btn.title} title={btn.title}
                    base={'flex:none;height:32px;display:flex;align-items:center;justify-content:center;border:none;border-radius:7px;cursor:pointer;font:inherit;' +
                      (btn.label ? 'padding:0 10px;font-size:12.5px;font-weight:700;' : 'width:32px;') +
                      'background:' + (btn.active ? C.sel : 'none') + ';color:' + (btn.active || btn.accent ? C.blue : C.mut) + ';' +
                      (btn.accent && aiFmt && aiFmt.status === 'loading' ? 'opacity:.5;' : '')}
                    hover={'background:' + C.sel + ';color:' + C.blue + ';'}>
                    {btn.swatch
                      ? <span style={s('width:14px;height:14px;border-radius:99px;background:' + btn.swatch + ';border:1.5px solid #fff;box-shadow:0 0 0 1px ' + (btn.active ? C.blue : C.line) + ';')} />
                      : btn.label ? btn.label : <Svg w={16} sw={2}>{btn.icon}</Svg>}
                  </Hover>
                ))}
            </div>

            {/* AI-format status bar — the diff below replaces the editor until
                the user applies or cancels. */}
            {aiFmt && (
              <div style={s('flex:none;display:flex;align-items:center;gap:10px;background:' + C.sel + ';border-bottom:1px solid ' + C.line + ';padding:9px 20px;')}>
                <Svg w={16} sw={2} stroke={C.blue}>{Icons.sparkle}</Svg>
                <span style={s('flex:1;min-width:0;font-size:14.5px;color:' + C.navy + ';')}>
                  {aiFmt.status === 'loading' && 'Restructuring the note — headings, lists, tables and highlights…'}
                  {aiFmt.status === 'error' && aiFmt.message}
                  {aiFmt.status === 'ready' && 'Review the full reformat below — headings, lists, tables and highlights. Every fact is kept. Nothing is saved until you apply.'}
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
                AI diff while reviewing); attachments dock below and never
                push it down. */}
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
              <PageEditor
                key={selected.id}
                initialBody={selected.body || ''}
                onChange={(md) => editSelected({ body: md })}
                onReady={setEditor}
                uploadImage={uploadInlineImage}
              />
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
          {canOrganize(byId.get(menu.id)) && (
            <Hover tag="button" onClick={() => { setMenu(null); runAiOrganize(menu.id); }}
              base={'display:flex;align-items:center;gap:9px;border:none;background:none;border-radius:7px;font:inherit;font-size:14.5px;color:' + C.blue + ';cursor:pointer;padding:9px 11px;text-align:left;'}
              hover={'background:' + C.sel + ';'}>
              <Svg w={15} sw={2.2}>{Icons.sparkle}</Svg>AI organise
            </Hover>
          )}
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
