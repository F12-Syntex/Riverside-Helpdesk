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

const BAND = { green: '#007f3b', amber: '#a4610a', red: '#d5281b', grey: '#8f9ba3' };
const BAND_INK = { green: '#00612f', amber: '#7a4708', red: '#8a1509', grey: '#4c6272' };
const BAND_TINT = { green: '#e6f4ec', amber: '#fdf3e7', red: '#fde8e9', grey: '#eef1f3' };
const INK = '#212b32';
const MUTED = '#4c6272';

const btn = (bg, fg, extra = '') => 'display:inline-flex;align-items:center;gap:6px;background:' + bg + ';color:' + fg
  + ';border:1px solid ' + (bg === '#fff' ? '#d5dee2' : bg) + ';border-radius:8px;padding:7px 13px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;' + extra;

const LABEL = 'font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + MUTED + ';';

function Bar({ value, total, tone = '#005eb8' }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div style={s('height:6px;border-radius:999px;background:#e6ecf0;overflow:hidden;margin-top:8px;')}>
      <div style={s('height:100%;width:' + pct + '%;background:' + tone + ';transition:width .25s ease;')} />
    </div>
  );
}

// One side of a disagreement: where it is written, and what it says.
function Side({ side, letter, onOpenPage, onChoose, disabled, chooseLabel }) {
  return (
    <div style={s('flex:1;min-width:240px;border:1px solid #dde5e9;border-radius:10px;padding:10px 12px;background:#fbfdfe;')}>
      <div style={s('display:flex;align-items:center;gap:6px;')}>
        <span style={s('display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#e8eef2;color:' + INK + ';font-size:11px;font-weight:700;')}>{letter}</span>
        <Hover tag="button" onClick={() => onOpenPage(side.noteId)} base={'background:none;border:none;padding:0;font:inherit;font-size:12px;color:#005eb8;cursor:pointer;text-align:left;'} hover="text-decoration:underline;">
          {side.path || side.title}
        </Hover>
      </div>
      <div style={s('margin-top:6px;font-size:13.5px;color:' + INK + ';line-height:1.5;white-space:pre-wrap;')}>{side.text}</div>
      <Hover tag="button" onClick={onChoose} disabled={disabled}
        base={btn('#fff', '#00612f', 'margin-top:9px;') + (disabled ? 'opacity:.55;cursor:default;' : '')} hover={disabled ? '' : 'background:#f2faf5;'}>
        <Svg w={13} sw={2.6}>{Icons.check}</Svg>{chooseLabel}
      </Hover>
    </div>
  );
}

function Flag({ flag, onDecide, onOpenPage, busy }) {
  const blocking = flag.verdict === 'contradiction' && flag.status === 'open';
  const tone = flag.status !== 'open' ? 'grey' : blocking ? (flag.severity === 'high' ? 'red' : 'amber') : 'grey';
  return (
    <div style={s('border:1px solid ' + (blocking ? '#f2c9c6' : '#e2e9ec') + ';border-left:4px solid ' + BAND[tone] + ';border-radius:0 10px 10px 0;background:' + (blocking ? '#fffbfb' : '#fff') + ';padding:12px 14px;margin-top:10px;')}>
      <div style={s('display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;')}>
        <span style={s('font-size:14px;font-weight:700;color:' + INK + ';')}>
          {flag.status !== 'open' ? 'Settled' : blocking ? 'These two pages disagree' : 'Possibly a disagreement'}
        </span>
        {flag.subject && <span style={s('font-size:12.5px;color:' + MUTED + ';')}>· {flag.subject}</span>}
        {blocking && flag.severity === 'high' && <span style={s('background:' + BAND_TINT.red + ';color:' + BAND_INK.red + ';border-radius:999px;padding:2px 8px;font-size:11.5px;font-weight:700;')}>an answer would be wrong</span>}
      </div>
      {flag.reason && <div style={s('margin-top:4px;font-size:13px;color:' + MUTED + ';line-height:1.5;')}>{flag.reason}</div>}
      {flag.why && <div style={s('margin-top:2px;font-size:12px;color:' + MUTED + ';')}>The code noticed — {flag.why}</div>}

      <div style={s('display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;')}>
        <Side side={flag.sideA || {}} letter="A" onOpenPage={onOpenPage} disabled={busy || flag.status !== 'open'}
          chooseLabel="This one is right" onChoose={() => onDecide(flag.id, 'a')} />
        <Side side={flag.sideB || {}} letter="B" onOpenPage={onOpenPage} disabled={busy || flag.status !== 'open'}
          chooseLabel="This one is right" onChoose={() => onDecide(flag.id, 'b')} />
      </div>

      {flag.status === 'open' ? (
        <>
          {flag.question && <div style={s('margin-top:10px;font-size:13.5px;font-weight:600;color:' + INK + ';')}>{flag.question}</div>}
          <div style={s('margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;')}>
            <Hover tag="button" onClick={() => onDecide(flag.id, 'dismiss')} disabled={busy} base={btn('#fff', MUTED)} hover="background:#f4f7f8;">Both are right</Hover>
            <Hover tag="button" onClick={() => onDecide(flag.id, 'resolved')} disabled={busy} base={btn('#fff', MUTED)} hover="background:#f4f7f8;">I have fixed it myself</Hover>
            <span style={s('font-size:12px;color:' + MUTED + ';')}>
              {blocking ? 'Both pages wait until you decide. Choosing a side changes only that one line, and can be undone.' : 'Nothing is waiting on this one.'}
            </span>
          </div>
        </>
      ) : (
        <div style={s('margin-top:8px;font-size:12.5px;color:' + MUTED + ';')}>{flag.resolution}</div>
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

export default function RunPanel({ state, driving, error, busy, onStart, onContinue, onCancel, onDecide, onReview, onApply, onReject, onApplyAll, onOpenPage }) {
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
                ? <>{number(run.cursor)} of {number(p.chunks)} batches · {number(p.candidates)} pairs to check</>
                : <>{number(settledPages + p.proposed)} of {number(p.pages)} pages · {number(p.flags)} flagged{p.awaiting ? ' · ' + number(p.awaiting) + ' waiting on you' : ''}</>}
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

      {(blocking.length > 0 || possible.length > 0 || settled.length > 0) && (
        <div style={s(CARD + 'padding:14px 16px 16px;')}>
          <div style={s(LABEL)}>
            {blocking.length ? number(blocking.length) + ' disagreement' + (blocking.length === 1 ? '' : 's') + ' need your decision' : 'Disagreements'}
          </div>
          {blocking.length === 0 && possible.length === 0 && <div style={s('margin-top:6px;font-size:13.5px;color:' + BAND_INK.green + ';font-weight:600;')}>Nothing is waiting on you.</div>}
          {blocking.map((f) => <Flag key={f.id} flag={f} onDecide={onDecide} onOpenPage={onOpenPage} busy={busy} />)}
          {possible.map((f) => <Flag key={f.id} flag={f} onDecide={onDecide} onOpenPage={onOpenPage} busy={busy} />)}
          {settled.length > 0 && (
            <>
              <Hover tag="button" onClick={() => setShowSettled((v) => !v)} base={'background:none;border:none;padding:8px 0 0;font:inherit;font-size:12.5px;color:#005eb8;cursor:pointer;'} hover="text-decoration:underline;">
                {showSettled ? 'Hide' : 'Show'} {number(settled.length)} already settled
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
