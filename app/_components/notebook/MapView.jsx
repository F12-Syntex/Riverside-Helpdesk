'use client';

// The Notebook as a treemap: every page a rectangle sized by how much is
// written on it, coloured by whether the assistant can read it. Sections are
// the boxes around them. Click a section to zoom in, a page to see why it is
// the colour it is, double-click to open it in the editor.
//
// Everything drawn here comes from /api/notebook/map, which runs the same
// parsers the assistant does — so red means "an answer built from this page
// will be wrong or missing", not "untidy".
//
// From the page panel a rewrite can be proposed. The review that follows is
// the whole point of the feature: the current page beside the proposal, the
// code checks and the meaning check as chips, and Apply only when both pass.
// Apply snapshots first; Undo puts the snapshot back.
//
// The same review serves the whole-Notebook run (RunPanel): there it is one
// page of a queue, and applying it goes through the run so the queue knows.
// What the run adds in front of all this is the coherence sweep — two pages
// that tell staff different things are flagged and nothing on either is
// rewritten until the reader has said which is right.
import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import { CARD, Tile, number, ago } from '../stats/parts';
import { layoutTree } from '@/lib/notebook/treemap.mjs';
import { healthOf } from '@/lib/notebook/rules.mjs';
import SplitDiff from './SplitDiff';
import RunPanel from './RunPanel';
import { Modal, Button, Toast } from './kit';

const BAND = { green: '#007f3b', amber: '#a4610a', red: '#d5281b', grey: '#8f9ba3' };
const BAND_INK = { green: '#00612f', amber: '#7a4708', red: '#8a1509', grey: '#4c6272' };
const BAND_TINT = { green: '#e6f4ec', amber: '#fdf3e7', red: '#fde8e9', grey: '#eef1f3' };
const INK = '#212b32';
const MUTED = '#4c6272';

const RULE_TITLES = {
  'one-procedure': 'More than one procedure',
  'label-vocab': 'Label the parsers do not read',
  'inline-html': 'Inline HTML',
  'stray-bold': 'Stray bold markers',
  'empty-section': 'Empty heading',
  duplicate: 'Repeated elsewhere',
  restatement: 'Points at “the standard process”',
  'title-referral': '“Referral” in the title',
  stub: 'Stub',
  'typed-parse': 'Cannot be read by the assistant',
};

const CHECK_TITLES = { coverage: 'Nothing lost', additions: 'Nothing invented', images: 'Pictures kept', verbatim: 'Names and numbers verbatim', structure: 'Still parses', rules: 'Rules not worse' };

function findNode(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (const c of node.children || []) { const hit = findNode(c, id); if (hit) return hit; }
  return null;
}

function ancestorsOf(root, id) {
  const path = [];
  const walk = (node) => {
    if (node.id === id) return true;
    for (const c of node.children || []) { if (walk(c)) { path.unshift(node); return true; } }
    return false;
  };
  walk(root);
  return path;
}

// Fit a title into a cell. 11px sans is about 6.5px a character.
const fit = (text, w) => {
  const max = Math.max(0, Math.floor((w - 10) / 6.5));
  const t = String(text || '');
  return t.length <= max ? t : max > 3 ? t.slice(0, max - 1) + '…' : '';
};

// Never throws. A request that dies — a dropped connection, a gateway timeout,
// an HTML error page — used to reject and leave the view spinning with nothing
// on screen; it now comes back as a plain failure the caller can show.
async function postJson(url, body) {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && !data.error) data.error = 'The server returned ' + res.status + '.';
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: 'Could not reach the server — the change was not saved. Try again.' } };
  }
}

// What a page looks like while a run is passing over it. The map is the
// progress bar: nothing here changes what a cell means, only how loudly it
// says what is happening to it right now.
const LIVE_STROKE = { blocked: BAND.amber, proposed: '#005eb8', applied: BAND.green, failed: BAND.red };

function Treemap({ report, rootId, onRoot, onSelect, onOpen, selectedId, live }) {
  const box = React.useRef(null);
  const [width, setWidth] = React.useState(0);
  const [hover, setHover] = React.useState(null);

  React.useEffect(() => {
    if (!box.current) return undefined;
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(box.current);
    setWidth(Math.floor(box.current.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);

  const root = findNode(report.tree, rootId) || report.tree;
  const height = Math.max(240, Math.round(width * 0.62));
  const cells = width ? layoutTree({ ...root, kind: 'root' }, { x: 0, y: 0, w: width, h: height }, { padding: 3, header: 18, minCell: 4 }) : [];
  const hovered = hover ? report.pages[hover.id] : null;

  // Where each page sits, so the two pages of a disagreement can be joined.
  const centres = new Map(cells.filter((c) => c.kind !== 'section' && c.depth > 0).map((c) => [c.id, { x: c.x + c.w / 2, y: c.y + c.h / 2 }]));
  const arcs = (live ? live.arcs : []).map((arc) => ({ ...arc, from: centres.get(arc.a), to: centres.get(arc.b) })).filter((arc) => arc.from && arc.to);

  return (
    <div ref={box} style={s('position:relative;width:100%;')}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Notebook map" style={s('display:block;font-family:inherit;')} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="riva-map-sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#fff" stopOpacity="0" />
              <stop offset="55%" stopColor="#fff" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {cells.filter((c) => c.depth > 0).map((c) => {
            const isSection = c.kind === 'section';
            const band = c.node.health ? c.node.health.band : 'grey';
            const selected = c.id === selectedId;
            const state = !isSection && live ? live.byNote[c.id] : null;
            const active = !isSection && live && live.active.has(c.id);
            const flashing = !isSection && live && live.flash.has(c.id);
            const ring = active ? '#fff' : LIVE_STROKE[state] || null;
            const dim = state === 'pending' && !active;
            return (
              <g key={c.kind + c.id}
                onMouseMove={(e) => { if (!isSection) setHover({ id: c.id, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }); }}
                onClick={() => (isSection ? onRoot(c.id) : onSelect(c.id))}
                onDoubleClick={() => { if (!isSection) onOpen(c.id); }}
                style={s('cursor:pointer;')}>
                <rect x={c.x} y={c.y} width={Math.max(0, c.w)} height={Math.max(0, c.h)} rx={isSection ? 6 : 3}
                  fill={isSection ? '#e6ecf0' : BAND[band]} fillOpacity={isSection ? 1 : dim ? 0.4 : selected ? 1 : 0.82}
                  stroke={selected ? INK : ring || '#fff'} strokeWidth={selected ? 2 : ring ? (active ? 2.5 : 2) : 1}
                  strokeDasharray={state === 'blocked' && !active ? '4 3' : undefined} />
                {/* Being worked on now, or held back: the cell breathes rather than sits there. */}
                {(active || state === 'blocked') && (
                  <rect className="riva-cell-breathe" x={c.x} y={c.y} width={Math.max(0, c.w)} height={Math.max(0, c.h)} rx={3}
                    fill={active ? '#fff' : BAND.amber} pointerEvents="none" />
                )}
                {/* Just rewritten: one flash of green, then it is simply green. */}
                {flashing && <rect key={'f' + c.id + live.flashAt} className="riva-cell-flash" x={c.x} y={c.y} width={Math.max(0, c.w)} height={Math.max(0, c.h)} rx={3} fill={BAND.green} pointerEvents="none" />}
                {isSection && c.h > 18 && <rect x={c.x} y={c.y} width={Math.max(0, c.w)} height={18} rx={6} fill={BAND[band]} fillOpacity={0.18} />}
                {isSection && c.h > 18 && c.w > 40 && <text x={c.x + 6} y={c.y + 13} fontSize={11} fontWeight={700} fill={INK}>{fit(c.node.title, c.w)}</text>}
                {!isSection && c.w > 56 && c.h > 18 && <text x={c.x + 5} y={c.y + 14} fontSize={11} fontWeight={600} fill="#fff">{fit(c.node.title, c.w)}</text>}
              </g>
            );
          })}
          {/* The two pages that disagree, joined. This is the one thing the map
              could never show before: a fault BETWEEN pages, not on one. */}
          {arcs.map((arc) => {
            const mx = (arc.from.x + arc.to.x) / 2;
            const my = (arc.from.y + arc.to.y) / 2;
            const dx = arc.to.x - arc.from.x;
            const dy = arc.to.y - arc.from.y;
            const len = Math.max(1, Math.hypot(dx, dy));
            const lift = Math.min(70, len * 0.24);
            const cx = mx + (-dy / len) * lift;
            const cy = my + (dx / len) * lift;
            const colour = arc.severity === 'high' ? BAND.red : BAND.amber;
            return (
              <g key={'arc' + arc.a + '-' + arc.b} className="riva-arc" pointerEvents="none">
                <path d={`M${arc.from.x} ${arc.from.y} Q${cx} ${cy} ${arc.to.x} ${arc.to.y}`} fill="none" stroke={colour} strokeWidth={1.8} strokeDasharray="6 5" strokeLinecap="round" />
                <circle cx={arc.from.x} cy={arc.from.y} r={3.2} fill={colour} stroke="#fff" strokeWidth={1.2} />
                <circle cx={arc.to.x} cy={arc.to.y} r={3.2} fill={colour} stroke="#fff" strokeWidth={1.2} />
              </g>
            );
          })}
          {/* Reading every page against every other: the pass is shown passing. */}
          {live && live.sweeping && (
            <g className="riva-sweep" style={{ '--riva-sweep-to': width + 'px' }} pointerEvents="none">
              <rect x={-70} y={0} width={70} height={height} fill="url(#riva-map-sweep)" />
            </g>
          )}
        </svg>
      )}
      {hovered && (
        <div style={s('position:absolute;pointer-events:none;z-index:2;max-width:320px;background:#fff;border:1px solid #d8e1e5;border-radius:10px;padding:9px 12px;box-shadow:0 8px 24px rgba(0,0,0,.12);left:' + Math.min(hover.x + 14, Math.max(0, width - 330)) + 'px;top:' + (hover.y + 14) + 'px;')}>
          <div style={s('font-size:13.5px;font-weight:700;color:' + INK + ';')}>{hovered.title}</div>
          <div style={s('font-size:12px;color:' + MUTED + ';margin-top:2px;')}>{hovered.path.slice(0, -1).join(' / ')}</div>
          <div style={s('display:flex;align-items:center;gap:6px;margin-top:6px;font-size:12.5px;font-weight:700;color:' + BAND_INK[hovered.health.band] + ';')}>
            <span style={s('width:9px;height:9px;border-radius:50%;background:' + BAND[hovered.health.band] + ';')} />
            {hovered.health.score}/100 · {number(hovered.chars)} chars
          </div>
          {hovered.violations.slice(0, 4).map((v, i) => <div key={i} style={s('font-size:12.5px;color:' + INK + ';margin-top:4px;')}>• {RULE_TITLES[v.rule] || v.rule}</div>)}
          {hovered.violations.length > 4 && <div style={s('font-size:12px;color:' + MUTED + ';margin-top:3px;')}>+{hovered.violations.length - 4} more</div>}
        </div>
      )}
    </div>
  );
}

function Crumbs({ report, rootId, onRoot }) {
  const chain = rootId === 0 ? [] : ancestorsOf(report.tree, rootId).concat(findNode(report.tree, rootId) || []);
  const items = [{ id: 0, title: 'Notebook' }].concat(chain.filter((n) => n.id !== 0));
  return (
    <div style={s('display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13.5px;color:' + MUTED + ';margin-bottom:10px;')}>
      {items.map((n, i) => (
        <React.Fragment key={n.id}>
          {i > 0 && <Svg w={12} sw={2.2} style={s('flex:none;color:#aeb7bd;')}>{Icons.chevronRight}</Svg>}
          {i === items.length - 1
            ? <span style={s('font-weight:700;color:' + INK + ';')}>{n.title}</span>
            : <Hover tag="button" onClick={() => onRoot(n.id)} base="background:none;border:none;padding:0;font:inherit;color:#005eb8;cursor:pointer;" hover="text-decoration:underline;">{n.title}</Hover>}
        </React.Fragment>
      ))}
    </div>
  );
}

// The kit's button as a style string, so every control in here is the same
// shape as the buttons in the notebook itself (see notebook/kit.jsx).
const btn = (bg, fg, extra = '') => 'display:inline-flex;align-items:center;justify-content:center;gap:7px;height:36px;padding:0 14px;'
  + 'border:1px solid ' + (bg === '#fff' ? '#dde5e9' : bg) + ';border-radius:9px;background:' + bg + ';color:' + fg
  + ';font:inherit;font-size:13.5px;font-weight:600;line-height:1;letter-spacing:-.005em;white-space:nowrap;cursor:pointer;'
  + 'box-shadow:0 1px 2px rgba(20,40,55,.07);transition:background-color .14s ease,border-color .14s ease,color .14s ease;' + extra;

function History({ noteId, onChanged, refreshKey }) {
  const [rows, setRows] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    let live = true;
    setRows(null);
    fetch('/api/notebook/revert?noteId=' + noteId, { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (live) setRows(d.revisions || []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [noteId, refreshKey]);
  if (!rows || !rows.length) return null;
  const revert = async (id) => {
    setBusy(true);
    const { ok } = await postJson('/api/notebook/revert', { revisionId: id });
    setBusy(false);
    if (ok) onChanged();
  };
  return (
    <div style={s('margin-top:14px;border-top:1px solid #eef1f2;padding-top:10px;')}>
      <div style={s('font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + MUTED + ';margin-bottom:6px;')}>History</div>
      {rows.slice(0, 6).map((r) => (
        <div key={r.id} style={s('display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12.5px;color:' + MUTED + ';')}>
          <span style={s('flex:1;min-width:0;')}>Before {r.reason === 'revert' ? 'a revert' : r.reason === 'defrag' ? 'a rewrite' : r.reason === 'contradiction' ? 'settling a disagreement' : 'a change'} · {ago(r.createdAt)} · {number(r.chars)} chars</span>
          <Hover tag="button" onClick={() => revert(r.id)} disabled={busy} base={btn('#fff', '#005eb8', 'padding:4px 10px;font-size:12.5px;')} hover="background:#f7fbff;">Restore</Hover>
        </div>
      ))}
    </div>
  );
}

function PagePanel({ page, onOpenPage, onPropose, proposing, onChanged, refreshKey }) {
  if (!page) return <div style={s('font-size:14px;color:' + MUTED + ';line-height:1.55;')}>Click a page on the map to see what the assistant makes of it. Click a section to zoom in.</div>;
  const band = page.health.band;
  return (
    <div>
      <div style={s('font-size:12px;color:' + MUTED + ';')}>{page.path.slice(0, -1).join(' / ')}</div>
      <div style={s('font-size:18px;font-weight:700;color:' + INK + ';margin-top:2px;letter-spacing:-0.01em;')}>{page.title}</div>
      <div style={s('display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;')}>
        <span style={s('display:inline-flex;align-items:center;gap:6px;background:' + BAND_TINT[band] + ';color:' + BAND_INK[band] + ';border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:700;')}>
          <span style={s('width:8px;height:8px;border-radius:50%;background:' + BAND[band] + ';')} />{page.health.score}/100
        </span>
        <span style={s('font-size:12.5px;color:' + MUTED + ';')}>{number(page.chars)} chars · {page.sentenceCount} sentences{page.typed ? ' · ' + page.typed + ' page' : ''}</span>
      </div>
      {page.signals && (
        <div style={s('margin-top:10px;font-size:13px;color:' + MUTED + ';line-height:1.5;')}>
          Asked about <strong style={s('color:' + INK + ';')}>{number(page.signals.asked)}</strong> time{page.signals.asked === 1 ? '' : 's'}
          {page.signals.bad ? <>, <strong style={s('color:#8a1509;')}>{number(page.signals.bad)}</strong> marked wrong or incomplete</> : null}
          {page.signals.flagged ? <>, <strong style={s('color:#8a1509;')}>{number(page.signals.flagged)}</strong> flagged</> : null}
          {page.signals.lastAsked ? <> · last {ago(page.signals.lastAsked)}</> : null}
        </div>
      )}
      <div style={s('margin-top:12px;display:flex;flex-direction:column;gap:8px;')}>
        {page.violations.length === 0 && <div style={s('font-size:13.5px;color:#00612f;font-weight:600;')}>Nothing to fix.</div>}
        {page.violations.map((v, i) => (
          <div key={i} style={s('border-left:3px solid ' + (v.severity === 'error' ? BAND.red : v.severity === 'warn' ? BAND.amber : '#8f9ba3') + ';padding:4px 0 4px 10px;')}>
            <div style={s('font-size:13px;font-weight:700;color:' + INK + ';')}>{RULE_TITLES[v.rule] || v.rule}{v.line ? <span style={s('font-weight:400;color:' + MUTED + ';')}> · line {v.line}</span> : null}</div>
            <div style={s('font-size:13px;color:' + MUTED + ';line-height:1.45;margin-top:1px;')}>{v.message}</div>
          </div>
        ))}
      </div>
      <div style={s('margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;')}>
        <Hover tag="button" onClick={() => onOpenPage(page.id)} base={btn('#fff', '#005eb8')} hover="background:#f7fbff;"><Svg w={14} sw={2.4}>{Icons.edit}</Svg>Open page</Hover>
        <Hover tag="button" onClick={() => onPropose(page.id)} disabled={proposing || page.chars === 0} base={btn('#005eb8', '#fff') + (proposing || page.chars === 0 ? 'opacity:.6;cursor:default;' : '')} hover="background:#003d78;">
          <Svg w={14} sw={2.4}>{Icons.sparkle}</Svg>{proposing ? 'Proposing…' : 'Propose rewrite'}
        </Hover>
      </div>
      <History noteId={page.id} onChanged={onChanged} refreshKey={refreshKey} />
    </div>
  );
}

function Chip({ ok, label, count }) {
  return (
    <span style={s('display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 10px;font-size:12.5px;font-weight:700;background:' + (ok ? BAND_TINT.green : BAND_TINT.red) + ';color:' + (ok ? BAND_INK.green : BAND_INK.red) + ';')}>
      <Svg w={12} sw={2.6}>{ok ? Icons.check : Icons.alertCircle}</Svg>{label}{count ? ' · ' + count : ''}
    </span>
  );
}

function Review({ state, onClose, onDraft, onRecheck, onApply, onReject, ack, onAck }) {
  const { proposal, validation, meaning, before, editing, draft, busy, error } = state;
  const problems = Object.values(validation.checks || {}).flatMap((c) => c.problems || []);
  const errors = problems.filter((p) => p.severity === 'error');
  const hBefore = healthOf(validation.violationsBefore || []);
  const hAfter = healthOf(validation.violationsAfter || []);
  const unsure = (meaning.unsure || []).length;
  const changed = (meaning.changed || []).length;
  const canApply = validation.ok && meaning.ok && (!unsure || ack) && !editing && !busy;
  return (
    <Modal size="xl" icon={Icons.sparkle} title="Proposed rewrite" subtitle={before.path}
      onClose={busy ? undefined : onClose} dismissable={!busy}
      footer={<>
        <Button variant="quiet-danger" onClick={onReject} disabled={busy}>Reject</Button>
        {!editing && <Button icon={Icons.edit} onClick={() => onDraft(proposal.body, true)} disabled={busy}>Edit</Button>}
        {editing && <Button variant="primary" onClick={onRecheck} disabled={busy}>{busy ? 'Checking...' : 'Re-check'}</Button>}
        <span style={{ flex: 1 }} />
        <Button variant="success" icon={Icons.check} onClick={onApply} disabled={!canApply}>
          {busy && !editing ? 'Applying...' : 'Apply to the page'}
        </Button>
      </>}>
      <div>
        <div style={s('font-size:13px;color:' + MUTED + ';')}>
          Health <strong style={s('color:' + BAND_INK[hBefore.band] + ';')}>{hBefore.score}</strong>
          {' → '}<strong style={s('color:' + BAND_INK[hAfter.band] + ';')}>{hAfter.score}</strong>
          {' · '}{validation.pairs.length} sentences, {validation.pairs.filter((p) => !p.same).length} reworded
        </div>
        <div style={s('display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;')}>
          {Object.entries(validation.checks || {}).map(([k, c]) => <Chip key={k} ok={c.ok} label={CHECK_TITLES[k] || k} count={c.problems.filter((p) => p.severity === 'error').length || 0} />)}
          <Chip ok={meaning.ok} label={meaning.skipped ? 'Meaning not checked' : changed ? 'Meaning changed' : unsure ? 'Meaning: some unsure' : 'Meaning unchanged'} count={changed || unsure || 0} />
        </div>

        {(errors.length > 0 || changed > 0) && (
          <div style={s('margin-top:12px;border-left:4px solid ' + BAND.red + ';background:' + BAND_TINT.red + ';border-radius:0 10px 10px 0;padding:10px 14px;font-size:13.5px;color:' + BAND_INK.red + ';line-height:1.5;')}>
            <div style={s('font-weight:700;margin-bottom:4px;')}>This cannot be applied as it stands.</div>
            {errors.slice(0, 8).map((p, i) => <div key={i}>• {p.message}</div>)}
            {(meaning.changed || []).slice(0, 8).map((id) => { const p = validation.pairs.find((x) => x.id === id); return p ? <div key={id}>• Meaning changed: “{p.after.slice(0, 100)}” — {meaning.verdicts[id]?.reason}</div> : null; })}
            <div style={s('margin-top:4px;color:' + MUTED + ';')}>Edit the proposal, put the original wording back where it changed, and re-check.</div>
          </div>
        )}
        {unsure > 0 && changed === 0 && (
          <label style={s('display:flex;align-items:flex-start;gap:8px;margin-top:12px;border-left:4px solid ' + BAND.amber + ';background:' + BAND_TINT.amber + ';border-radius:0 10px 10px 0;padding:10px 14px;font-size:13.5px;color:' + BAND_INK.amber + ';line-height:1.5;cursor:pointer;')}>
            <input type="checkbox" checked={!!ack} onChange={(e) => onAck(e.target.checked)} style={s('margin-top:3px;')} />
            <span>The judge was unsure about {unsure} sentence{unsure === 1 ? '' : 's'} (amber on the right). I have read {unsure === 1 ? 'it' : 'them'} and the meaning is unchanged.</span>
          </label>
        )}
        {error && <div style={s('margin-top:12px;font-size:13.5px;color:' + BAND_INK.red + ';')}>{error}</div>}

        <div style={s('margin-top:14px;')}>
          <SplitDiff before={before.body} after={editing ? draft : proposal.body} pairs={validation.pairs} verdicts={meaning.verdicts || {}} problems={problems} editing={editing} draft={draft} onDraft={onDraft} />
        </div>

      </div>
    </Modal>
  );
}

export default function MapView({ notes, onOpenPage, onChanged }) {
  const [report, setReport] = React.useState(null);
  const [error, setError] = React.useState('');
  const [rootId, setRootId] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState(null);
  const [tick, setTick] = React.useState(0);
  const [defrag, setDefrag] = React.useState(null); // null | {status:'loading'} | {status:'ready', ...} | {status:'error', message}
  const [ack, setAck] = React.useState(false);
  const [toast, setToast] = React.useState(null); // { text, revisionId }
  const [run, setRun] = React.useState(null); // the whole-Notebook run's state
  const [runError, setRunError] = React.useState('');
  const [runBusy, setRunBusy] = React.useState(false);
  const [driving, setDriving] = React.useState(false);
  const [flagErrors, setFlagErrors] = React.useState({});
  // What has just happened, newest first — the run's own account of itself.
  const [events, setEvents] = React.useState([]);
  const [fresh, setFresh] = React.useState(new Set()); // flags that arrived this moment
  const [flash, setFlash] = React.useState({ ids: new Set(), at: 0 }); // pages just written
  const [bulk, setBulk] = React.useState(null); // { done, total } while applying the clean ones
  const stopBulk = React.useRef(false);
  // The driver is a loop, not a timer: one step at a time, and it stops the
  // moment the run says it is done or waiting on a decision.
  const drivingRef = React.useRef(false);
  const stopRef = React.useRef(false);

  const stamp = (notes || []).map((n) => n.id + ':' + (n.updatedAt || '')).join('|');
  React.useEffect(() => {
    let live = true;
    fetch('/api/notebook/map', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { if (!live) return; if (data.error) setError(data.error); else { setError(''); setReport(data); } })
      .catch(() => { if (live) setError('Could not load the map.'); });
    return () => { live = false; };
  }, [stamp, tick]);

  React.useEffect(() => {
    let live = true;
    fetch('/api/notebook/defrag/run', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { if (live && !data.error) setRun(data); })
      .catch(() => {});
    return () => { live = false; stopRef.current = true; };
  }, []);

  const changed = () => { setTick((t) => t + 1); onChanged && onChanged(); };

  /* ------------------------------------------------- the whole-Notebook run */

  // Every reply carries what that step did. The list is the run talking, and
  // the map reads the same events to light the pages up as they are worked on.
  const record = (event) => {
    if (!event) return;
    setEvents((list) => [{ ...event, at: Date.now(), key: 'e' + Date.now() + Math.random().toString(36).slice(2, 6) }, ...list].slice(0, 60));
    if (event.kind === 'scan' && (event.found || []).length) {
      const ids = new Set((event.found || []).flatMap((f) => [f.a.noteId, f.b.noteId]));
      setFresh(ids);
      setTimeout(() => setFresh(new Set()), 2600);
    }
    const written = event.kind === 'applied' ? [event.noteId]
      : event.kind === 'appliedMany' ? (event.noteIds || [])
        : event.kind === 'settled' ? (event.written || []).map((w) => w.noteId)
          : [];
    if (written.length) {
      setFlash({ ids: new Set(written), at: Date.now() });
      setTimeout(() => setFlash({ ids: new Set(), at: 0 }), 1500);
    }
  };

  const drive = async (runId) => {
    if (drivingRef.current) return;
    drivingRef.current = true;
    stopRef.current = false;
    setDriving(true);
    try {
      for (;;) {
        if (stopRef.current) break;
        const { ok, data } = await postJson('/api/notebook/defrag/run', { runId, step: true });
        if (!ok || data.error) { setRunError(data.error || 'The run could not be advanced.'); break; }
        setRun(data);
        record(data.event);
        if (data.done || data.waiting) break;
      }
    } finally {
      drivingRef.current = false;
      setDriving(false);
    }
  };

  const startRun = async (scope) => {
    setRunBusy(true);
    setRunError('');
    const { ok, data } = await postJson('/api/notebook/defrag/run', { start: true, scope });
    setRunBusy(false);
    if (!ok || data.error) { setRunError(data.error || 'The run could not be started.'); return; }
    setRun(data);
    setEvents([{ kind: 'started', pages: data.progress.pages, pairs: data.progress.candidates, at: Date.now(), key: 'start' }]);
    drive(data.run.id);
  };

  const stopRun = async () => {
    stopRef.current = true;
    if (!run || !run.run) return;
    setRunBusy(true);
    const { ok, data } = await postJson('/api/notebook/defrag/run', { runId: run.run.id, cancel: true });
    setRunBusy(false);
    if (ok && !data.error) setRun(data);
  };

  const decide = async (contradictionId, decision, extra = {}) => {
    setRunBusy(true);
    setRunError('');
    setFlagErrors((e) => ({ ...e, [contradictionId]: '' }));
    const { ok, data } = await postJson('/api/notebook/defrag/run', { contradictionId, decision, note: extra.note || '', edits: extra.edits || {} });
    setRunBusy(false);
    if (!ok || data.error) { setFlagErrors((e) => ({ ...e, [contradictionId]: data.error || 'That decision could not be recorded.' })); return; }
    if (data.state) setRun(data.state);
    record(data.event);
    const written = (data.event && data.event.written) || [];
    if (written.length) {
      changed();
      setToast({
        text: written.length === 1 ? '“' + written[0].title + '” corrected. The previous version is kept.' : number(written.length) + ' pages corrected. Every previous version is kept.',
        revisionId: (data.revisionIds || []).length === 1 ? data.revisionIds[0] : null,
      });
    }
    // A settled flag may have freed pages that were waiting on it.
    if (data.state && !data.state.done && !data.state.waiting) drive(data.state.run.id);
  };

  const reviewItem = async (item) => {
    setDefrag({ status: 'loading' });
    setAck(false);
    const res = await fetch('/api/notebook/defrag?proposalId=' + item.proposalId, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { setDefrag({ status: 'error', message: data.error || 'That proposal could not be read.' }); return; }
    setDefrag({ status: 'ready', ...data, itemId: item.id, editing: false, draft: data.proposal.body, busy: false, error: data.stale ? 'This page has been edited since the proposal was made. Propose it again.' : '' });
  };

  const applyItem = async (item) => {
    setRunBusy(true);
    setRunError('');
    const { ok, data } = await postJson('/api/notebook/defrag/run', { itemId: item.id, apply: true });
    setRunBusy(false);
    if (data.state) setRun(data.state);
    if (!ok || data.error) { setRunError(data.error || 'That page could not be rewritten.'); return; }
    record(data.event);
    setToast({ text: '“' + item.title + '” rewritten. The previous version is kept.', revisionId: data.revisionId });
    changed();
  };

  const rejectItem = async (item) => {
    setRunBusy(true);
    const { ok, data } = await postJson('/api/notebook/defrag/run', { itemId: item.id, reject: true });
    setRunBusy(false);
    if (ok && data.state) setRun(data.state);
  };

  // One page per request, so every page shows up as it lands: the cell flashes
  // green on the map, the list gains a line, the counter comes down. A batch of
  // forty in one request showed nothing for two minutes and then timed out.
  const applyAll = async () => {
    if (!run || !run.run || bulk) return;
    const total = run.progress ? run.progress.clean : 0;
    if (!total) return;
    setRunError('');
    setBulk({ done: 0, total });
    stopBulk.current = false;
    let applied = 0;
    let failed = 0;
    let rounds = 0;
    try {
      for (;;) {
        // One page that refuses does not stop the other thirty-nine; a round
        // that neither writes nor refuses anything means there is nothing left.
        if (stopBulk.current || rounds++ > total + 5) break;
        const { ok, data } = await postJson('/api/notebook/defrag/run', { runId: run.run.id, applyAll: true });
        if (!ok || data.error) { setRunError(data.error || 'The rewrites could not all be applied.'); break; }
        const wrote = (data.applied || []).length;
        const refused = (data.failed || []).length;
        applied += wrote;
        failed += refused;
        if (data.state) setRun(data.state);
        record(data.event);
        changed();
        setBulk({ done: applied + failed, total });
        if (!data.remaining || !(wrote + refused)) break;
      }
    } finally {
      setBulk(null);
    }
    changed();
    if (applied || failed) {
      setToast({ text: number(applied) + ' page' + (applied === 1 ? '' : 's') + ' rewritten' + (failed ? ', ' + number(failed) + ' could not be' : '') + '. Every previous version is kept.' });
    }
  };

  const propose = async (noteId) => {
    setDefrag({ status: 'loading' });
    setAck(false);
    const { ok, data } = await postJson('/api/notebook/defrag', { noteId });
    if (!ok || data.error) { setDefrag({ status: 'error', message: data.error || 'The rewrite could not be proposed.' }); return; }
    setDefrag({ status: 'ready', ...data, editing: false, draft: data.proposal.body, busy: false, error: '' });
  };
  const recheck = async () => {
    if (!defrag || defrag.status !== 'ready') return;
    setDefrag({ ...defrag, busy: true, error: '' });
    const { ok, data } = await postJson('/api/notebook/defrag', { proposalId: defrag.proposal.id, body: defrag.draft });
    if (!ok || data.error) { setDefrag({ ...defrag, busy: false, error: data.error || 'Could not re-check.' }); return; }
    setAck(false);
    setDefrag({ status: 'ready', ...data, itemId: defrag.itemId || null, editing: false, draft: data.proposal.body, busy: false, error: '' });
  };
  // A proposal made inside a run is applied through the run, so the queue
  // knows the page is done; otherwise straight through the single-page path.
  const apply = async () => {
    if (!defrag || defrag.status !== 'ready') return;
    setDefrag({ ...defrag, busy: true, error: '' });
    const { ok, data } = defrag.itemId
      ? await postJson('/api/notebook/defrag/run', { itemId: defrag.itemId, apply: true })
      : await postJson('/api/notebook/defrag', { proposalId: defrag.proposal.id, apply: true });
    if (data.state) setRun(data.state);
    if (!ok || data.error) { setDefrag({ ...defrag, busy: false, error: data.error || 'Could not apply.' }); return; }
    record(data.event);
    setDefrag(null);
    setToast({ text: 'Page rewritten. The previous version is kept.', revisionId: data.revisionId });
    changed();
  };
  const reject = async () => {
    if (defrag && defrag.status === 'ready') {
      const { ok, data } = defrag.itemId
        ? await postJson('/api/notebook/defrag/run', { itemId: defrag.itemId, reject: true })
        : await postJson('/api/notebook/defrag', { proposalId: defrag.proposal.id, reject: true });
      if (ok && data.state) setRun(data.state);
    }
    setDefrag(null);
  };
  const undo = async () => {
    if (!toast || !toast.revisionId) return;
    const { ok } = await postJson('/api/notebook/revert', { revisionId: toast.revisionId });
    setToast(ok ? { text: 'Put back as it was.' } : { text: 'Could not undo — see the page’s history.' });
    if (ok) changed();
  };

  // Everything the map needs to show the run happening on it.
  const live = React.useMemo(() => {
    if (!run || !run.run || ['cancelled'].includes(run.run.status)) return null;
    const byNote = {};
    for (const i of run.items || []) byNote[i.noteId] = i.status;
    return {
      byNote,
      active: new Set(driving && run.upcoming ? run.upcoming.noteIds || [] : []),
      flash: flash.ids,
      flashAt: flash.at,
      sweeping: driving && run.run.status === 'scanning',
      arcs: (run.contradictions || [])
        .filter((c) => c.status === 'open' && c.verdict === 'contradiction' && c.noteA && c.noteB)
        .map((c) => ({ a: c.noteA, b: c.noteB, severity: c.severity })),
    };
  }, [run, driving, flash]);

  if (error) return <div style={s('padding:28px;color:#8a1509;font-size:14.5px;')}>{error}</div>;
  if (!report) return <div style={s('padding:28px;color:' + MUTED + ';font-size:14.5px;')}>Reading every page…</div>;

  const t = report.totals;
  const selected = selectedId ? report.pages[selectedId] : null;
  const worst = Object.values(report.pages).sort((a, b) => a.health.score - b.health.score || b.chars - a.chars).slice(0, 8);

  return (
    <div style={s('flex:1;min-height:0;overflow:auto;padding:18px 22px 40px;background:#f0f4f5;position:relative;')}>
      <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px;')}>
        <Tile value={number(t.pages)} caption="pages" hint={number(t.sections) + ' sections'} />
        <Tile value={number(t.red)} caption="cannot be read" tone={t.red ? 'bad' : 'good'} />
        <Tile value={number(t.amber)} caption="need attention" />
        <Tile value={number(t.green)} caption="fine" tone="good" />
        <Tile value={number(t.stubs)} caption="stubs" />
        <Tile value={number(t.duplicates)} caption="repeated sentences" />
      </div>
      <div className="riva-grid-2" style={s('display:grid;grid-template-columns:minmax(0,2fr) minmax(280px,1fr);gap:16px;align-items:start;')}>
        <div style={s(CARD + 'padding:14px 16px 16px;')}>
          <Crumbs report={report} rootId={rootId} onRoot={(id) => { setRootId(id); setSelectedId(null); }} />
          <Treemap report={report} rootId={rootId} onRoot={(id) => { setRootId(id); setSelectedId(null); }} onSelect={setSelectedId} onOpen={onOpenPage} selectedId={selectedId} live={live} />
          <div style={s('display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:' + MUTED + ';')}>
            {['green', 'amber', 'red'].map((b) => (
              <span key={b} style={s('display:inline-flex;align-items:center;gap:5px;')}><span style={s('width:10px;height:10px;border-radius:2px;background:' + BAND[b] + ';')} />{b === 'green' ? 'Reads cleanly' : b === 'amber' ? 'Needs attention' : 'Assistant cannot read it'}</span>
            ))}
            <span>Area = how much is written</span>
            {live && (
              <>
                <span style={s('display:inline-flex;align-items:center;gap:5px;')}><span style={s('width:10px;height:10px;border-radius:2px;border:2px solid #fff;background:#8f9ba3;')} />being read now</span>
                <span style={s('display:inline-flex;align-items:center;gap:5px;')}><span style={s('width:10px;height:10px;border-radius:2px;border:2px dashed ' + BAND.amber + ';')} />held by a disagreement</span>
                <span style={s('display:inline-flex;align-items:center;gap:5px;')}><span style={s('width:14px;height:0;border-top:2px dashed ' + BAND.red + ';')} />these two disagree</span>
              </>
            )}
          </div>
        </div>
        <div style={s('display:flex;flex-direction:column;gap:14px;')}>
          <div style={s(CARD + 'padding:14px 16px 16px;')}>
            <PagePanel page={selected} onOpenPage={onOpenPage} onPropose={propose} proposing={!!defrag && defrag.status === 'loading'} onChanged={changed} refreshKey={tick} />
            {defrag && defrag.status === 'error' && <div style={s('margin-top:10px;font-size:13px;color:' + BAND_INK.red + ';')}>{defrag.message}</div>}
          </div>
          <div style={s(CARD + 'padding:14px 16px 12px;')}>
            <div style={s('font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + MUTED + ';margin-bottom:8px;')}>Needs attention first</div>
            {worst.map((p) => (
              <Hover key={p.id} tag="button" onClick={() => setSelectedId(p.id)}
                base="display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:none;padding:6px 0;font:inherit;cursor:pointer;border-top:1px solid #eef1f2;"
                hover="background:#f7fbff;">
                <span style={s('flex:none;width:9px;height:9px;border-radius:50%;background:' + BAND[p.health.band] + ';')} />
                <span style={s('flex:1;min-width:0;font-size:13.5px;color:' + INK + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{p.title}</span>
                <span style={s('flex:none;font-size:12.5px;font-weight:700;color:' + BAND_INK[p.health.band] + ';')}>{p.health.score}</span>
              </Hover>
            ))}
          </div>
        </div>
      </div>

      <div style={s('margin-top:16px;')}>
        <RunPanel
          state={run}
          driving={driving}
          busy={runBusy || !!bulk}
          error={runError}
          errors={flagErrors}
          fresh={fresh}
          events={events}
          bulk={bulk}
          onStopBulk={() => { stopBulk.current = true; }}
          onStart={startRun}
          onContinue={() => run && run.run && drive(run.run.id)}
          onCancel={stopRun}
          onDecide={decide}
          onReview={reviewItem}
          onApply={applyItem}
          onReject={rejectItem}
          onApplyAll={applyAll}
          onOpenPage={onOpenPage}
        />
      </div>

      {defrag && defrag.status === 'ready' && (
        <Review state={defrag} ack={ack} onAck={setAck} onClose={() => setDefrag(null)}
          onDraft={(text, startEditing) => setDefrag({ ...defrag, draft: text, editing: startEditing ? true : defrag.editing })}
          onRecheck={recheck} onApply={apply} onReject={reject} />
      )}
      {defrag && defrag.status === 'loading' && (
        <Toast>Rewriting, checking, and asking a second model whether the meaning held...</Toast>
      )}
      {toast && (
        <Toast onClose={() => setToast(null)}
          actions={toast.revisionId ? (
            <Hover tag="button" onClick={undo}
              base="flex:none;background:#fff;color:#17252e;border:none;border-radius:999px;padding:6px 13px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;"
              hover="background:#e9f2fa;">Undo</Hover>
          ) : null}>
          {toast.text}
        </Toast>
      )}
    </div>
  );
}
