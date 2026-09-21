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
import { Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import MapView from '../_components/notebook/MapView';
import CardEditor from '../_components/notebook/CardEditor';
import {
  NotebookStyles, T, NBIcons, Banner, Button, IconButton, Tabs, SearchField, Chip, StatusPill,
  EmptyState, Modal, ConfirmModal, ProgressModal, Menu, MenuItem, MenuLabel, MenuSeparator,
  MenuOption, Spinner,
} from '../_components/notebook/kit';
import { lineDiff } from '@/lib/notebook/diff.mjs';
import {
  CREATABLE_KINDS, emptyFields, isTypedKind, noteIssues, noteKind, normaliseFields, suggestKind,
} from '@/lib/notebook/kinds.mjs';
import { phaseLabel, readProgress } from '@/lib/notebook/progress.mjs';

/* ------------------------------------------------------------------ *
 * Notebook - the practice's notes, which the assistant reads to answer.
 *
 * The screen is two columns and nothing else: the tree of sections and
 * pages on the left, the page itself on the right with its own header,
 * toolbar and writing surface. Everything that interrupts - a deletion,
 * a reformat to review, a backup being restored - arrives as the same
 * modal, from the kit next door (kit.jsx), so a dialogue in the Notebook
 * always looks like the last dialogue in the Notebook.
 *
 * What is stored and how has not moved: notes and their tree live in
 * Postgres (/api/notebook), files in Vercel Blob
 * (/api/notebook/attachments), bodies are markdown plus the small HTML
 * subset TipTap round-trips, and saving is still the quiet-period
 * autosave below. This file is the presentation of all that, rewritten.
 * ------------------------------------------------------------------ */

// Layout and the handful of page-only shapes. Everything reusable - buttons,
// tabs, modals, menus, rows, the writing surface - is in kit.jsx.
const PAGE_CSS = `
.nbk-shell{display:flex;flex-direction:column;height:100vh;min-height:100vh;background:var(--nbk-canvas);}
.nbk-body{flex:1;min-height:0;display:flex;width:100%;}

.nbk-sidebar{flex:none;width:320px;display:flex;flex-direction:column;min-height:0;background:#fff;
  border-right:1px solid var(--nbk-line);}
.nbk-sidebar__top{flex:none;display:flex;flex-direction:column;gap:9px;padding:14px 14px 10px;
  border-bottom:1px solid var(--nbk-line-soft);}
.nbk-sidebar__row{display:flex;align-items:center;gap:8px;}
.nbk-tree{flex:1;min-height:0;overflow-y:auto;padding:10px 10px 18px;display:flex;flex-direction:column;gap:1px;}
.nbk-sidebar__foot{flex:none;display:flex;flex-direction:column;gap:9px;padding:12px 14px 14px;
  border-top:1px solid var(--nbk-line-soft);background:#fcfdfe;}
.nbk-sidebar__note{display:flex;align-items:center;gap:7px;font-size:12px;line-height:1.45;color:var(--nbk-dim);}
.nbk-foot-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}

.nbk-main{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;position:relative;background:#fff;}
.nbk-head{flex:none;display:flex;align-items:center;gap:14px;min-height:68px;padding:11px 20px;
  background:#fff;border-bottom:1px solid var(--nbk-line);}
.nbk-head__left{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}
.nbk-head__crumbs{display:flex;align-items:center;gap:5px;padding-left:6px;font-size:12.5px;color:var(--nbk-dim);
  overflow:hidden;white-space:nowrap;}
.nbk-crumb{border:none;background:none;padding:0;font:inherit;font-size:12.5px;font-weight:600;
  color:var(--nbk-mut);cursor:pointer;border-radius:4px;}
.nbk-crumb:hover{color:var(--nbk-blue);text-decoration:underline;}
.nbk-head__actions{flex:none;display:flex;align-items:center;gap:8px;}

.nbk-section{flex:1;min-height:0;overflow-y:auto;background:var(--nbk-canvas);padding:22px 24px 40px;}
.nbk-section__inner{width:100%;max-width:880px;margin:0 auto;display:flex;flex-direction:column;gap:12px;}
.nbk-page-card{display:flex;align-items:center;gap:11px;width:100%;text-align:left;background:#fff;
  border:1px solid var(--nbk-line);border-radius:var(--nbk-r-md);box-shadow:var(--nbk-sh-1);padding:13px 15px;
  font:inherit;font-size:14.5px;font-weight:600;color:var(--nbk-ink);cursor:pointer;
  transition:border-color .14s ease,background-color .14s ease,transform .08s ease;}
.nbk-page-card:hover{border-color:#a9c3d6;background:#fafdff;}
.nbk-page-card:active{transform:translateY(1px);}
.nbk-add-card{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;
  border:1.5px dashed var(--nbk-line);border-radius:var(--nbk-r-md);background:none;padding:13px 15px;
  font:inherit;font-size:14px;font-weight:600;color:var(--nbk-mut);cursor:pointer;
  transition:border-color .14s ease,color .14s ease,background-color .14s ease;}
.nbk-add-card:hover{border-color:var(--nbk-blue);color:var(--nbk-blue);background:#f8fcff;}

.nbk-editor{flex:1;min-height:0;overflow-y:auto;background:#fff;cursor:text;display:flex;flex-direction:column;}
.nbk-dock{flex:none;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 20px 13px;
  border-top:1px solid var(--nbk-line-soft);background:#fcfdfe;}
.nbk-attach{display:inline-flex;align-items:center;gap:8px;max-width:280px;padding:5px 6px 5px 11px;
  background:#fff;border:1px solid var(--nbk-line);border-radius:999px;box-shadow:var(--nbk-sh-1);}
.nbk-attach a{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;
  font-weight:600;color:var(--nbk-ink);text-decoration:none;}
.nbk-attach a:hover{color:var(--nbk-blue);text-decoration:underline;}

.nbk-dropzone{position:absolute;inset:12px;z-index:5;display:flex;align-items:center;justify-content:center;
  gap:10px;border:2px dashed var(--nbk-blue);border-radius:var(--nbk-r-lg);background:rgba(233,242,250,.88);
  font-size:16px;font-weight:700;color:var(--nbk-navy);pointer-events:none;}

/* The typed card. The screen itself is drawn by the same components the chat
   uses (app/_components/templates), which carry their own styling - there is
   deliberately no second set of card styles here to drift from them. What is
   left is the space the screen sits in and the heading over the page's own
   writing underneath it. */
.nbk-card-wrap{padding:18px 20px 0;}
.nbk-card__prose{margin:16px 20px 0;padding:12px 0 0;border-top:1px solid var(--nbk-line-soft);
  font-size:12.5px;font-weight:700;color:var(--nbk-mut);}

.nbk-plan__note{padding:12px 0 6px;border-top:1px solid var(--nbk-line-soft);}
.nbk-plan__part{display:flex;gap:10px;align-items:flex-start;margin:9px 0 9px 24px;}

@media (max-width:820px){
  .nbk-sidebar{width:260px;}
  .nbk-prose{padding:22px 20px 140px;}
}
`;

const MAX_DEPTH = 4; // sections + 3 levels of pages keeps the tree sane

function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}
// Formatting-toolbar glyphs (the same 24x24 stroke style as the shared set,
// geometry from Lucide). Local to the notebook: no other page needs them.
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
 * edited in place - no raw-markdown flip. TipTap drives the editing (with
 * live shortcuts: "## ", "- ", "1. ", "> ", "**bold**", "---"); the
 * Markdown extension keeps the stored format exactly what it was before -
 * markdown plus the small HTML subset - so autosave, the AI formatter,
 * export/import and the assistant's RAG chunking are all untouched.      */

// <kbd> mark - a couple of notes use it for keyboard keys; supporting it
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
  // to blob storage first (see PageEditor's handlePaste) - data URLs would
  // bloat the note body and the assistant's index.
  TipTapImage.configure({ inline: true, allowBase64: false }),
  Placeholder.configure({ placeholder: 'Write here. Headings, lists and tables format as you type ("## ", "- ", "1. ", "> "). Everything you write is used by the assistant to answer and triage.' }),
  // html:true keeps the <mark>/<u>/<span style="color:...">/<kbd> subset intact
  // in both directions (stored markdown to editor, editor to stored markdown).
  Markdown.configure({ html: true, linkify: true }),
];

// Keyed by note id in the parent, so switching pages gets a fresh editor and
// its own undo history. onChange receives the serialized markdown on every
// edit and feeds the existing dirty -> interval-save pipeline.
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
      attributes: { class: 'nbk-prose' },
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
    <div className="nbk-editor nbk-scroll"
      onMouseDown={(e) => { if (e.target === e.currentTarget && editor) { e.preventDefault(); editor.chain().focus('end').run(); } }}>
      <EditorContent editor={editor} style={{ flex: 1, display: 'flex', flexDirection: 'column' }} />
    </div>
  );
}

/**
 * What a note is, as a chip.
 *
 * A swatch and the short name, in the kind's own colour. `full` spells the
 * whole name out - used where there is room; the tree uses the short one so a
 * chip never pushes a page title out of view. A plain note wears nothing:
 * almost every page is one, and a chip on all of them is a chip on none.
 *
 * A DRAFT SAYS SO. An incomplete card is not served, and the tree is where
 * somebody notices that without opening it.
 */
function KindChip({ kind, draft = false, full = false }) {
  const def = noteKind(kind);
  if (!isTypedKind(def.id)) return null;
  return (
    <Chip colour={draft ? { ink: '#8a5a00', tint: '#fff5e0', edge: '#d9a441' } : def.colour} dot={full}
      title={draft
        ? def.label + ' - not finished, so the assistant does not answer from it yet.'
        : def.label + ' - the assistant answers from its recorded values.'}>
      {(full ? def.label : def.short) + (draft ? ' - draft' : '')}
    </Chip>
  );
}


// One tree row; children render recursively inside .nbk-kids, which draws the
// parent-to-child connector lines. Defined at module level (not inside the page
// component) so React keeps the same component identity across renders -
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
  const draft = String(n.status || 'live') === 'draft';
  // Drag a note (anything below the root) onto a section row to move it there.
  const draggable = !!n.parentId;
  const dropOk = dragId != null && canDropOn(dragId, n.id);
  const cls = ['nbk-row',
    isSel ? 'nbk-row--on' : onPath ? 'nbk-row--path' : '',
    dragId === n.id ? 'nbk-row--drag' : '',
    dropOk && dropId === n.id ? 'nbk-row--drop' : ''].filter(Boolean).join(' ');
  return (
    <div>
      <div className={cls}
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
        }}>
        {kids.length > 0 ? (
          <IconButton plain size="sm" label={open ? 'Collapse' : 'Expand'} icon={Icons.chevronRight}
            style={{ transform: 'rotate(' + (open ? 90 : 0) + 'deg)', transition: 'transform .15s ease' }}
            onClick={() => setExpanded((e) => ({ ...e, [n.id]: !open }))} />
        ) : (<span style={{ flex: 'none', width: '28px' }} />)}
        <button type="button" className="nbk-row__btn" onClick={() => selectNote(n.id)}>
          <Svg w={16} sw={2} style={{ flex: 'none', color: isSel ? T.blue : T.dim }}>
            {depth === 0 || n.isSection ? Icons.book
              : isTypedKind(n.kind) ? (Icons[noteKind(n.kind).icon] || Icons.fileLines)
                : Icons.fileLines}
          </Svg>
          <span className="nbk-row__name">{n.title || 'Untitled'}</span>
          {fileCount > 0 && <Svg w={13} sw={2.2} style={{ flex: 'none', color: T.dim }}>{Icons.paperclip}</Svg>}
          {/* What this note is, where it is not the ordinary page. A draft says
              so here, because a card nobody finished is one the assistant is
              not answering from and the tree is where that gets noticed. */}
          <KindChip kind={n.kind} draft={draft} />
        </button>
        <span className="nbk-row__actions">
          {depth < MAX_DEPTH - 1 && (
            <IconButton plain size="sm" icon={Icons.plus} label="Add page" onClick={() => newNote(n.id)} />
          )}
          <IconButton plain size="sm" icon={NBIcons.dots} label="More" onClick={(e) => openMenu(e, n.id, true)} />
        </span>
      </div>
      {open && kids.length > 0 && (
        // A PLAIN GUIDE LINE. It used to take the colour of the folder's tag,
        // because a tag was a property of the folder and everything beneath it
        // inherited one. A kind is a property of the note, so the folder has no
        // colour to lend and a coloured line here would say something untrue
        // about the pages under it.
        <div className="nbk-kids">
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
  // Which sections are open - persisted so the tree doesn't collapse on reload.
  const [expanded, setExpanded] = React.useState(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(window.localStorage.getItem('nb-expanded') || '{}') || {}; } catch (e) { return {}; }
  });
  React.useEffect(() => {
    try { window.localStorage.setItem('nb-expanded', JSON.stringify(expanded)); } catch (e) { /* ignore */ }
  }, [expanded]);
  const [search, setSearch] = React.useState('');
  const [saveState, setSaveState] = React.useState('');     // '' | 'saving' | 'saved' | 'unsaved'
  const [view, setView] = React.useState('pages');           // 'pages' - the editor; 'map' - the treemap
  const [uploading, setUploading] = React.useState(false);
  const [uploadErr, setUploadErr] = React.useState('');
  // Where an import has got to: { phase, done, total } or null when none is
  // running. The import used to finish in silence - a file was posted and
  // nothing happened on screen until it was over, which looked broken on a big
  // notebook and got clicked twice. See /api/notebook/import, which streams.
  const [importing, setImporting] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const [confirm, setConfirm] = React.useState(null);       // { title, message, confirmLabel, onConfirm }
  const [menu, setMenu] = React.useState(null);              // { id, x, y } - the note menu
  const [dragId, setDragId] = React.useState(null);           // note being dragged in the sidebar
  const [dropId, setDropId] = React.useState(null);           // section row currently hovered as a drop target
  const [aiFmt, setAiFmt] = React.useState(null);            // null | {status:'loading'} | {status:'error',message} | {status:'ready',formatted,diff}
  const [aiOrg, setAiOrg] = React.useState(null);             // AI organise (sections)
  const [editor, setEditor] = React.useState(null);           // TipTap instance of the open page
  const dragDepth = React.useRef(0);
  const saved = React.useRef(new Map());   // id -> { title, body } last persisted
  const dirty = React.useRef(new Set());   // ids edited since their last save
  const dirtyAt = React.useRef(new Map()); // id -> last edit time (quiet-period debounce)
  const saving = React.useRef(new Set());  // prevent overlapping/out-of-order PATCHes
  const notesRef = React.useRef([]);
  const fileInput = React.useRef(null);
  const titleInput = React.useRef(null);
  notesRef.current = notes;

  // Re-render on every editor transaction so the toolbar's active states
  // (bold on, "in a table", ...) track the caret.
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
        for (const n of list) saved.current.set(n.id, { title: n.title || '', body: n.body || '', fields: JSON.stringify(n.fields || {}) });
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
  // The open page's typed values, always complete for its kind: an editor
  // handed an undefined value renders an uncontrolled box that React then
  // complains about the first time somebody types in it.
  const selectedFields = React.useMemo(
    () => (selected && isTypedKind(selected.kind) ? { ...emptyFields(selected.kind), ...normaliseFields(selected.kind, selected.fields) } : {}),
    [selected],
  );
  // WHAT IS MISSING, WORKED OUT HERE AS WELL AS ON THE SERVER. The server
  // decides whether the note is servable; this is the same rules run against
  // what is on screen, so a box turns red as it is emptied rather than 1.8
  // seconds later when the autosave comes back.
  const selectedIssues = React.useMemo(
    () => (selected && isTypedKind(selected.kind) ? noteIssues(selected.kind, selectedFields) : []),
    [selected, selectedFields],
  );
  const suggested = React.useMemo(
    () => (selected && !isSection && !isTypedKind(selected.kind) ? suggestKind(selected.body) : ''),
    [selected, isSection],
  );
  // Files docked below the page. Images embedded inline in the text are shown
  // there, not repeated here - a chip reappears if its image is deleted from
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
   * Time-based, not per-keystroke: edits mark the note dirty; after 1.8s quiet
   * the interval diffs it against its last persisted snapshot and PATCHes only
   * the fields that actually changed - no change, no request.             */

  async function flush() {
    for (const id of Array.from(dirty.current)) {
      if (saving.current.has(id)) continue;
      if (Date.now() - (dirtyAt.current.get(id) || 0) < 1800) continue;
      const n = notesRef.current.find((x) => x.id === id);
      if (!n) { dirty.current.delete(id); continue; } // deleted while dirty
      const prev = saved.current.get(id) || {};
      // The typed values are compared as their JSON, which is what makes an
      // autosave of a card the same cheap check as an autosave of prose: one
      // string against one string, with no walk of a shape that differs per
      // kind.
      const fieldsNow = JSON.stringify(n.fields || {});
      const patch = {};
      if ((n.title || '') !== (prev.title || '')) patch.title = n.title || '';
      if ((n.body || '') !== (prev.body || '')) patch.body = n.body || '';
      if (fieldsNow !== (prev.fields || '{}')) patch.fields = n.fields || {};
      if (!Object.keys(patch).length) { dirty.current.delete(id); continue; }
      const sent = { title: n.title || '', body: n.body || '', fields: fieldsNow };
      try {
        saving.current.add(id);
        setSaveState('saving');
        const res = await fetch('/api/notebook', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...patch, id }) });
        if (!res.ok) throw new Error('bad status');
        const { note: back } = await res.json();
        saved.current.set(id, sent);
        // WHETHER IT IS SERVABLE IS THE SERVER'S ANSWER, not this page's. The
        // rules that decide live or draft live with the kind, and a browser
        // that worked it out for itself would be a second copy of them.
        if (back && back.status) {
          setNotes((ns) => ns.map((x) => (x.id === id ? { ...x, status: back.status } : x)));
        }
        const latest = notesRef.current.find((x) => x.id === id);
        if (latest && (latest.title || '') === sent.title && (latest.body || '') === sent.body
          && JSON.stringify(latest.fields || {}) === sent.fields) {
          dirty.current.delete(id);
          dirtyAt.current.delete(id);
        }
        setSaveState('saved');
        setTimeout(() => setSaveState((s2) => (s2 === 'saved' ? '' : s2)), 1500);
      } catch (e) {
        setSaveState('unsaved');
      } finally {
        saving.current.delete(id);
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
    dirtyAt.current.set(selectedId, Date.now());
    setSaveState('saving');
  }

  /* ------------------------ Formatting toolbar ------------------------ *
   * Buttons drive the TipTap editor directly, so formatting applies in
   * place (Notion-style) and undo/redo is the editor's own history.      */

  const chain = () => editor.chain().focus();
  const listKind = () => (editor.isActive('taskItem') ? 'taskItem' : 'listItem');
  // The DOM normalises hex colours to rgb(...) on save, so match either form
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
  // user must confirm - nothing is applied (or saved) until they accept.
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
      if (formatted.trim() === original.trim()) { setAiFmt({ status: 'error', message: 'Nothing to change: the note is already tidy.' }); return; }
      setAiFmt({ status: 'ready', formatted, diff: lineDiff(original, formatted) });
    } catch (e) {
      setAiFmt({ status: 'error', message: String(e.message || e) });
    }
  }

  // AI organise applies only to the "Uncategorised" holding section - other
  // sections are already where their content belongs.
  const canOrganize = (n) => !!n && (!n.parentId || !!n.isSection) && /^\s*uncategori[sz]ed\s*$/i.test(n.title || '');

  async function runAiOrganize(id = selectedId) {
    const n = byId.get(id);
    if (!canOrganize(n)) return;
    if (aiOrg && (aiOrg.status === 'loading' || aiOrg.status === 'applying')) return;
    await selectNote(id); // the plan is about this section (also flushes edits)
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
    // the normal onChange -> dirty -> interval-save path.
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

  async function createNoteApi(title, parentId, kind = 'note') {
    const res = await fetch('/api/notebook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, parentId: parentId || null, kind }),
    });
    if (!res.ok) throw new Error('bad status');
    const { note } = await res.json();
    saved.current.set(note.id, { title: note.title || '', body: note.body || '', fields: JSON.stringify(note.fields || {}) });
    return note;
  }

  // New page under a parent - or, with no parent, a new section. A section is
  // a name-only container, so it is always created together with its first
  // page, and the page (the writing surface) is what opens.
  //
  // THE KIND IS CHOSEN HERE, at the moment the page is made, which is the
  // whole point: a referral card is a referral card because somebody said so,
  // not because of the folder it landed in. It is named for what it is, so the
  // tree reads sensibly before anybody has typed a word into it.
  async function newNote(parentId, kind = 'note') {
    await flush();
    const def = noteKind(kind);
    const name = isTypedKind(def.id) ? 'New ' + def.label.toLowerCase() : 'New page';
    try {
      if (parentId) {
        const note = await createNoteApi(name, parentId, def.id);
        setNotes((ns) => ns.concat([note]));
        setExpanded((e) => ({ ...e, [parentId]: true }));
        setSelectedId(note.id);
      } else {
        const section = await createNoteApi('New section', null);
        const page = await createNoteApi(name, section.id, def.id);
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
    } catch (e) { /* ignore - the note simply stays where it was */ }
  }

  // Rename = select the note, then put the caret in the header title input.
  async function renameNote(id) {
    await selectNote(id);
    setTimeout(() => { if (titleInput.current) { titleInput.current.focus(); titleInput.current.select(); } }, 0);
  }

  /**
   * Change what a page IS.
   *
   * A deliberate act, never an autosave and never something a folder does to
   * the pages inside it. The page's own writing is untouched: converting prose
   * into a card keeps the prose underneath, which is where the differences
   * from the standard process live.
   *
   * What the two kinds share is kept and the rest is dropped, by the server -
   * see setNoteKind in lib/notebook.js.
   */
  async function setNoteKindApi(id, kind) {
    await flush();
    try {
      const res = await fetch('/api/notebook', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, kind }),
      });
      if (!res.ok) throw new Error('bad status');
      const { note } = await res.json();
      saved.current.set(note.id, { title: note.title || '', body: note.body || '', fields: JSON.stringify(note.fields || {}) });
      setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, kind: note.kind, fields: note.fields || {}, status: note.status } : n)));
    } catch (e) {
      setUploadErr('Could not change what this page is.');
    }
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
        setConfirm({ title: 'Import failed', message: 'That file is not a notebook backup (no notes found).', confirmLabel: 'OK', tone: 'info', soleButton: true, onConfirm: () => setConfirm(null) });
        return;
      }
      setConfirm({
        title: 'Import backup',
        message: 'Import ' + count + ' note(s) from "' + file.name + '"? They are added alongside your existing notes. Nothing is overwritten.',
        confirmLabel: 'Import',
        tone: 'info',
        onConfirm: async () => {
          setConfirm(null);
          await runImport(data, count);
        },
      });
    };
    reader.readAsText(file);
  }

  /**
   * Post a backup and follow it, line by line, while it is restored.
   *
   * The route streams one JSON object per step (see /api/notebook/import). Two
   * of them change what is on screen rather than just the number: `ready` means
   * the pages are in and the tree can be reloaded - so the reader has their
   * notebook back before the indexing that follows it has finished - and
   * `error` is the failure, which arrives as a line because by then the
   * response has already started and cannot be a status code.
   */
  async function runImport(data, count) {
    setImporting({ phase: 'notes', done: 0, total: count });
    let failed = '';
    let reloaded = false;
    try {
      const res = await fetch('/api/notebook/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      await readProgress(res, (step) => {
        if (step.phase === 'ready') {
          // The notebook is usable now. Show it, and let the indexing that
          // follows run under a bar the reader is free to ignore.
          if (!reloaded) { reloaded = true; reloadAll(); }
          setImporting({ phase: 'indexing', done: 0, total: 0 });
          return;
        }
        if (step.phase === 'done') return;
        setImporting({ phase: step.phase, done: Number(step.done) || 0, total: Number(step.total) || 0 });
      });
    } catch (err) {
      failed = String(err.message || err);
    }
    if (!reloaded) await reloadAll();
    setImporting(null);
    if (failed) setConfirm({ title: 'Import failed', message: failed, confirmLabel: 'OK', tone: 'danger', soleButton: true, onConfirm: () => setConfirm(null) });
  }

  /* ---------------------------- The note menu -------------------------- */

  // Right-click a row, or click the "..." on a row or in the page header:
  // one menu, opened at the pointer or under the button that asked for it.
  function openMenu(e, id, fromButton = false) {
    e.preventDefault();
    e.stopPropagation(); // keep the window-level close handler from eating the new menu
    // Where it would like to be, and where its bottom goes if there is no room
    // below. The menu measures itself against the window and does the rest.
    if (fromButton && e.currentTarget && e.currentTarget.getBoundingClientRect) {
      const r = e.currentTarget.getBoundingClientRect();
      setMenu({ id, x: r.right - 232, y: r.bottom + 6, flipY: r.top - 6 });
      return;
    }
    setMenu({ id, x: e.clientX, y: e.clientY, flipY: e.clientY });
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
  /* ---------------------------- Toolbar model -------------------------- */

  const toolbar = [
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
      { title: 'Delete row', run: () => chain().deleteRow().run(), label: 'Row off' },
      { title: 'Delete column', run: () => chain().deleteColumn().run(), label: 'Col off' },
      { title: 'Delete table', run: () => chain().deleteTable().run(), label: 'Table off' },
    ] : []),
    null,
    { title: 'AI format: restructure this note into headings, lists, tables and highlights (you confirm the changes first)', run: runAiFormat, icon: Icons.sparkle, accent: true, label: 'AI format' },
  ];

  /* ------------------------------ Render ------------------------------- */

  const menuNote = menu ? byId.get(menu.id) : null;

  return (
    <div className="riva-page-fill nbk-shell">
      <NotebookStyles />
      {/* dangerouslySetInnerHTML: a plain text child is HTML-escaped on the
          server and not on the client, which is a hydration mismatch. */}
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      <AppHeader subtitle="Notebook" />

      <div className="nbk-body">
        {/* ------------------------- Sidebar ------------------------- */}
        <aside className="nbk-sidebar">
          <div className="nbk-sidebar__top">
            {/* Pages is the editor; Map is the treemap of every page and what
                the assistant makes of it. Same notes, two readings of them. */}
            <Tabs block ariaLabel="Notebook view" value={view} onChange={setView}
              items={[{ id: 'pages', label: 'Pages', icon: Icons.fileLines }, { id: 'map', label: 'Map', icon: NBIcons.layers }]} />
            <div className="nbk-sidebar__row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <SearchField value={search} onChange={setSearch} placeholder="Search notes" />
              </div>
              <Button variant="primary" icon={Icons.plus} onClick={() => newNote(null)}
                title="New section (with its first page)">New</Button>
            </div>
          </div>

          <div className="nbk-tree nbk-scroll">
            {status === 'loading' && <div style={{ padding: '10px 8px', fontSize: '13.5px', color: T.dim }}>Loading...</div>}
            {status === 'error' && <div style={{ padding: '10px 8px', fontSize: '13.5px', color: T.red }}>Could not load notes. Is the database configured?</div>}
            {status === 'ready' && sections.length === 0 && (
              <div style={{ padding: '10px 8px', fontSize: '13.5px', lineHeight: 1.55, color: T.dim }}>
                {q ? 'No notes match your search.' : 'No sections yet. Create one, for example "Instructions", with pages like "How to book appointments".'}
              </div>
            )}
            {sections.map((n) => <SideRow key={n.id} n={n} depth={0} ctx={rowCtx} />)}
          </div>

          <div className="nbk-sidebar__foot">
            <span className="nbk-sidebar__note">
              <Svg w={13} sw={2.2} stroke={T.green} style={{ flex: 'none' }}>{Icons.shield}</Svg>
              Notes are used by the assistant automatically.
            </span>
            {/* Backup: export downloads every note as JSON; import restores it
                alongside what is here. Saves is the whole notebook at a moment. */}
            <input ref={importInput} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={onImportFile} />
            <div className="nbk-foot-grid">
              <Button size="sm" icon={NBIcons.download} onClick={() => { window.location.href = '/api/notebook/export'; }}
                title="Download all notes as a JSON backup">Export</Button>
              <Button size="sm" icon={NBIcons.upload} onClick={() => importInput.current && importInput.current.click()}
                title="Restore notes from a JSON backup (added alongside existing notes)">Import</Button>
            </div>
            <Button size="sm" block icon={Icons.undo} onClick={() => { window.location.href = '/notebook/saves'; }}
              title="Saves of the whole notebook - take one, or roll back to one">Saves and rollback</Button>
          </div>
        </aside>

        {/* -------------------------- Notes area -------------------------- */}
        <main className="nbk-main" {...dropHandlers}>
          {view === 'map' && (
            <MapView notes={notes} onOpenPage={(id) => { setView('pages'); selectNote(id); }} onChanged={reloadAll} />
          )}

          {view !== 'map' && (<>
            <div className="nbk-head">
              <div className="nbk-head__left">
                {selected && ancestors.length > 0 && (
                  <div className="nbk-head__crumbs">
                    {ancestors.map((a, i) => (
                      <React.Fragment key={a.id}>
                        {i > 0 && <Svg w={11} sw={2.4} style={{ flex: 'none', color: '#b6c2c9' }}>{Icons.chevronRight}</Svg>}
                        <button type="button" className="nbk-crumb" onClick={() => selectNote(a.id)}>{a.title || 'Untitled'}</button>
                      </React.Fragment>
                    ))}
                  </div>
                )}
                {selected ? (
                  <input
                    ref={titleInput}
                    className="nbk-title-input"
                    value={selected.title || ''}
                    onChange={(e) => editSelected({ title: e.target.value })}
                    placeholder={isSection ? 'Section name' : 'Page title'}
                    aria-label={isSection ? 'Section name' : 'Page title'}
                    title="Click to rename"
                  />
                ) : (
                  <span style={{ padding: '4px 6px', fontSize: '17px', fontWeight: 700, color: T.dim }}>Notebook</span>
                )}
              </div>

              <div className="nbk-head__actions">
                <StatusPill state={saveState} />
                {selected && canOrganize(selected) && (
                  <Button icon={Icons.sparkle} onClick={() => runAiOrganize()}
                    disabled={!!aiOrg && (aiOrg.status === 'loading' || aiOrg.status === 'applying')}
                    title="AI organise: move every page's content in this section to the section it belongs in (you review the plan first)">
                    AI organise
                  </Button>
                )}
                {selected && !isSection && (
                  <>
                    <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={(e) => uploadFiles(e.target.files)} />
                    <IconButton icon={Icons.paperclip} label="Attach files" disabled={uploading}
                      onClick={() => fileInput.current && fileInput.current.click()} />
                  </>
                )}
                {selected && (
                  <IconButton icon={NBIcons.dots} label="More actions" onClick={(e) => openMenu(e, selected.id, true)} />
                )}
              </div>
            </div>

            {!selected && (
              <EmptyState icon={Icons.book} title="Nothing open"
                body="Pick a page on the left, or create a section to start writing. Everything written here is what the assistant answers from."
                action={<Button variant="primary" icon={Icons.plus} onClick={() => newNote(null)}>New section</Button>} />
            )}

            {/* Section view - name only; content lives in the pages beneath it. */}
            {selected && isSection && (
              <div className="nbk-section nbk-scroll">
                <div className="nbk-section__inner">
                  <p style={{ margin: '0 0 2px', fontSize: '13.5px', lineHeight: 1.6, color: T.dim }}>
                    Sections only have a name. They organise pages, and the assistant uses this grouping to navigate
                    the notebook. Write the content in a page below.
                  </p>
                  {sectionPages.map((p) => (
                    <button key={p.id} type="button" className="nbk-page-card" onClick={() => selectNote(p.id)}>
                      <Svg w={17} sw={2} style={{ flex: 'none', color: T.blue }}>
                        {isTypedKind(p.kind) ? (Icons[noteKind(p.kind).icon] || Icons.fileLines) : Icons.fileLines}
                      </Svg>
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.title || 'Untitled'}
                      </span>
                      <KindChip kind={p.kind} draft={String(p.status || 'live') === 'draft'} />
                      {/* "Empty" is about a page with nothing written on it. A
                          card's writing is optional - its values are the page -
                          so it is never said of one. */}
                      {isTypedKind(p.kind) || (p.body || '').trim() ? null : <span style={{ flex: 'none', fontSize: '12px', fontWeight: 600, color: T.dim }}>Empty</span>}
                      <Svg w={15} sw={2.2} style={{ flex: 'none', color: '#b6c2c9' }}>{Icons.chevronRight}</Svg>
                    </button>
                  ))}
                  <button type="button" className="nbk-add-card" onClick={() => newNote(selected.id)}>
                    <Svg w={15} sw={2.4}>{Icons.plus}</Svg>New page
                  </button>
                </div>
              </div>
            )}

            {/* Page view - the title is in the header above; everything here is
                the writing surface, with files docked underneath it. */}
            {selected && !isSection && (
              <>
                <div className="nbk-toolbar" onMouseDown={(e) => e.preventDefault() /* keep the editor selection */}>
                  {toolbar.map((btn, i) => btn === null
                    ? <span key={'sep' + i} className="nbk-tsep" />
                    : (
                      <button key={btn.title} type="button" aria-label={btn.title} title={btn.title}
                        aria-pressed={btn.active ? true : undefined}
                        onClick={() => { if (!editor && !btn.accent) return; btn.run(); }}
                        className={'nbk-tbtn' + (btn.active ? ' nbk-tbtn--on' : '') + (btn.accent ? ' nbk-tbtn--accent' : '')}>
                        {btn.swatch
                          ? <span className="nbk-swatch" style={{ background: btn.swatch, boxShadow: '0 0 0 1px ' + (btn.active ? T.blue : T.line) }} />
                          : btn.icon ? <Svg w={16} sw={2}>{btn.icon}</Svg> : null}
                        {btn.label ? <span>{btn.label}</span> : null}
                      </button>
                    ))}
                </div>

                {/* THE CARD, ABOVE THE WRITING. The recorded values are what
                    the reader came for and what the assistant answers from;
                    the prose underneath is what is different about this one.
                    Both are saved the same way, by the same autosave. */}
                {isTypedKind(selected.kind) && (
                  <div className="nbk-editor nbk-scroll" style={{ display: 'block' }}>
                    {selectedIssues.length > 0 && (
                      <div style={{ margin: '18px 20px 0' }}>
                        <Banner tone="warn" icon={Icons.alertCircle}>
                          <strong>Not finished, so the assistant is not answering from this yet.</strong>{' '}
                          {selectedIssues.map((i) => i.message).join(' ')}
                        </Banner>
                      </div>
                    )}
                    <div className="nbk-card-wrap">
                      {/* NOT NORMALISED ON EVERY KEYSTROKE. normaliseFields
                          drops empty values, which is right for what is stored
                          and wrong for what is being typed: an empty row added
                          to a list was deleted before anybody could type into
                          it. The server coerces on save (updateNote), which is
                          the one place it has to be true. */}
                      <CardEditor kind={selected.kind} fields={selectedFields} issues={selectedIssues}
                        onChange={(next) => editSelected({ fields: next })} />
                    </div>
                    <div className="nbk-card__prose">Differences from the standard process, and anything else worth saying</div>
                    <PageEditor
                      key={selected.id}
                      initialBody={selected.body || ''}
                      onChange={(md) => editSelected({ body: md })}
                      onReady={setEditor}
                      uploadImage={uploadInlineImage}
                    />
                  </div>
                )}

                {/* A PAGE THAT LOOKS LIKE A CARD. A deterministic check on the
                    words the practice already writes - no model, no tokens -
                    offering the conversion. It never converts anything: a
                    suggestion that acted on its own would be the folder
                    inheritance this replaced, wearing a different hat. */}
                {!isTypedKind(selected.kind) && suggested && (
                  <div style={{ padding: '14px 20px 0' }}>
                    <Banner tone="info" icon={Icons.sparkle}
                      actions={<Button variant="primary" size="sm" onClick={() => setNoteKindApi(selected.id, suggested)}>
                        Convert
                      </Button>}>
                      This page reads like {noteKind(suggested).label === 'e-RS referral' ? 'an' : 'a'}{' '}
                      <strong>{noteKind(suggested).label}</strong>. Converting it puts the values in their own
                      boxes and keeps everything written here underneath.
                    </Banner>
                  </div>
                )}

                {!isTypedKind(selected.kind) && (
                  <PageEditor
                    key={selected.id}
                    initialBody={selected.body || ''}
                    onChange={(md) => editSelected({ body: md })}
                    onReady={setEditor}
                    uploadImage={uploadInlineImage}
                  />
                )}

                {(selectedFiles.length > 0 || uploadErr || uploading) && (
                  <div className="nbk-dock">
                    {selectedFiles.map((a) => (
                      <span key={a.id} className="nbk-attach">
                        <Svg w={14} sw={2} style={{ flex: 'none', color: T.blue }}>
                          {(a.contentType || '').startsWith('image/') ? Icons.image : Icons.file}
                        </Svg>
                        <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.filename + (a.size ? ' - ' + fmtSize(a.size) : '')}>
                          {a.filename}
                        </a>
                        <IconButton plain size="sm" tone="danger" icon={Icons.close} label={'Remove ' + a.filename}
                          onClick={() => askRemoveAttachment(a)} />
                      </span>
                    ))}
                    {uploading && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: T.dim }}><Spinner w={13} />Uploading...</span>}
                    {uploadErr && <span style={{ fontSize: '13px', fontWeight: 600, color: T.red }}>{uploadErr}</span>}
                  </div>
                )}
              </>
            )}

            {/* Drop overlay */}
            {dragging && selected && !isSection && (
              <div className="nbk-dropzone">
                <Svg w={22} sw={2.2}>{Icons.paperclip}</Svg>
                Drop files to attach to &ldquo;{selected.title || 'Untitled'}&rdquo;
              </div>
            )}
          </>)}
        </main>
      </div>
      {/* ---------------------------- The note menu --------------------------- */}
      {menu && menuNote && (
        <Menu x={menu.x} y={menu.y} flipY={menu.flipY} width={232}>
          <MenuItem icon={Icons.edit} onClick={() => { setMenu(null); renameNote(menu.id); }}>Rename</MenuItem>

          {/* NEW, BY WHAT IT IS. The kind is chosen here, at the moment the
              page is made, and it is the whole of what decides how the page is
              filled in, checked and answered from. There is no second step and
              no folder to put it in the right place - that is what the tag it
              replaced got wrong. */}
          <MenuSeparator />
          <MenuLabel>New inside</MenuLabel>
          {CREATABLE_KINDS.map((k) => (
            <MenuOption key={k.id} label={k.id === 'note' ? 'Note' : k.label} help={k.summary}
              colour={k.colour} hollow={k.id === 'note'} swatch={k.colour.ink}
              onClick={() => { setMenu(null); newNote(menu.id, k.id); }} />
          ))}

          <MenuSeparator />
          {canOrganize(menuNote) && (
            <MenuItem icon={Icons.sparkle} tone="accent" onClick={() => { setMenu(null); runAiOrganize(menu.id); }}>AI organise</MenuItem>
          )}
          {menuNote.parentId ? (
            <MenuItem icon={menuNote.isSection ? Icons.fileLines : Icons.book}
              onClick={() => { setMenu(null); toggleSection(menu.id, !menuNote.isSection); }}>
              {menuNote.isSection ? 'Convert to page' : 'Convert to section'}
            </MenuItem>
          ) : null}

          {/* WHAT THIS PAGE IS. Only on a page: a section is a name-only
              container with nothing to fill in, and offering to make one a
              referral would be offering something the server refuses.
              Converting keeps the page's writing and re-coerces its values to
              the new kind, so what the two share survives and the rest goes. */}
          {menuNote.parentId && !menuNote.isSection ? (
            <>
              <MenuSeparator />
              <MenuLabel>This page is</MenuLabel>
              {CREATABLE_KINDS.map((k) => (
                <MenuOption key={k.id} label={k.id === 'note' ? 'A note' : k.label} help={k.summary}
                  colour={k.colour} hollow={k.id === 'note'} swatch={k.colour.ink}
                  selected={String(menuNote.kind || 'note') === k.id}
                  onClick={() => { setMenu(null); setNoteKindApi(menu.id, k.id); }} />
              ))}
            </>
          ) : null}

          <MenuSeparator />
          <MenuItem icon={Icons.trash} tone="danger" onClick={() => { setMenu(null); askRemoveNote(menu.id); }}>
            {menuNote.parentId && !menuNote.isSection ? 'Delete page' : 'Delete section'}
          </MenuItem>
        </Menu>
      )}

      {/* --------------------------- AI format review -------------------------- */}
      {aiFmt && aiFmt.status === 'loading' && (
        <Modal size="sm" icon={Icons.sparkle} title="Reformatting the page" dismissable={false}
          subtitle="Restructuring it into headings, lists, tables and highlights. Nothing is saved until you have read it.">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0 12px', color: T.mut }}>
            <Spinner />Working...
          </div>
        </Modal>
      )}
      {aiFmt && aiFmt.status === 'error' && (
        <Modal size="sm" tone="warn" icon={Icons.alertCircle} title="Could not reformat" onClose={() => setAiFmt(null)}
          footer={<Button variant="primary" onClick={() => setAiFmt(null)}>Close</Button>}>
          <p style={{ margin: 0 }}>{aiFmt.message}</p>
        </Modal>
      )}
      {aiFmt && aiFmt.status === 'ready' && (
        <Modal size="lg" icon={Icons.sparkle} title="Proposed reformat"
          subtitle="Headings, lists, tables and highlights. Every fact is kept, and nothing is saved until you apply."
          onClose={() => setAiFmt(null)} flush
          footer={<>
            <Button variant="ghost" onClick={() => setAiFmt(null)}>Cancel</Button>
            <Button variant="success" icon={Icons.check} onClick={applyAiFormat}>Apply changes</Button>
          </>}>
          <div className="nbk-diff" style={{ padding: '12px 0' }}>
            {aiFmt.diff.map((l, i) => (
              <div key={i} className={'nbk-diff__line' + (l.t === '-' ? ' nbk-diff__line--del' : l.t === '+' ? ' nbk-diff__line--add' : '')}>
                <span className="nbk-diff__gutter">{l.t === ' ' ? '' : l.t}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{l.s || ' '}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* --------------------------- AI organise plan -------------------------- */}
      {aiOrg && (aiOrg.status === 'loading' || aiOrg.status === 'applying') && (
        <Modal size="sm" icon={Icons.sparkle} dismissable={false}
          title={aiOrg.status === 'loading' ? 'Reading this section' : 'Moving the content'}
          subtitle={aiOrg.status === 'loading'
            ? 'Every page in it is read and each part is matched to the section it belongs in.'
            : 'Putting each part where the plan says, and moving its files with it.'}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0 12px', color: T.mut }}>
            <Spinner />Working...
          </div>
        </Modal>
      )}
      {aiOrg && aiOrg.status === 'error' && (
        <Modal size="sm" tone="warn" icon={Icons.alertCircle} title="Could not organise" onClose={() => setAiOrg(null)}
          footer={<Button variant="primary" onClick={() => setAiOrg(null)}>Close</Button>}>
          <p style={{ margin: 0 }}>{aiOrg.message}</p>
        </Modal>
      )}
      {aiOrg && aiOrg.status === 'done' && (
        <Modal size="sm" tone="success" icon={Icons.check} title="Organised" onClose={() => setAiOrg(null)}
          footer={<Button variant="primary" onClick={() => setAiOrg(null)}>Done</Button>}>
          <p style={{ margin: 0 }}>
            {'Moved the content of ' + (aiOrg.applied.moved || 0) + ' page(s)'
              + ((aiOrg.applied.newSections || 0) ? ', created ' + aiOrg.applied.newSections + ' section(s)' : '')
              + ((aiOrg.applied.newPages || 0) ? ', created ' + aiOrg.applied.newPages + ' page(s)' : '')
              + ((aiOrg.applied.removed || 0) ? ', removed ' + aiOrg.applied.removed + ' emptied page(s)' : '') + '.'}
          </p>
        </Modal>
      )}
      {aiOrg && aiOrg.status === 'ready' && (
        <Modal size="lg" icon={Icons.sparkle} title="Where each page's content will go"
          subtitle="Every fact is kept; emptied pages are removed and their files move with the content. Nothing changes until you apply."
          onClose={() => setAiOrg(null)}
          footer={<>
            <Button variant="ghost" onClick={() => setAiOrg(null)}>Cancel</Button>
            <Button variant="success" icon={Icons.check} onClick={applyAiOrganize}>Apply plan</Button>
          </>}>
          <div>
            {aiOrg.plan.allocations.map((a) => (
              <div key={a.noteId} className="nbk-plan__note">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14.5px', fontWeight: 700, color: T.ink }}>
                  <Svg w={15} sw={2} style={{ flex: 'none', color: T.dim }}>{Icons.fileLines}</Svg>
                  {a.noteTitle || 'Untitled'}
                </div>
                {a.parts.map((p, i) => (
                  <div key={i} className="nbk-plan__part">
                    <Svg w={14} sw={2.2} style={{ flex: 'none', marginTop: '3px', color: T.blue }}>{Icons.arrow}</Svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 600, color: T.navy }}>
                        {p.section}{p.isNewSection ? ' (new section)' : ''}
                        <span style={{ color: T.dim, margin: '0 6px' }}>/</span>
                        {p.page || a.noteTitle || 'Untitled'}{p.isNewPage ? ' (new page)' : ''}
                      </div>
                      {/* A title that names a container rather than a question.
                          Said here because renaming it now costs nothing, and
                          renaming it after the page has grown for six months
                          costs a morning. */}
                      {p.isVagueTitle && (
                        <div style={{ marginTop: '4px', fontSize: '12px', fontWeight: 600, color: '#8a6100' }}>
                          Vague title - rename it to the question staff would ask, or search will never pick it precisely
                        </div>
                      )}
                      <div style={{ marginTop: '4px', fontSize: '12.5px', lineHeight: 1.55, color: T.mut, overflow: 'hidden',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {p.markdown.replace(/<[^>]+>/g, '').replace(/[#*>`|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 240)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* An import in progress. A modal rather than a corner toast: restoring a
          backup rewrites what is on the left of the screen, and clicking about
          in the tree while that happens is how a second import gets started. */}
      {importing && (
        <ProgressModal title="Restoring the notebook" message={phaseLabel(importing.phase)}
          done={Math.min(Number(importing.done) || 0, Number(importing.total) || Infinity)}
          total={Number(importing.total) || 0}
          unit={importing.phase === 'attachments' ? 'files' : 'pages'}
          footnote={importing.phase === 'indexing'
            ? 'Your pages are already back and the assistant can read them. This last step files them for the knowledge tools.'
            : null} />
      )}

      {confirm && (
        <ConfirmModal title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel}
          tone={confirm.tone || 'danger'} soleButton={confirm.soleButton} onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}