'use client';

/* ------------------------------------------------------------------ *
 * Questions on a Notebook page.
 *
 * Highlight some words and a small "Ask a question" button appears over
 * them; ask, and the words are marked - tinted amber with a "?" after
 * them - until somebody answers, when the tint turns green and the "?" a
 * tick. Click the words to read the question and write or change the
 * answer. The answer stays with the question; the page's text is not
 * touched until somebody uses Format with AI with "include questions",
 * which writes the answers in and takes their markers off.
 *
 * WHAT LIVES WHERE. The page carries only a marker round the words,
 * <span data-q="anchor"> (lib/notebook/questions.mjs), saved by the
 * page's own autosave and so moved, copied and undone with the words.
 * The question and its answer are rows in the open-questions table
 * (/api/notebook/questions), so they are on /questions as well, and the
 * assistant - which reads the page with the markers taken out - never
 * sees either.
 *
 * WHICH QUESTIONS A PAGE SHOWS. Every question whose marker is on the
 * page, open or answered, plus any open question whose words have since
 * gone from the page ("detached"), so it is not lost. An answered question
 * whose marker has gone has been written in, or its words deleted, and is
 * finished with as far as the page is concerned.
 * ------------------------------------------------------------------ */

import React from 'react';
import { createPortal } from 'react-dom';
import { Mark, mergeAttributes } from '@tiptap/core';
import { Svg, Icons } from '../ui';
import { Button, IconButton, Menu, MenuItem, T } from './kit';
import { QUESTION_ATTR, isQuestionAnchor, newQuestionAnchor } from '@/lib/notebook/questions.mjs';

/**
 * The marker, as a TipTap mark: a <span data-q="..."> and nothing else, so
 * the Markdown extension writes it to the stored body exactly so.
 *
 * Priority above every other mark keeps it outermost, which is what makes a
 * marked phrase with a bold word in it one element (one tint, one "?")
 * rather than three. Not inclusive: typing on at the end of the words is
 * new writing, not more of what was asked about.
 */
export const QuestionMark = Mark.create({
  name: 'question',
  priority: 1100,
  inclusive: false,
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute(QUESTION_ATTR),
        renderHTML: (attrs) => (attrs.id ? { [QUESTION_ATTR]: attrs.id } : {}),
      },
    };
  },
  // Ahead of TextStyle's span rule (50), which only takes spans with a style.
  parseHTML() { return [{ tag: 'span[' + QUESTION_ATTR + ']', priority: 60 }]; },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes), 0]; },
});

/** Take one question's marker off every stretch of the page that carries it. */
export function removeQuestionMark(editor, anchor) {
  if (!editor) return;
  const type = editor.schema.marks.question;
  const { tr, doc } = editor.state;
  doc.descendants((node, pos) => {
    if (!node.isInline) return;
    const mark = node.marks.find((m) => m.type === type && m.attrs.id === anchor);
    if (mark) tr.removeMark(pos, pos + node.nodeSize, mark);
  });
  if (tr.docChanged) editor.view.dispatch(tr);
}

/** Which of a page's questions to show, given the anchors its body carries. */
export function pageQuestions(rows, anchors) {
  const onPage = new Set(anchors);
  return (rows || [])
    .filter((r) => onPage.has(r.anchor) || (r.status === 'open' && !r.writtenAt))
    .map((r) => ({ ...r, detached: !onPage.has(r.anchor) }));
}

const when = (at) => {
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// The tint, underline and badge on marked words, one rule per known anchor:
// a marker whose question has been removed (or never saved) draws nothing.
// Anchors are checked against their own shape before they go anywhere near a
// selector - they come out of page text anybody can edit.
function markerCss(rows, active) {
  const sel = (list) => list.filter((r) => isQuestionAnchor(r.anchor)).map((r) => '.nbk-prose [data-q="' + r.anchor + '"]');
  const open = sel(rows.filter((r) => r.status !== 'answered'));
  const done = sel(rows.filter((r) => r.status === 'answered'));
  const on = isQuestionAnchor(active) ? '.nbk-prose [data-q="' + active + '"]' : '';
  let css = '';
  if (open.length) {
    css += open.join(',') + '{background:#fff3d6;box-shadow:inset 0 -2px 0 #f0b429;border-radius:3px 3px 0 0;'
      + 'box-decoration-break:clone;-webkit-box-decoration-break:clone;transition:background-color .15s ease;}';
    css += open.map((s) => s + '::after').join(',') + '{content:"?";background:#c27c0e;}';
  }
  if (done.length) {
    css += done.join(',') + '{background:#eaf6ef;box-shadow:inset 0 -2px 0 #8fcaa6;border-radius:3px 3px 0 0;'
      + 'box-decoration-break:clone;-webkit-box-decoration-break:clone;transition:background-color .15s ease;}';
    css += done.map((s) => s + '::after').join(',') + '{content:"✓";background:#007f3b;}';
  }
  if (open.length || done.length) {
    css += [...open, ...done].map((s) => s + '::after').join(',')
      + '{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;margin:0 2px 0 3px;'
      + 'border-radius:50%;color:#fff;font-size:10px;font-weight:800;line-height:1;vertical-align:2px;cursor:pointer;'
      + 'font-family:inherit;font-style:normal;text-decoration:none;user-select:none;}';
  }
  if (on) css += on + '{background:#ffe3a3;}';
  return css;
}

const LAYER_CSS = `
.nbk-qask{position:fixed;z-index:120;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px 0 10px;
  border:1px solid #e7c26b;border-radius:999px;background:#fffaf0;color:#8a5a00;font:inherit;font-size:13px;font-weight:700;
  box-shadow:var(--nbk-sh-2);cursor:pointer;transform:translate(-50%,-100%);animation:nbk-qin .14s var(--nbk-ease);white-space:nowrap;}
.nbk-qask:hover{background:#fff3d6;border-color:#d9a441;}
.nbk-qask:focus-visible{outline:2px solid var(--nbk-blue);outline-offset:2px;}
@keyframes nbk-qin{from{opacity:0;margin-top:4px;}to{opacity:1;margin-top:0;}}
.nbk-qcard{position:fixed;z-index:120;width:340px;max-width:calc(100vw - 24px);padding:14px;border-radius:16px;background:#fff;
  border:1px solid #e1e8ec;box-shadow:var(--nbk-sh-3);animation:nbk-qin .16s var(--nbk-ease);font-size:14px;color:var(--nbk-ink);}
.nbk-qcard__top{display:flex;align-items:center;gap:8px;margin:-2px -4px 8px 0;}
.nbk-qcard__state{flex:1;display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;}
.nbk-qcard__quote{margin:0 0 8px;padding-left:9px;border-left:3px solid #f0c674;font-size:13px;line-height:1.45;color:var(--nbk-mut);
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.nbk-qcard__q{font-size:15px;font-weight:700;line-height:1.4;overflow-wrap:anywhere;}
.nbk-qcard__meta{margin-top:3px;font-size:12px;color:var(--nbk-dim);}
.nbk-qcard__answer{margin-top:10px;padding:9px 11px;border-radius:10px;background:#f0f7f2;border:1px solid #cce4d6;
  font-size:14px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;}
.nbk-qcard__answer b{display:block;margin-bottom:2px;font-size:11px;letter-spacing:.05em;color:var(--nbk-green);}
.nbk-qcard__note{margin-top:10px;font-size:12.5px;line-height:1.45;color:var(--nbk-mut);}
.nbk-qcard textarea{display:block;width:100%;box-sizing:border-box;margin-top:10px;min-height:68px;max-height:220px;padding:8px 10px;
  border:1px solid var(--nbk-line);border-radius:10px;font:inherit;font-size:14px;line-height:1.45;color:var(--nbk-ink);resize:vertical;outline:none;}
.nbk-qcard textarea:focus{border-color:var(--nbk-blue);box-shadow:0 0 0 3px rgba(0,94,184,.14);}
.nbk-qcard__row{display:flex;align-items:center;gap:6px;margin-top:10px;}
.nbk-qcard__row .nbk-qcard__grow{flex:1;}
.nbk-qcard__err{margin-top:8px;font-size:12.5px;font-weight:600;color:var(--nbk-red);}
.nbk-qchip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px 0 6px;border-radius:999px;border:1px solid;
  font:inherit;font-size:11.5px;font-weight:700;letter-spacing:.01em;text-transform:none;cursor:pointer;}
.nbk-qchip--open{background:#fff5e0;border-color:#ecc77a;color:#8a5a00;}
.nbk-qchip--open:hover{background:#ffedc7;}
.nbk-qchip--done{background:#eaf6ef;border-color:#b4dcc4;color:#00612f;}
.nbk-qchip--done:hover{background:#dcf0e4;}
.nbk-qlist__q{display:block;font-size:13.5px;font-weight:650;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.nbk-qlist__sub{display:block;margin-top:1px;font-size:12px;font-weight:500;color:var(--nbk-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
@media (prefers-reduced-motion:reduce){.nbk-qask,.nbk-qcard{animation:none;}}
`;

async function call(method, body, query = '') {
  const res = await fetch('/api/notebook/questions' + query, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

// Everything that floats is drawn into <body>: the page's sheet is a
// containing block of its own (it animates in with a transform), which would
// put a fixed-position box at the sheet's offset rather than the window's.
function Floating({ children }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => { setReady(true); }, []);
  return ready ? createPortal(children, document.body) : null;
}

/** A rectangle for the first stretch of the page carrying this anchor, or null. */
function markerRect(editor, anchor) {
  if (!editor || !isQuestionAnchor(anchor)) return null;
  const el = editor.view.dom.querySelector('[data-q="' + anchor + '"]');
  return el ? el.getBoundingClientRect() : null;
}

/** Where a 340px card goes beside a rectangle: below it, or above when there is no room. */
function cardPlace(rect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(12, Math.min(rect.left, vw - 352));
  return rect.bottom + 260 > vh && rect.top > 280
    ? { left, bottom: vh - rect.top + 8 }
    : { left, top: Math.min(rect.bottom + 8, vh - 60) };
}

/**
 * The questions layer of one open page: the marker styles, the button over a
 * highlight, the box to ask in, and the card for a question.
 *
 * `open` is { anchor, rect? } - rect only for a detached question, which has no
 * words on the page to sit beside. `jumpTo` is an anchor to scroll to and open
 * once the page and its questions are loaded (a link from /questions).
 */
export function QuestionLayer({ editor, noteId, rows, setRows, open, setOpen, jumpTo, onJumped }) {
  const [, redraw] = React.useReducer((x) => x + 1, 0);
  const [dragging, setDragging] = React.useState(false);
  const [asking, setAsking] = React.useState(null); // { from, to, quote, x, y, text, busy, error }
  const cardRef = React.useRef(null);

  // Everything here is placed against the window, so a scroll anywhere (the
  // page's own sheet scrolls) moves it.
  React.useEffect(() => {
    const onScroll = () => redraw();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onScroll); };
  }, []);

  // Clicking marked words opens their card. Only a click that leaves a caret:
  // a drag that starts on marked words is somebody selecting text.
  React.useEffect(() => {
    if (!editor) return undefined;
    const dom = editor.view.dom;
    const down = () => setDragging(true);
    const up = () => setDragging(false);
    const click = (e) => {
      const el = e.target && e.target.closest && e.target.closest('[data-q]');
      const anchor = el && el.getAttribute('data-q');
      if (!anchor || !rows.some((r) => r.anchor === anchor)) return;
      setTimeout(() => { if (editor.state.selection.empty) { setAsking(null); setOpen({ anchor }); } }, 0);
    };
    dom.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    dom.addEventListener('click', click);
    return () => {
      dom.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      dom.removeEventListener('click', click);
    };
  }, [editor, rows, setOpen]);

  // Typing closes a card that is only being glanced at - the writer has moved
  // on - but not one somebody is writing an answer in.
  React.useEffect(() => {
    if (!editor || !open) return undefined;
    const onUpdate = () => {
      if (cardRef.current && cardRef.current.contains(document.activeElement)) return;
      setOpen(null);
    };
    editor.on('update', onUpdate);
    return () => { editor.off('update', onUpdate); };
  }, [editor, open, setOpen]);

  // Escape, or a press anywhere that is not the card or marked words, closes it.
  React.useEffect(() => {
    if (!open && !asking) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(null); setAsking(null); } };
    const onDown = (e) => {
      if (cardRef.current && cardRef.current.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-q],.nbk-qchip,.nbk-menu')) return;
      setOpen(null);
      setAsking(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [open, asking, setOpen]);

  // A link from /questions: scroll the words into view and open the card.
  React.useEffect(() => {
    if (!jumpTo || !editor) return;
    const row = rows.find((r) => r.anchor === jumpTo);
    if (!row) return;
    const el = editor.view.dom.querySelector('[data-q="' + jumpTo + '"]');
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setOpen(el ? { anchor: jumpTo } : { anchor: jumpTo, rect: centreRect() });
    onJumped();
  }, [jumpTo, editor, rows]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------- the button over a highlight ------------------------- */
  let askButton = null;
  if (editor && !asking && !open && !dragging && editor.isEditable && editor.isFocused) {
    const { selection, doc } = editor.state;
    const { from, to } = selection;
    const isText = selection.toJSON().type === 'text';
    const quote = isText && from < to ? doc.textBetween(from, to, ' ', ' ').replace(/\s+/g, ' ').trim() : '';
    const taken = quote && editor.schema.marks.question && doc.rangeHasMark(from, to, editor.schema.marks.question);
    if (quote && !taken) {
      const a = editor.view.coordsAtPos(from);
      const b = editor.view.coordsAtPos(to);
      const top = Math.min(a.top, b.top);
      const x = a.top === b.top ? (a.left + b.right) / 2 : a.left + 60;
      askButton = {
        x: Math.max(80, Math.min(x, window.innerWidth - 80)), y: Math.max(64, top - 8), from, to, quote,
        // The box to ask in opens under the highlight, where the button was over it.
        rect: { left: a.left, top, bottom: Math.max(a.bottom, b.bottom) },
      };
    }
  }

  async function submitQuestion() {
    if (!asking || asking.busy) return;
    const text = asking.text.trim();
    if (!text) return;
    const anchor = newQuestionAnchor();
    setAsking((a) => ({ ...a, busy: true, error: '' }));
    try {
      const { row } = await call('POST', { noteId, anchor, quote: asking.quote, question: text });
      // The words may have moved while the box was open (they cannot be typed
      // into from here, but an image upload can land): clamp to the page.
      const size = editor.state.doc.content.size;
      const from = Math.min(asking.from, size);
      const to = Math.min(asking.to, size);
      if (from < to) {
        editor.chain().setTextSelection({ from, to }).setMark('question', { id: anchor }).setTextSelection(to).run();
      }
      setRows((rs) => [...rs, row]);
      setAsking(null);
    } catch (e) {
      setAsking((a) => (a ? { ...a, busy: false, error: String(e.message || e) } : a));
    }
  }

  const openRow = open ? rows.find((r) => r.anchor === open.anchor) : null;
  const openRect = open ? (open.rect || markerRect(editor, open.anchor)) : null;

  return (
    <>
      <style data-nbk-q="1" dangerouslySetInnerHTML={{ __html: LAYER_CSS + markerCss(rows, open && open.anchor) }} />

      <Floating>
      {askButton && (
        <button type="button" className="nbk-qask" style={{ left: askButton.x + 'px', top: askButton.y + 'px' }}
          onMouseDown={(e) => e.preventDefault() /* keep the highlight */}
          onClick={() => setAsking({ ...askButton, text: '', busy: false, error: '' })}>
          <Svg w={15} sw={2.2}>{Icons.question}</Svg>Ask a question
        </button>
      )}

      {asking && (
        <div ref={cardRef} className="nbk-qcard" role="dialog" aria-label="Ask a question about the highlighted words"
          style={placeStyle(cardPlace(asking.rect))}>
          <div className="nbk-qcard__quote">“{asking.quote}”</div>
          <textarea autoFocus value={asking.text} placeholder="What needs answering about this?"
            aria-label="Your question" maxLength={400}
            onChange={(e) => { const text = e.target.value; setAsking((a) => ({ ...a, text })); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQuestion(); } }} />
          {asking.error && <div className="nbk-qcard__err">{asking.error}</div>}
          <div className="nbk-qcard__row">
            <span className="nbk-qcard__grow" style={{ fontSize: '12px', color: T.dim }}>Also listed on Questions.</span>
            <Button variant="ghost" size="sm" onClick={() => setAsking(null)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={asking.busy} disabled={!asking.text.trim() || asking.busy}
              onClick={submitQuestion}>Ask</Button>
          </div>
        </div>
      )}

      {openRow && openRect && (
        <QuestionCard key={openRow.id} cardRef={cardRef} row={openRow} detached={!markerRect(editor, openRow.anchor)}
          style={placeStyle(cardPlace(openRect))}
          onClose={() => setOpen(null)}
          onSaved={(patch) => setRows((rs) => rs.map((r) => (r.id === openRow.id ? { ...r, ...patch } : r)))}
          onRemoved={() => {
            removeQuestionMark(editor, openRow.anchor);
            setRows((rs) => rs.filter((r) => r.id !== openRow.id));
            setOpen(null);
          }} />
      )}
      </Floating>
    </>
  );
}

function placeStyle(p) {
  const out = { left: p.left + 'px' };
  if (p.top != null) out.top = p.top + 'px';
  else out.bottom = p.bottom + 'px';
  return out;
}

function centreRect() {
  const x = Math.max(12, window.innerWidth / 2 - 170);
  const y = window.innerHeight / 3;
  return { left: x, right: x, top: y, bottom: y };
}

/* One question: what was asked, about which words, and its answer - or a box
   to write one in. */
function QuestionCard({ row, detached, style, cardRef, onClose, onSaved, onRemoved }) {
  const answered = row.status === 'answered';
  const [editing, setEditing] = React.useState(!answered);
  const [draft, setDraft] = React.useState(row.answer || '');
  const [busy, setBusy] = React.useState('');
  const [error, setError] = React.useState('');

  async function save(answer) {
    setBusy(answer ? 'save' : 'reopen');
    setError('');
    try {
      await call('PATCH', { id: row.id, answer });
      const text = answer.trim();
      onSaved(text
        ? { answer: text, status: 'answered', answeredAt: new Date().toISOString() }
        : { answer: '', status: 'open', answeredAt: null, writtenAt: null });
      setEditing(!text);
      if (!text) setDraft('');
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    setBusy('remove');
    setError('');
    try {
      await call('DELETE', null, '?id=' + encodeURIComponent(row.id));
      onRemoved();
    } catch (e) {
      setError(String(e.message || e));
      setBusy('');
    }
  }

  return (
    <div ref={cardRef} className="nbk-qcard" role="dialog" aria-label="Question" style={style}>
      <div className="nbk-qcard__top">
        <span className="nbk-qcard__state" style={{ color: answered ? T.green : '#8a5a00' }}>
          <Svg w={13} sw={2.6}>{answered ? Icons.check : Icons.question}</Svg>
          {answered ? 'Answered' : 'Open question'}
        </span>
        <IconButton plain size="sm" icon={Icons.close} label="Close" onClick={onClose} />
      </div>
      {row.quote && <div className="nbk-qcard__quote">“{row.quote}”</div>}
      <div className="nbk-qcard__q">{row.question}</div>
      <div className="nbk-qcard__meta">Asked {when(row.at)}{answered && row.answeredAt ? ' · answered ' + when(row.answeredAt) : ''}</div>

      {detached && (
        <div className="nbk-qcard__note">The words it was asked about are no longer on this page.</div>
      )}

      {answered && !editing && (
        <div className="nbk-qcard__answer"><b>ANSWER</b>{row.answer}</div>
      )}

      {editing ? (
        <>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000}
            placeholder="Write the answer..." aria-label="The answer"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && draft.trim()) save(draft); }} />
          {error && <div className="nbk-qcard__err">{error}</div>}
          <div className="nbk-qcard__row">
            <Button variant="ghost" size="sm" loading={busy === 'remove'} disabled={!!busy} onClick={remove}
              title="Delete the question and take its highlight off">Delete</Button>
            <span className="nbk-qcard__grow" />
            {answered && <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => { setDraft(row.answer || ''); setEditing(false); }}>Cancel</Button>}
            <Button variant="success" size="sm" icon={Icons.check} loading={busy === 'save'} disabled={!draft.trim() || !!busy}
              onClick={() => save(draft)}>Save answer</Button>
          </div>
        </>
      ) : (
        <>
          {error && <div className="nbk-qcard__err">{error}</div>}
          <div className="nbk-qcard__row">
            <Button variant="ghost" size="sm" loading={busy === 'remove'} disabled={!!busy} onClick={remove}
              title="Delete the question and take its highlight off">Delete</Button>
            <span className="nbk-qcard__grow" />
            <Button variant="ghost" size="sm" loading={busy === 'reopen'} disabled={!!busy} onClick={() => save('')}
              title="Not settled after all: clear the answer and reopen the question">Reopen</Button>
            <Button variant="soft" size="sm" icon={Icons.edit} disabled={!!busy} onClick={() => setEditing(true)}>Edit</Button>
          </div>
          <div className="nbk-qcard__note">Format with AI can write this answer into the page.</div>
        </>
      )}
    </div>
  );
}

/**
 * The page's questions, as a chip in the line above its title: how many are
 * open (or, when none are, how many are answered), and a click for the list.
 */
export function QuestionsChip({ questions, onPick }) {
  const [menu, setMenu] = React.useState(null);
  React.useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey); };
  }, [menu]);

  if (!questions.length) return null;
  const openCount = questions.filter((q) => q.status !== 'answered').length;
  const label = openCount
    ? openCount + (openCount === 1 ? ' open question' : ' open questions')
    : questions.length + (questions.length === 1 ? ' answered question' : ' answered questions');
  return (
    <>
      <button type="button" className={'nbk-qchip ' + (openCount ? 'nbk-qchip--open' : 'nbk-qchip--done')}
        aria-haspopup="menu" aria-expanded={!!menu}
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setMenu(menu ? null : { x: r.left, y: r.bottom + 6, flipY: r.top - 6, rect: r });
        }}>
        <Svg w={12} sw={2.6}>{openCount ? Icons.question : Icons.check}</Svg>{label}
      </button>
      {menu && (
        <Floating>
        <Menu x={menu.x} y={menu.y} flipY={menu.flipY} width={300}>
          {questions.map((q) => (
            <MenuItem key={q.id} icon={q.status === 'answered' ? Icons.check : Icons.question}
              onClick={() => { setMenu(null); onPick(q, menu.rect); }}>
              <span className="nbk-qlist__q" title={q.question}>{q.question}</span>
              <span className="nbk-qlist__sub">
                {q.detached ? 'Its words are no longer on the page' : q.quote ? '“' + q.quote + '”' : ''}
              </span>
            </MenuItem>
          ))}
        </Menu>
        </Floating>
      )}
    </>
  );
}
