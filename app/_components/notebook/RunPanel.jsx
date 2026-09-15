'use client';

// Defragmenting the whole Notebook, as the reader sees it.
//
// Three things happen here, in this order, and the order is the point:
//
//   1. the sweep      every page is read against every other and the pairs that
//                     disagree are flagged. Nothing has been rewritten yet.
//   2. the decisions  a flagged page is not rewritten until the reader says
//                     which side is right. That decision is theirs: the two
//                     statements are shown side by side, in the practice's own
//                     words, with the page each came from.
//   3. the queue      every other page gets the same proposal, the same code
//                     checks and the same meaning check a single rewrite gets,
//                     and waits here to be applied — one at a time, or all the
//                     ones that passed cleanly at once.
import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import { CARD, number } from '../stats/parts';
import { mergeWording } from '@/lib/notebook/settle.mjs';

const BAND = { green: '#007f3b', amber: '#a4610a', red: '#d5281b', grey: '#8f9ba3' };
const BAND_INK = { green: '#00612f', amber: '#7a4708', red: '#8a1509', grey: '#4c6272' };
const BAND_TINT = { green: '#e6f4ec', amber: '#fdf3e7', red: '#fde8e9', grey: '#eef1f3' };
const INK = '#212b32';
const MUTED = '#4c6272';

const btn = (bg, fg, extra = '') => 'display:inline-flex;align-items:center;gap:6px;background:' + bg + ';color:' + fg
  + ';border:1px solid ' + (bg === '#fff' ? '#d5dee2' : bg) + ';border-radius:8px;padding:7px 13px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;' + extra;

const LABEL = 'font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + MUTED + ';';

// A number that travels to its new value rather than jumping, so a count going
// up is something the reader sees happen.
function Count({ value }) {
  const [shown, setShown] = React.useState(value);
  const from = React.useRef(value);
  React.useEffect(() => {
    const start = performance.now();
    const was = from.current;
    if (was === value) return undefined;
    let raf = 0;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / 420);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(was + (value - was) * eased));
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value]);
  return <>{number(shown)}</>;
}

// What the run has just done, newest first. It is the run talking: every line
// here is one step that actually happened, not a guess at what is happening.
function describe(e) {
  if (e.kind === 'started') return { tone: 'grey', title: 'Started', lines: [number(e.pages) + ' pages queued · ' + number(e.pairs) + ' pairs to read'] };
  if (e.kind === 'scan') {
    const found = e.found || [];
    return {
      tone: found.some((f) => f.verdict === 'contradiction') ? 'red' : 'grey',
      title: 'Batch ' + number(e.chunk) + ' of ' + number(e.of) + ' — ' + number(e.pairs) + ' pairs read',
      lines: found.map((f) => (f.verdict === 'contradiction' ? '⚠ ' : '? ') + f.a.title + ' vs ' + f.b.title + (f.reason ? ' — ' + f.reason : '')),
    };
  }
  if (e.kind === 'swept') return { tone: e.flags ? 'amber' : 'green', title: 'Every page read against every other', lines: [e.flags ? number(e.flags) + ' disagreement' + (e.flags === 1 ? '' : 's') + ' need your decision' : 'Nothing disagrees.'] };
  if (e.kind === 'propose') {
    if (e.status !== 'proposed') return { tone: e.status === 'failed' ? 'red' : 'grey', title: e.title, lines: [e.detail || (e.status === 'skipped' ? 'Nothing to rewrite.' : 'Could not be proposed.')] };
    const r = e.review || {};
    return {
      tone: r.clean ? 'green' : r.changed ? 'red' : 'amber',
      title: e.title,
      lines: [(r.before ? r.before.score + ' → ' + r.after.score : '') + ' · ' + number(r.reworded) + ' of ' + number(r.sentences) + ' sentences reworded'
        + (r.clean ? '' : r.changed ? ' · meaning changed' : r.unsure ? ' · ' + r.unsure + ' unsure' : ' · checks failed')],
    };
  }
  if (e.kind === 'waiting') return { tone: 'amber', title: 'Waiting for you', lines: [number(e.pages) + ' page' + (e.pages === 1 ? '' : 's') + ' held by a disagreement'] };
  if (e.kind === 'queued') return { tone: 'green', title: 'Every page has been through', lines: ['Review what is proposed below.'] };
  if (e.kind === 'applied') return { tone: 'green', title: 'Rewritten — ' + e.title, lines: [] };
  if (e.kind === 'appliedMany') return { tone: 'green', title: 'Rewrote ' + number((e.titles || []).length) + ' pages', lines: [(e.titles || []).slice(0, 6).join(', ') + ((e.titles || []).length > 6 ? ' and more' : '')] };
  if (e.kind === 'settled') {
    return {
      tone: (e.written || []).length ? 'green' : 'grey',
      title: 'Settled',
      lines: [e.resolution].concat((e.written || []).map((w) => w.title + ' now says “' + w.to + '”')).filter(Boolean),
    };
  }
  return { tone: 'grey', title: e.kind, lines: [] };
}

function Activity({ events, driving }) {
  if (!events.length) return null;
  return (
    <div style={s(CARD + 'padding:14px 16px 12px;')}>
      <div style={s('display:flex;align-items:center;gap:8px;')}>
        <div style={s(LABEL + 'flex:1;')}>What is happening</div>
        {driving && <Svg w={13} sw={2.4} style={s('color:' + MUTED + ';animation:rivaSpin 1s linear infinite;')}>{Icons.spinner}</Svg>}
      </div>
      <div style={s('margin-top:6px;max-height:260px;overflow:auto;')}>
        {events.slice(0, 40).map((e) => {
          const d = describe(e);
          return (
            <div key={e.key} className="riva-feed-in" style={s('display:flex;gap:8px;padding:6px 0;border-top:1px solid #f1f4f5;')}>
              <span style={s('flex:none;margin-top:5px;width:8px;height:8px;border-radius:50%;background:' + BAND[d.tone] + ';')} />
              <div style={s('flex:1;min-width:0;')}>
                <div style={s('font-size:13px;font-weight:600;color:' + INK + ';')}>{d.title}</div>
                {d.lines.map((line, i) => <div key={i} style={s('font-size:12.5px;color:' + MUTED + ';line-height:1.45;')}>{line}</div>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bar({ value, total, tone = '#005eb8' }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div style={s('height:6px;border-radius:999px;background:#e6ecf0;overflow:hidden;margin-top:8px;')}>
      <div style={s('height:100%;width:' + pct + '%;background:' + tone + ';transition:width .25s ease;')} />
    </div>
  );
}

// One side of a disagreement: a card you click to say "this one is right".
function Side({ side, letter, picked, dimmed, onPick, onOpenPage, disabled }) {
  return (
    <div style={s('flex:1;min-width:250px;position:relative;')}>
      <Hover tag="button" onClick={onPick} disabled={disabled} aria-pressed={picked}
        base={'display:block;width:100%;text-align:left;font:inherit;cursor:pointer;border-radius:10px;padding:11px 13px 12px;'
          + 'border:2px solid ' + (picked ? '#005eb8' : '#dde5e9') + ';background:' + (picked ? '#f1f8fe' : '#fff') + ';'
          + 'opacity:' + (dimmed ? '.6' : '1') + ';transition:border-color .15s ease,background .15s ease,opacity .15s ease;'}
        hover={disabled ? '' : 'border-color:#9cc5ea;background:#f7fbff;'}>
        <span style={s('display:flex;align-items:center;gap:8px;')}>
          <Dot on={picked} />
          <span style={s('font-size:12.5px;font-weight:700;color:' + (picked ? '#00437e' : INK) + ';')}>{letter} is right</span>
          <span style={s('font-size:12px;color:' + MUTED + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{side.path || side.title}</span>
        </span>
        <span style={s('display:block;margin-top:7px;font-size:13.5px;color:' + INK + ';line-height:1.5;white-space:pre-wrap;')}>{side.text}</span>
      </Hover>
      <Hover tag="button" onClick={() => onOpenPage(side.noteId)}
        base={'position:absolute;top:9px;right:10px;background:none;border:none;padding:2px;font:inherit;font-size:11.5px;color:#005eb8;cursor:pointer;'} hover="text-decoration:underline;">
        open
      </Hover>
    </div>
  );
}

const Dot = ({ on }) => (
  <span style={s('flex:none;display:inline-flex;align-items:center;justify-content:center;width:17px;height:17px;border-radius:50%;border:2px solid ' + (on ? '#005eb8' : '#b9c6cd') + ';background:#fff;')}>
    {on && <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;')} />}
  </span>
);

// The two answers that change nothing on either page.
function Choice({ on, title, hint, onPick, disabled }) {
  return (
    <Hover tag="button" onClick={onPick} disabled={disabled} aria-pressed={on}
      base={'display:flex;align-items:center;gap:8px;width:100%;text-align:left;font:inherit;cursor:pointer;border-radius:10px;padding:9px 12px;margin-top:8px;'
        + 'border:2px solid ' + (on ? '#005eb8' : '#dde5e9') + ';background:' + (on ? '#f1f8fe' : '#fff') + ';transition:border-color .15s ease,background .15s ease;'}
      hover={disabled ? '' : 'border-color:#9cc5ea;background:#f7fbff;'}>
      <Dot on={on} />
      <span style={s('font-size:13.5px;font-weight:600;color:' + INK + ';')}>{title}</span>
      <span style={s('font-size:12.5px;color:' + MUTED + ';')}>{hint}</span>
    </Hover>
  );
}

const DECIDED_WORD = { resolved: 'Settled', dismissed: 'Both are right', deferred: 'Left for now' };

// What kind of line this is. Taking a plain sentence over a table row would put
// prose where a row belongs and break the table, so the reader is warned before
// they do it rather than after.
const shapeOf = (text) => (/^\s*\|/.test(text) ? 'a table row'
  : /^\s*#{1,6}\s/.test(text) ? 'a heading'
    : /^\s*(?:[-*+•]|\d+[.)])\s/.test(text) ? 'a list item' : 'a line');

/**
 * One disagreement, one question, one Save.
 *
 * Four answers, picked like a radio button: A is right, B is right, both are
 * right, or not now. A note can be typed with any of them and is kept either
 * way. Picking A or B shows the exact line the other page will end up with,
 * which can be reworded before it is written. Nothing else.
 */
function Flag({ flag, onDecide, onOpenPage, busy, error, active }) {
  const open = flag.status === 'open';
  const blocking = flag.verdict === 'contradiction' && open;
  const tone = !open ? 'grey' : blocking ? (flag.severity === 'high' ? 'red' : 'amber') : 'amber';
  const sides = { a: flag.sideA || {}, b: flag.sideB || {} };

  const [choice, setChoice] = React.useState(null); // 'a' | 'b' | 'both' | 'later'
  const [draft, setDraft] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  const [note, setNote] = React.useState('');

  const loser = choice === 'a' ? 'b' : 'a';
  const pick = (key) => {
    setChoice(key);
    setEditing(false);
    if (key === 'a' || key === 'b') setDraft(mergeWording(String(sides[key === 'a' ? 'b' : 'a'].text || ''), String(sides[key].text || '')));
  };
  const save = () => {
    if (choice === 'a' || choice === 'b') onDecide(flag.id, 'edit', { note, edits: { [loser]: draft } });
    else if (choice === 'both') onDecide(flag.id, 'dismiss', { note });
    else if (choice === 'later') onDecide(flag.id, 'defer', { note });
  };
  const ready = !!choice && (!['a', 'b'].includes(choice) || !!draft.trim());

  return (
    <div className={active ? 'riva-flag-new' : ''}
      style={s('border:1px solid ' + (blocking ? '#f2c9c6' : '#e2e9ec') + ';border-left:4px solid ' + BAND[tone] + ';border-radius:0 10px 10px 0;background:' + (blocking ? '#fffbfb' : '#fff') + ';padding:12px 14px;margin-top:10px;')}>
      <div style={s('display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;')}>
        <span style={s('font-size:14px;font-weight:700;color:' + INK + ';')}>
          {!open ? DECIDED_WORD[flag.status] || 'Settled' : blocking ? 'These two pages disagree' : 'Possibly a disagreement'}
        </span>
        {blocking && flag.severity === 'high' && <span style={s('background:' + BAND_TINT.red + ';color:' + BAND_INK.red + ';border-radius:999px;padding:2px 8px;font-size:11.5px;font-weight:700;')}>an answer would be wrong</span>}
        {!blocking && open && <span style={s('background:' + BAND_TINT.grey + ';color:' + MUTED + ';border-radius:999px;padding:2px 8px;font-size:11.5px;font-weight:700;')}>nothing is waiting on this</span>}
      </div>
      {flag.reason && <div style={s('margin-top:4px;font-size:13px;color:' + MUTED + ';line-height:1.5;')}>{flag.reason}</div>}

      {!open ? (
        <div style={s('margin-top:8px;')}>
          <div style={s('font-size:12.5px;color:' + MUTED + ';line-height:1.5;')}>{flag.resolution}</div>
          <div style={s('display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;')}>
            {['a', 'b'].map((key) => (
              <div key={key} style={s('flex:1;min-width:240px;border:1px solid #e6ecef;border-radius:10px;padding:9px 11px;background:#fbfcfd;')}>
                <Hover tag="button" onClick={() => onOpenPage(sides[key].noteId)} base={'background:none;border:none;padding:0;font:inherit;font-size:12px;color:#005eb8;cursor:pointer;text-align:left;'} hover="text-decoration:underline;">{sides[key].path || sides[key].title}</Hover>
                <div style={s('margin-top:4px;font-size:13px;color:' + MUTED + ';line-height:1.5;')}>{sides[key].text}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div role="group" aria-label={flag.question || 'Which page is right?'}>
          <div style={s('margin-top:9px;font-size:13.5px;font-weight:600;color:' + INK + ';')}>
            {flag.question || 'Which page is right?'}
          </div>
          <div style={s('display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;')}>
            <Side side={sides.a} letter="A" picked={choice === 'a'} dimmed={!!choice && choice !== 'a'} disabled={busy} onPick={() => pick('a')} onOpenPage={onOpenPage} />
            <Side side={sides.b} letter="B" picked={choice === 'b'} dimmed={!!choice && choice !== 'b'} disabled={busy} onPick={() => pick('b')} onOpenPage={onOpenPage} />
          </div>
          <Choice on={choice === 'both'} onPick={() => pick('both')} disabled={busy}
            title="Both are right" hint="— leave both pages exactly as they are" />
          <Choice on={choice === 'later'} onPick={() => pick('later')} disabled={busy}
            title="Not now" hint="— stop it holding the run up, ask me again next time" />

          {(choice === 'a' || choice === 'b') && (
            <div style={s('margin-top:10px;border-left:3px solid #005eb8;background:#f1f8fe;border-radius:0 8px 8px 0;padding:9px 12px;')}>
              <div style={s('font-size:12.5px;color:#00437e;font-weight:700;')}>
                “{sides[loser].title || sides[loser].path}” will read:
              </div>
              {editing ? (
                <textarea value={draft} disabled={busy} onChange={(e) => setDraft(e.target.value)} rows={2} aria-label="The wording to write"
                  style={s('width:100%;margin-top:6px;border:1px solid #9cc5ea;border-radius:8px;padding:8px 10px;font:inherit;font-size:13.5px;line-height:1.5;color:' + INK + ';background:#fff;resize:vertical;')} />
              ) : (
                <div style={s('margin-top:5px;font-size:13.5px;color:' + INK + ';line-height:1.5;white-space:pre-wrap;')}>{draft}</div>
              )}
              <Hover tag="button" onClick={() => setEditing((v) => !v)} disabled={busy}
                base={'background:none;border:none;padding:4px 0 0;font:inherit;font-size:12px;color:#005eb8;cursor:pointer;'} hover="text-decoration:underline;">
                {editing ? 'Done' : 'Word it differently'}
              </Hover>
              {shapeOf(String(sides[loser].text || '')) !== shapeOf(draft) && (
                <div style={s('margin-top:7px;background:' + BAND_TINT.amber + ';color:' + BAND_INK.amber + ';border-radius:8px;padding:7px 10px;font-size:12.5px;line-height:1.45;')}>
                  That page’s line is {shapeOf(String(sides[loser].text || ''))} and this wording is {shapeOf(draft)}. Word it differently to keep the page’s shape.
                </div>
              )}
            </div>
          )}

          <input value={note} disabled={busy} onChange={(e) => setNote(e.target.value)}
            placeholder="Anything you want to add — kept with the decision"
            style={s('width:100%;margin-top:10px;border:1px solid #d9e2e7;border-radius:8px;padding:8px 11px;font:inherit;font-size:13px;color:' + INK + ';background:#fff;')} />

          {error && <div style={s('margin-top:8px;font-size:13px;color:' + BAND_INK.red + ';')}>{error}</div>}

          <div style={s('margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;')}>
            <Hover tag="button" onClick={save} disabled={busy || !ready}
              base={btn(ready && !busy ? '#007f3b' : '#c9d3d8', '#fff') + (ready && !busy ? '' : 'cursor:default;')} hover={ready && !busy ? 'background:#00542b;' : ''}>
              <Svg w={13} sw={2.6}>{Icons.check}</Svg>{busy ? 'Saving…' : 'Save'}
            </Hover>
            <span style={s('font-size:12px;color:' + MUTED + ';line-height:1.5;')}>
              {choice === 'a' || choice === 'b'
                ? 'One line on one page changes. It can be undone from that page’s history.'
                : choice ? 'Nothing on either page changes.' : 'Pick one of the four above.'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_WORD = {
  pending: 'waiting its turn',
  blocked: 'waiting on a disagreement',
  proposed: 'ready to review',
  applied: 'rewritten',
  rejected: 'rejected',
  skipped: 'nothing to rewrite',
  failed: 'could not be proposed',
};

function Item({ item, onReview, onApply, onReject, onOpenPage, busy }) {
  const r = item.review;
  const tone = item.status === 'applied' ? 'green' : item.status === 'failed' ? 'red' : item.status === 'blocked' ? 'amber' : 'grey';
  return (
    <div style={s('display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #eef1f2;flex-wrap:wrap;')}>
      <span style={s('flex:none;width:8px;height:8px;border-radius:50%;background:' + BAND[tone] + ';')} />
      <div style={s('flex:1;min-width:180px;')}>
        <Hover tag="button" onClick={() => onOpenPage(item.noteId)} base="background:none;border:none;padding:0;font:inherit;font-size:13.5px;font-weight:600;color:#005eb8;cursor:pointer;text-align:left;" hover="text-decoration:underline;">{item.title}</Hover>
        <div style={s('font-size:12px;color:' + MUTED + ';')}>
          {r
            ? <>{r.before.score} → <strong style={s('color:' + BAND_INK[r.after.band] + ';')}>{r.after.score}</strong> · {r.reworded} of {r.sentences} sentences reworded{r.clean ? '' : r.changed ? ' · meaning changed' : r.unsure ? ' · ' + r.unsure + ' unsure' : ' · checks failed'}</>
            : <>{STATUS_WORD[item.status] || item.status}{item.detail ? ' · ' + item.detail : ''}</>}
        </div>
      </div>
      {item.status === 'proposed' && (
        <div style={s('display:flex;gap:6px;flex-wrap:wrap;')}>
          <Hover tag="button" onClick={() => onReview(item)} disabled={busy} base={btn('#fff', '#005eb8')} hover="background:#f7fbff;">Review</Hover>
          {r && r.clean && <Hover tag="button" onClick={() => onApply(item)} disabled={busy} base={btn('#007f3b', '#fff')} hover="background:#00542b;"><Svg w={13} sw={2.6}>{Icons.check}</Svg>Apply</Hover>}
          <Hover tag="button" onClick={() => onReject(item)} disabled={busy} base={btn('#fff', BAND_INK.red)} hover="background:#fdf4f3;">Reject</Hover>
        </div>
      )}
    </div>
  );
}

export default function RunPanel({ state, driving, error, busy, errors = {}, fresh = new Set(), events = [], onStart, onContinue, onCancel, onDecide, onReview, onApply, onReject, onApplyAll, onOpenPage }) {
  const [showSettled, setShowSettled] = React.useState(false);
  const run = state && state.run;
  const p = (state && state.progress) || null;

  // A finished run keeps its panel: it is the record of what was decided and
  // what was rewritten. Only "no run" and "stopped" fall back to the start card.
  if (!run || run.status === 'cancelled') {
    return (
      <div style={s(CARD + 'padding:14px 16px 16px;')}>
        <div style={s(LABEL + 'margin-bottom:6px;')}>Defragment the whole Notebook</div>
        <div style={s('font-size:13.5px;color:' + MUTED + ';line-height:1.55;')}>
          Every page is read against every other first. Where two pages tell staff different things, the run stops and asks you which is right —
          nothing is rewritten until you have said. Everything else is proposed page by page and waits here for you to apply.
        </div>
        {run && run.status === 'cancelled' && <div style={s('margin-top:8px;font-size:13px;color:' + MUTED + ';')}>The last run was stopped.</div>}
        {error && <div style={s('margin-top:8px;font-size:13px;color:' + BAND_INK.red + ';')}>{error}</div>}
        <div style={s('margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;')}>
          <Hover tag="button" onClick={() => onStart('all')} disabled={busy} base={btn('#005eb8', '#fff')} hover="background:#003d78;">
            <Svg w={14} sw={2.4}>{Icons.sparkle}</Svg>Defragment everything
          </Hover>
          <Hover tag="button" onClick={() => onStart('needs-attention')} disabled={busy} base={btn('#fff', '#005eb8')} hover="background:#f7fbff;">
            Only the pages that need it
          </Hover>
        </div>
      </div>
    );
  }

  const flags = (state.contradictions || []);
  const blocking = flags.filter((f) => f.status === 'open' && f.verdict === 'contradiction');
  const possible = flags.filter((f) => f.status === 'open' && f.verdict !== 'contradiction');
  const settled = flags.filter((f) => f.status !== 'open');
  const queue = (state.items || []).filter((i) => i.status === 'proposed');
  const rest = (state.items || []).filter((i) => i.status !== 'proposed');
  const settledPages = p.applied + p.rejected + p.skipped + p.failed;

  const headline = run.status === 'scanning'
    ? 'Reading every page against every other…'
    : run.status === 'proposing'
      ? (state.waiting ? 'Waiting for you' : 'Rewriting page by page…')
      : run.status === 'done'
        ? 'Finished. ' + number(p.applied) + ' page' + (p.applied === 1 ? '' : 's') + ' rewritten.'
        : 'Every page has been through. Review what is proposed.';

  return (
    <div style={s('display:flex;flex-direction:column;gap:14px;')}>
      <div style={s(CARD + 'padding:14px 16px 16px;')}>
        <div style={s('display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;')}>
          <div style={s('flex:1;min-width:220px;')}>
            <div style={s(LABEL)}>Defragmenting the Notebook</div>
            <div style={s('font-size:16px;font-weight:700;color:' + INK + ';margin-top:3px;letter-spacing:-0.01em;')}>{headline}</div>
            <div style={s('font-size:12.5px;color:' + MUTED + ';margin-top:3px;')}>
              {run.status === 'scanning'
                ? <><Count value={run.cursor} /> of {number(p.chunks)} batches · <Count value={p.candidates} /> pairs to read · <Count value={p.flags} /> flagged</>
                : <><Count value={settledPages + p.proposed} /> of {number(p.pages)} pages · <Count value={p.flags} /> flagged{p.awaiting ? <> · <Count value={p.awaiting} /> waiting on you</> : null}</>}
            </div>
            <Bar value={run.status === 'scanning' ? run.cursor : settledPages + p.proposed} total={run.status === 'scanning' ? p.chunks : p.pages}
              tone={state.waiting ? BAND.amber : '#005eb8'} />
          </div>
          <div style={s('display:flex;gap:8px;flex-wrap:wrap;')}>
            {driving && <span style={s('display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:' + MUTED + ';')}><Svg w={14} sw={2.4} style={s('animation:rivaSpin 1s linear infinite;')}>{Icons.spinner}</Svg>working</span>}
            {!driving && !state.done && !state.waiting && <Hover tag="button" onClick={onContinue} disabled={busy} base={btn('#005eb8', '#fff')} hover="background:#003d78;">Continue</Hover>}
            {run.status === 'done'
              ? <Hover tag="button" onClick={() => onStart('all')} disabled={busy} base={btn('#005eb8', '#fff')} hover="background:#003d78;"><Svg w={14} sw={2.4}>{Icons.sparkle}</Svg>Defragment again</Hover>
              : <Hover tag="button" onClick={onCancel} disabled={busy} base={btn('#fff', MUTED)} hover="background:#f4f7f8;">Stop</Hover>}
          </div>
        </div>
        {error && <div style={s('margin-top:10px;font-size:13px;color:' + BAND_INK.red + ';')}>{error}</div>}
        {state.waiting && (
          <div style={s('margin-top:12px;border-left:4px solid ' + BAND.amber + ';background:' + BAND_TINT.amber + ';border-radius:0 10px 10px 0;padding:10px 14px;font-size:13.5px;color:' + BAND_INK.amber + ';line-height:1.5;')}>
            Every page left is one of the pages that disagree. Settle the flags below and the run carries on by itself.
          </div>
        )}
      </div>

      <Activity events={events} driving={driving} />

      {(blocking.length > 0 || possible.length > 0 || settled.length > 0) && (
        <div style={s(CARD + 'padding:14px 16px 16px;')}>
          <div style={s(LABEL)}>
            {blocking.length ? number(blocking.length) + ' disagreement' + (blocking.length === 1 ? '' : 's') + ' need your decision' : 'Disagreements'}
          </div>
          {blocking.length === 0 && possible.length === 0 && <div style={s('margin-top:6px;font-size:13.5px;color:' + BAND_INK.green + ';font-weight:600;')}>Nothing is waiting on you.</div>}
          {blocking.map((f) => <Flag key={f.id} flag={f} onDecide={onDecide} onOpenPage={onOpenPage} busy={busy} error={errors[f.id]} active={fresh.has(f.id)} />)}
          {possible.map((f) => <Flag key={f.id} flag={f} onDecide={onDecide} onOpenPage={onOpenPage} busy={busy} error={errors[f.id]} active={fresh.has(f.id)} />)}
          {settled.length > 0 && (
            <>
              <Hover tag="button" onClick={() => setShowSettled((v) => !v)} base={'background:none;border:none;padding:8px 0 0;font:inherit;font-size:12.5px;color:#005eb8;cursor:pointer;'} hover="text-decoration:underline;">
                {showSettled ? 'Hide' : 'Show'} {number(settled.length)} already dealt with
              </Hover>
              {showSettled && settled.map((f) => <Flag key={f.id} flag={f} onDecide={onDecide} onOpenPage={onOpenPage} busy />)}
            </>
          )}
        </div>
      )}

      <div style={s(CARD + 'padding:14px 16px 16px;')}>
        <div style={s('display:flex;align-items:center;gap:10px;flex-wrap:wrap;')}>
          <div style={s(LABEL + 'flex:1;min-width:160px;')}>Proposed rewrites</div>
          {p.clean > 0 && (
            <Hover tag="button" onClick={onApplyAll} disabled={busy} base={btn('#007f3b', '#fff')} hover="background:#00542b;">
              <Svg w={13} sw={2.6}>{Icons.check}</Svg>Apply the {number(p.clean)} that passed cleanly
            </Hover>
          )}
        </div>
        {queue.length === 0 && <div style={s('margin-top:8px;font-size:13.5px;color:' + MUTED + ';')}>Nothing to review yet.</div>}
        {queue.map((item) => <Item key={item.id} item={item} onReview={onReview} onApply={onApply} onReject={onReject} onOpenPage={onOpenPage} busy={busy} />)}
        {rest.length > 0 && (
          <div style={s('margin-top:12px;')}>
            <div style={s(LABEL + 'margin-bottom:2px;')}>The rest</div>
            {rest.map((item) => <Item key={item.id} item={item} onReview={onReview} onApply={onApply} onReject={onReject} onOpenPage={onOpenPage} busy={busy} />)}
          </div>
        )}
      </div>
    </div>
  );
}
