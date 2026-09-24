'use client';

/* ------------------------------------------------------------------ *
 * /questions — the questions nobody has an answer for yet.
 *
 * TWO HALVES, ONE LIST. The box at the top is for a question the
 * assistant cannot answer because nothing in the practice's material
 * covers it — the thing that, before this page, was asked across the
 * back office and answered from memory or not at all. Underneath it is
 * the same list, plus every question the assistant was actually asked
 * and could not answer: those arrive on their own, off the question log,
 * so nobody has to notice them and write them down (lib/questions/gaps.mjs).
 *
 * WHY THE TWO BELONG TOGETHER. They are the same list read from two
 * ends. A gap somebody hits at the desk and a gap the assistant reports
 * are both "the practice has not written this down yet", and the only
 * useful thing to do with either is write the Notebook page. Splitting
 * them into two pages would have meant the half that writes itself is
 * the half nobody opens.
 *
 * AN ANSWER HERE IS NOT THE RECORD. The Notebook is. So an answered
 * question still says to write the page, and the answer sits under the
 * question where the next person to ask it can read it this afternoon —
 * which is the whole of what it is for.
 * ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { gapReason } from '../../lib/questions/gaps.mjs';
import { machineCode } from '../../lib/audit/machine';

const BOX = 'background:#fff;border:1px solid #dde4e7;border-radius:12px;';
const INPUT = 'width:100%;box-sizing:border-box;padding:10px 12px;font:inherit;font-size:16px;border:2px solid #d8dde0;border-radius:8px;background:#fff;color:#212b32;';
const PRIMARY = 'display:inline-flex;align-items:center;gap:8px;background:#005eb8;border:1px solid #005eb8;border-radius:8px;padding:9px 18px;font:inherit;font-size:15px;font-weight:600;color:#fff;cursor:pointer;';
const PRIMARY_HOVER = 'background:#003087;border-color:#003087;';
const QUIET = 'display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #d8e1e5;border-radius:8px;padding:7px 13px;font:inherit;font-size:13.5px;font-weight:600;color:#4c6272;cursor:pointer;';
const QUIET_HOVER = 'border-color:#005eb8;color:#005eb8;';

const FILTERS = [
  { id: 'open', label: 'Open', match: (r) => r.status === 'open' },
  { id: 'answered', label: 'Answered', match: (r) => r.status === 'answered' },
  { id: 'assistant', label: 'From the assistant', match: (r) => r.origin === 'assistant' },
  { id: 'asked', label: 'Asked here', match: (r) => r.origin === 'asked' },
  { id: 'all', label: 'All', match: () => true },
];

// Lucide "sparkles", the mark the Notebook's Format with AI button uses, so
// the AI actions in the app read as the same kind of thing.
const AI_ICON = (<><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" /></>);

// The shimmer shown while the model reads a paste: grey lines being scanned,
// then settling into question-shaped rows. Stops under reduced motion.
const EXTRACT_CSS = `
.rq-scan{position:relative;overflow:hidden;background:#fff;border:1px solid #dde4e7;border-radius:12px;padding:16px 18px;}
.rq-scan__line{height:8px;border-radius:4px;background:#e8edf0;margin:0 0 10px;}
.rq-scan__row{display:flex;align-items:center;gap:10px;margin:0 0 10px;opacity:0;animation:rq-row 2.4s ease-in-out infinite;}
.rq-scan__row i{flex:none;width:14px;height:14px;border-radius:4px;background:#005eb8;}
.rq-scan__row b{display:block;height:9px;border-radius:4px;background:#b9d3ee;}
.rq-scan__beam{position:absolute;left:0;right:0;top:0;height:40px;pointer-events:none;
  background:linear-gradient(180deg,transparent,rgba(0,94,184,.12) 60%,rgba(0,94,184,.3) 96%,transparent);
  animation:rq-beam 2.4s ease-in-out infinite;}
@keyframes rq-beam{0%{transform:translateY(-44px);opacity:0;}10%{opacity:1;}60%{transform:translateY(120px);opacity:1;}70%,100%{transform:translateY(120px);opacity:0;}}
@keyframes rq-row{0%,35%{opacity:0;transform:translateX(-6px);}55%,90%{opacity:1;transform:none;}100%{opacity:0;}}
@media (prefers-reduced-motion:reduce){.rq-scan__beam,.rq-scan__row{animation:none;opacity:1;}}
`;

function when(at) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* The small grey line under a question that says where it came from: who
   asked, how many times, and — for a question the assistant could not
   answer — which of the three ways it could not. */
function Provenance({ row }) {
  const reason = gapReason(row.reason);
  const bits = [when(row.lastAt || row.at)];
  if (row.askedCount > 1) bits.push('asked ' + row.askedCount + ' times');
  if (row.origin === 'asked' && row.machineId) bits.push('from machine ' + machineCode(row.machineId));
  return (
    <div style={s('margin-top:6px;font-size:12.5px;color:#768692;')}>
      {bits.join(' · ')}
      {reason && <span style={s('display:block;margin-top:2px;')}>{reason.note}</span>}
    </div>
  );
}

/* Where a row came from, as a badge. The assistant's own are the ones
   somebody maintaining the Notebook should read first — a question that
   was actually put to the app and came back empty — so they are the ones
   that carry a colour. */
function OriginBadge({ row }) {
  const fromBot = row.origin === 'assistant';
  const reason = gapReason(row.reason);
  const label = fromBot ? (reason ? reason.label : 'The assistant could not answer') : 'Asked by staff';
  return (
    <span style={s('display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;'
      + (fromBot ? 'background:#fff3ed;color:#a13a00;' : 'background:#eef4f8;color:#4c6272;'))}>
      {label}
    </span>
  );
}

/* One question, with whatever has been written under it. The answer box
   is closed until somebody presses Answer: an open textarea on every row
   makes a list of twenty questions unreadable. */
function Row({ row, onAnswer, onRemove, busy }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(row.answer || '');
  const answered = row.status === 'answered';
  // Asked again since it was answered: the answer is here but the gap is
  // evidently still being hit, which usually means it never reached the
  // Notebook. Worth saying, quietly, rather than showing a tick.
  const stale = answered && row.answeredAt && new Date(row.lastAt) > new Date(row.answeredAt);

  return (
    <div style={s(BOX + 'border-radius:12px;padding:14px 16px;')}>
      <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;')}>
        <OriginBadge row={row} />
        {answered && (
          <span style={s('display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;color:#007f3b;')}>
            <Svg w={13} sw={2.6}>{Icons.check}</Svg>Answered
          </span>
        )}
      </div>

      <div style={s('margin-top:8px;font-size:17px;line-height:1.45;color:#212b32;font-weight:600;overflow-wrap:anywhere;')}>
        {row.question}
      </div>

      {row.detail && (
        <div style={s('margin-top:6px;font-size:15px;line-height:1.5;color:#4c6272;white-space:pre-wrap;overflow-wrap:anywhere;')}>
          {row.detail}
        </div>
      )}

      <Provenance row={row} />

      {answered && row.answer && !open && (
        <div style={s('margin-top:10px;background:#f0f7f2;border:1px solid #cce4d6;border-radius:8px;padding:10px 12px;')}>
          <div style={s('font-size:12px;font-weight:700;color:#007f3b;letter-spacing:.02em;')}>
            THE ANSWER{row.answeredBy ? ' · from machine ' + machineCode(row.answeredBy) : ''}
          </div>
          <div style={s('margin-top:4px;font-size:15.5px;line-height:1.5;color:#212b32;white-space:pre-wrap;overflow-wrap:anywhere;')}>
            {row.answer}
          </div>
          {stale && (
            <div style={s('margin-top:6px;font-size:12.5px;color:#a13a00;')}>
              Asked again since this was written — it may not have reached the Notebook yet.
            </div>
          )}
        </div>
      )}

      {open && (
        <div style={s('margin-top:10px;')}>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4}
            aria-label="The answer" placeholder="What is the answer? Write it as you would tell somebody at the desk."
            style={s(INPUT + 'font-size:15.5px;resize:vertical;')} />
          <div style={s('margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;')}>
            <Hover tag="button" type="button" disabled={busy}
              onClick={() => onAnswer(row, draft).then((saved) => { if (saved) setOpen(false); })}
              base={PRIMARY + (busy ? 'opacity:.6;cursor:default;' : '')} hover={busy ? '' : PRIMARY_HOVER}>
              Save the answer
            </Hover>
            <Hover tag="button" type="button" onClick={() => { setDraft(row.answer || ''); setOpen(false); }}
              base={QUIET} hover={QUIET_HOVER}>Cancel</Hover>
            <span style={s('font-size:12.5px;color:#768692;')}>
              Then write it into the Notebook, so the assistant can answer it next time.
            </span>
          </div>
        </div>
      )}

      {!open && (
        <div style={s('margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;')}>
          <Hover tag="button" type="button" onClick={() => setOpen(true)} base={QUIET} hover={QUIET_HOVER}>
            {answered ? 'Change the answer' : 'Answer this'}
          </Hover>
          <Hover tag={Link} href="/notebook" base={QUIET + 'text-decoration:none;'} hover={QUIET_HOVER}>
            Write the page
          </Hover>
          {answered && (
            <Hover tag="button" type="button" disabled={busy} onClick={() => onAnswer(row, '')}
              base={QUIET} hover={QUIET_HOVER}>
              Not settled after all
            </Hover>
          )}
          <Hover tag="button" type="button" disabled={busy} onClick={() => onRemove(row)}
            base={QUIET + 'color:#a51b0f;'} hover="border-color:#a51b0f;color:#a51b0f;">
            Remove
          </Hover>
        </div>
      )}
    </div>
  );
}

/* Paste a lot, get the questions out. The model only proposes: what it found
   comes back as a list to tick and correct, and nothing is stored until
   "Add" — each one through the same POST as a typed question, so a question
   already on the list is counted as asked again rather than added twice. */
function BulkAsk({ onAdded }) {
  const [text, setText] = useState('');
  const [phase, setPhase] = useState('paste'); // paste | reading | review | saving
  const [found, setFound] = useState([]);      // [{ question, detail, keep, failed }]
  const [error, setError] = useState('');

  async function extract() {
    if (!text.trim()) return;
    setPhase('reading');
    setError('');
    try {
      const res = await fetch('/api/questions/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'The text could not be read.'); setPhase('paste'); return; }
      if (!data.questions || !data.questions.length) {
        setError('No questions found in that text. Try pasting more of it, or ask one at a time.');
        setPhase('paste');
        return;
      }
      setFound(data.questions.map((q) => ({ ...q, keep: true, failed: '' })));
      setPhase('review');
    } catch (err) {
      setError('The text could not be read. ' + String(err));
      setPhase('paste');
    }
  }

  const edit = (i, patch) => setFound((list) => list.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const chosen = found.filter((q) => q.keep && q.question.trim());

  async function addAll() {
    if (!chosen.length) return;
    setPhase('saving');
    setError('');
    let added = 0;
    let repeats = 0;
    const left = [];
    // One at a time, in order: tens of rows at most, and a failure part-way
    // through should leave exactly the unsaved ones on screen.
    for (const q of found) {
      if (!q.keep || !q.question.trim()) continue;
      try {
        const res = await fetch('/api/questions/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q.question.trim(), detail: q.detail.trim() }),
        });
        const data = await res.json();
        if (!res.ok) { left.push({ ...q, failed: data.error || 'Not saved.' }); continue; }
        if (data.repeat) repeats += 1; else added += 1;
      } catch (err) {
        left.push({ ...q, failed: 'Not saved. ' + String(err) });
      }
    }
    const parts = [];
    if (added) parts.push(added + (added === 1 ? ' question added' : ' questions added'));
    if (repeats) parts.push(repeats + (repeats === 1 ? ' was already on the list and is now counted as asked again' : ' were already on the list and are now counted as asked again'));
    if (left.length) parts.push(left.length + ' could not be saved — they are still below');
    onAdded(parts.join('; ') + '.');
    if (left.length) {
      setFound(left);
      setPhase('review');
    } else {
      setFound([]);
      setText('');
      setPhase('paste');
    }
  }

  if (phase === 'reading') {
    return (
      <div>
        <style>{EXTRACT_CSS}</style>
        <div className="rq-scan" aria-hidden="true">
          {['96%', '88%', '72%'].map((w) => <div key={w} className="rq-scan__line" style={{ width: w }} />)}
          {['64%', '78%', '52%'].map((w, i) => (
            <div key={w} className="rq-scan__row" style={{ animationDelay: i * 0.15 + 's' }}><i /><b style={{ width: w }} /></div>
          ))}
          <span className="rq-scan__beam" />
        </div>
        <p style={s('margin:10px 0 0;font-size:14px;color:#4c6272;')} role="status">Reading the text and picking out the questions…</p>
      </div>
    );
  }

  if (phase === 'review' || phase === 'saving') {
    const saving = phase === 'saving';
    return (
      <div>
        <p style={s('margin:0 0 12px;font-size:14.5px;color:#212b32;')}>
          <strong>Found {found.length} {found.length === 1 ? 'question' : 'questions'}.</strong>{' '}
          <span style={s('color:#4c6272;')}>Untick any you do not want and correct the wording, then add them.</span>
        </p>
        <div style={s('display:flex;flex-direction:column;gap:8px;')}>
          {found.map((q, i) => (
            <div key={i} style={s('display:flex;gap:10px;align-items:flex-start;border:1px solid '
              + (q.failed ? '#f0b8b1' : q.keep ? '#cfe0ee' : '#e8edf0') + ';border-radius:10px;padding:10px 12px;background:'
              + (q.keep ? '#f7fafd' : '#fbfcfc') + ';' + (q.keep ? '' : 'opacity:.6;'))}>
              <input type="checkbox" checked={q.keep} disabled={saving} onChange={(e) => edit(i, { keep: e.target.checked })}
                aria-label={'Keep: ' + q.question} style={s('flex:none;width:18px;height:18px;margin:9px 0 0;accent-color:#005eb8;cursor:pointer;')} />
              <div style={s('flex:1;min-width:0;')}>
                <input value={q.question} disabled={saving} onChange={(e) => edit(i, { question: e.target.value })}
                  aria-label="Question" style={s(INPUT + 'font-size:15.5px;font-weight:600;padding:7px 10px;')} />
                <input value={q.detail} disabled={saving} onChange={(e) => edit(i, { detail: e.target.value })}
                  aria-label="Detail" placeholder="Detail (optional)"
                  style={s(INPUT + 'margin-top:6px;font-size:14px;color:#4c6272;padding:6px 10px;border-width:1px;')} />
                {q.failed && <div style={s('margin-top:5px;font-size:13px;color:#a51b0f;')}>{q.failed}</div>}
              </div>
            </div>
          ))}
        </div>
        <div style={s('margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;')}>
          <Hover tag="button" type="button" disabled={saving || !chosen.length} onClick={addAll}
            base={PRIMARY + (saving || !chosen.length ? 'opacity:.55;cursor:default;' : '')}
            hover={saving || !chosen.length ? '' : PRIMARY_HOVER}>
            {saving ? 'Adding…' : 'Add ' + chosen.length + (chosen.length === 1 ? ' question' : ' questions')}
          </Hover>
          <Hover tag="button" type="button" disabled={saving} onClick={() => { setFound([]); setPhase('paste'); }}
            base={QUIET} hover={QUIET_HOVER}>Back to the text</Hover>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="rq-bulk" style={s('display:block;font-size:14px;font-weight:700;color:#212b32;margin:0 0 6px;')}>
        Paste meeting notes, an email or a list
      </label>
      <textarea id="rq-bulk" value={text} onChange={(e) => setText(e.target.value)} rows={9}
        placeholder={'Paste as much as you like. The AI finds every question in it, including the implied ones ("not sure who orders the flu jabs"), tidies the wording and drops duplicates. You check the list before anything is added.'}
        style={s(INPUT + 'font-size:15px;line-height:1.5;resize:vertical;')} />
      <p style={s('margin:10px 0 0;font-size:13px;color:#768692;')}>
        No patient information. The AI is told to leave out anything that identifies a patient, but check the list before adding it.
      </p>
      <div style={s('margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;')}>
        <Hover tag="button" type="button" disabled={!text.trim()} onClick={extract}
          base={PRIMARY + (!text.trim() ? 'opacity:.55;cursor:default;' : '')} hover={!text.trim() ? '' : PRIMARY_HOVER}>
          <Svg w={17} sw={1.9}>{AI_ICON}</Svg>Find the questions
        </Hover>
        {text.length > 0 && <span style={s('font-size:12.5px;color:#768692;')}>{text.length.toLocaleString('en-GB')} characters</span>}
        {error && <span style={s('font-size:14px;color:#a51b0f;')}>{error}</span>}
      </div>
    </div>
  );
}

export default function Page() {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [filter, setFilter] = useState('open');
  const [question, setQuestion] = useState('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [asking, setAsking] = useState('');
  const [mode, setMode] = useState('one'); // one | bulk

  const load = useCallback(() => {
    // The whole list, filtered in the browser: it is a list of gaps in one
    // practice's notes, which is tens of rows, and a filter that redraws
    // instantly is worth more here than a query per pill.
    fetch('/api/questions/open?limit=200')
      .then((r) => r.json())
      .then((d) => setState({ loading: false, rows: d.rows || [], error: d.error || '' }))
      .catch((e) => setState({ loading: false, rows: [], error: String(e) }));
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const out = {};
    for (const f of FILTERS) out[f.id] = state.rows.filter(f.match).length;
    return out;
  }, [state.rows]);

  const rows = useMemo(() => {
    const active = FILTERS.find((f) => f.id === filter) || FILTERS[0];
    return state.rows.filter(active.match);
  }, [state.rows, filter]);

  async function ask(e) {
    e.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setAsking('');
    try {
      const res = await fetch('/api/questions/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, detail: detail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setAsking(data.error || 'The question could not be saved.'); return; }
      // Only cleared once it is actually stored: a box emptied by a failed
      // save is a question somebody has to type twice.
      setQuestion('');
      setDetail('');
      setNotice(data.repeat
        ? 'Somebody has already asked that — it is now recorded as asked again.'
        : 'Asked. It is on the list below until somebody answers it.');
      setFilter('open');
      load();
    } catch (err) {
      setAsking('The question could not be saved — nothing was stored. ' + String(err));
    } finally {
      setBusy(false);
    }
  }

  async function answer(row, text) {
    setBusy(true);
    setNotice('');
    try {
      const res = await fetch('/api/questions/open', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, answer: text }),
      });
      const data = await res.json();
      if (!res.ok) { setNotice(data.error || 'The answer could not be saved.'); return false; }
      load();
      return true;
    } catch (err) {
      setNotice('The answer could not be saved. ' + String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    if (typeof window !== 'undefined'
      && !window.confirm('Remove this question from the list? Answering it is what closes it — this deletes it.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/questions/open?id=' + row.id, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { setNotice(data.error || 'The question could not be removed.'); return; }
      load();
    } catch (err) {
      setNotice('The question could not be removed. ' + String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Questions" />

      <main style={s('flex:1;width:100%;max-width:900px;margin:0 auto;padding:36px 24px 64px;')}>
        <h1 style={s('font-size:32px;margin:0 0 6px;letter-spacing:-0.02em;')}>Questions</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0 0 24px;max-width:70ch;')}>
          For the questions the assistant cannot answer, because the practice has not written the answer down
          anywhere yet. Ask one here, and every question the assistant was asked and could not answer joins the
          same list on its own.
        </p>

        <div style={s(BOX + 'padding:16px;margin:0 0 24px;')}>
          <div role="tablist" aria-label="How to add questions"
            style={s('display:inline-flex;gap:2px;padding:3px;margin:0 0 14px;background:#f0f4f5;border:1px solid #e3eaed;border-radius:10px;')}>
            {[
              { id: 'one', label: 'Ask one' },
              { id: 'bulk', label: 'Paste lots of text', ai: true },
            ].map((t) => (
              <Hover key={t.id} tag="button" type="button" role="tab" aria-selected={mode === t.id} onClick={() => setMode(t.id)}
                base={'display:inline-flex;align-items:center;gap:6px;border:none;border-radius:8px;padding:6px 13px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;'
                  + (mode === t.id ? 'background:#fff;color:#005eb8;box-shadow:0 1px 2px rgba(33,43,50,.12);' : 'background:none;color:#4c6272;')}
                hover={mode === t.id ? '' : 'color:#005eb8;'}>
                {t.ai && <Svg w={15} sw={1.9}>{AI_ICON}</Svg>}{t.label}
              </Hover>
            ))}
          </div>

          {mode === 'bulk' && (
            <BulkAsk onAdded={(msg) => { setNotice(msg); setFilter('open'); load(); }} />
          )}

          {mode === 'one' && (
          <form onSubmit={ask}>
            <label htmlFor="rq-question" style={s('display:block;font-size:14px;font-weight:700;color:#212b32;margin:0 0 6px;')}>
              Ask a question
            </label>
            <input id="rq-question" value={question} onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Who covers the phones when both receptionists are on lunch?"
              style={s(INPUT)} />
            <label htmlFor="rq-detail" style={s('display:block;font-size:14px;font-weight:700;color:#212b32;margin:14px 0 6px;')}>
              Anything else worth knowing <span style={s('font-weight:500;color:#768692;')}>— optional</span>
            </label>
            <textarea id="rq-detail" value={detail} onChange={(e) => setDetail(e.target.value)} rows={3}
              placeholder="What you have already tried, who might know, why it came up."
              style={s(INPUT + 'font-size:15.5px;resize:vertical;')} />
            <p style={s('margin:10px 0 0;font-size:13px;color:#768692;')}>
              No patient information. This is a question about how the practice works, and it is stored as it is typed.
            </p>
            <div style={s('margin-top:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;')}>
              <Hover tag="button" type="submit" disabled={busy || !question.trim()}
                base={PRIMARY + (busy || !question.trim() ? 'opacity:.55;cursor:default;' : '')}
                hover={busy || !question.trim() ? '' : PRIMARY_HOVER}>
                Add the question
              </Hover>
              {asking && <span style={s('font-size:14px;color:#a51b0f;')}>{asking}</span>}
            </div>
          </form>
          )}
        </div>

        {notice && (
          <p style={s('margin:0 0 18px;font-size:14.5px;color:#005eb8;background:#eef4f8;border:1px solid #cfe0ee;border-radius:8px;padding:9px 12px;')}>
            {notice}
          </p>
        )}

        <div style={s('display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px;')}>
          {FILTERS.map((f) => (
            <Hover key={f.id} tag="button" type="button" onClick={() => setFilter(f.id)}
              base={'border-radius:999px;padding:7px 15px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:1px solid '
                + (filter === f.id ? '#005eb8;background:#005eb8;color:#fff;' : '#d8e1e5;background:#fff;color:#4c6272;')}
              hover={filter === f.id ? '' : 'border-color:#005eb8;color:#005eb8;'}>
              {f.label}
              <span style={s('margin-left:7px;opacity:.75;font-weight:500;')}>{counts[f.id] || 0}</span>
            </Hover>
          ))}
        </div>

        {state.loading && <p style={s('color:#4c6272;')}>Loading…</p>}
        {state.error && <p style={s('color:#a51b0f;')}>{state.error}</p>}
        {!state.loading && !state.error && !rows.length && (
          <p style={s('color:#4c6272;')}>
            Nothing here. Questions appear as soon as somebody asks one above, or as soon as the assistant is
            asked something the practice’s own material does not cover.
          </p>
        )}

        <div style={s('display:flex;flex-direction:column;gap:12px;')}>
          {rows.map((row) => (
            <Row key={row.id} row={row} onAnswer={answer} onRemove={remove} busy={busy} />
          ))}
        </div>
      </main>
    </div>
  );
}
