'use client';

// The page as it is beside the page as proposed, line by line, with the
// judge's verdicts painted onto the sentences they are about.
//
// Left: the current page; a sentence the validator says was not carried
// over is underlined red. Right: the proposal; a sentence the meaning check
// called "changed" is outlined red with the reason on hover, "unsure" amber.
// In edit mode the right column becomes the text itself, and every changed
// or unsure sentence gets a "restore original" button that puts the old
// wording back — the honest way to disagree with one sentence without
// re-running the whole rewrite.
import React from 'react';
import { s, Hover } from '../ui';
import { lineDiff, splitRows } from '@/lib/notebook/diff.mjs';

const INK = '#212b32';
const MUTED = '#4c6272';
const RED = '#d5281b';
const AMBER = '#a4610a';

const quoted = (message) => {
  const m = /“([^”]+)”/.exec(String(message || ''));
  return m ? m[1] : '';
};

function markFor(line, marks) {
  if (line == null) return null;
  for (const m of marks) if (m.text && line.includes(m.text)) return m;
  return null;
}

function Cell({ text, kind, side, mark }) {
  const bg = kind === 'same' ? '#fff' : side === 'left' ? (kind === 'removed' || kind === 'changed' ? '#fbe9e7' : '#fff') : (kind === 'added' || kind === 'changed' ? '#e7f5ec' : '#fff');
  const ink = text == null ? '#c4ccd1' : kind === 'same' ? MUTED : INK;
  const border = mark ? (mark.tone === 'red' ? '3px solid ' + RED : '3px solid ' + AMBER) : '3px solid transparent';
  return (
    <div title={mark ? mark.title : undefined}
      style={s('padding:3px 10px 3px 8px;border-left:' + border + ';background:' + bg + ';color:' + ink + ';font-family:Consolas,Menlo,monospace;font-size:12.5px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;min-height:24px;' + (mark && mark.underline ? 'text-decoration:underline wavy ' + RED + ';' : ''))}>
      {text == null ? '' : text || ' '}
    </div>
  );
}

export default function SplitDiff({ before, after, pairs = [], verdicts = {}, problems = [], editing = false, draft = '', onDraft }) {
  const rows = React.useMemo(() => splitRows(lineDiff(String(before || '').replace(/\r\n/g, '\n'), String(after || ''))), [before, after]);

  // What to paint. Left: sentences not carried over. Right: judged sentences.
  const leftMarks = problems
    .filter((p) => p.code === 'uncovered' || p.code === 'dropped-not-duplicate')
    .map((p) => ({ text: quoted(p.message), tone: 'red', underline: true, title: 'Not carried over' }));
  const rightMarks = pairs
    .filter((p) => verdicts[p.id] && verdicts[p.id].verdict !== 'same')
    .map((p) => ({ text: p.after, tone: verdicts[p.id].verdict === 'changed' ? 'red' : 'amber', title: (verdicts[p.id].verdict === 'changed' ? 'Meaning changed: ' : 'Unsure: ') + (verdicts[p.id].reason || '') }));
  const restorable = pairs.filter((p) => verdicts[p.id] && verdicts[p.id].verdict !== 'same' && !p.same);

  const restore = (p) => {
    if (!onDraft) return;
    const cur = String(draft || '');
    if (!cur.includes(p.after)) return;
    onDraft(cur.replace(p.after, p.before));
  };

  return (
    <div>
      <div style={s('display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #d8e1e5;border-radius:10px;overflow:hidden;background:#fff;')}>
        <div style={s('padding:7px 12px;background:#f0f4f5;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:' + MUTED + ';border-bottom:1px solid #d8e1e5;')}>Now</div>
        <div style={s('padding:7px 12px;background:#f0f4f5;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:' + MUTED + ';border-bottom:1px solid #d8e1e5;border-left:1px solid #d8e1e5;')}>{editing ? 'Proposed — editing' : 'Proposed'}</div>
        {editing ? (
          <>
            <div style={s('max-height:60vh;overflow:auto;')}>
              {rows.map((r, i) => <Cell key={i} text={r.left} kind={r.kind} side="left" mark={markFor(r.left, leftMarks)} />)}
            </div>
            <div style={s('border-left:1px solid #d8e1e5;display:flex;flex-direction:column;')}>
              {restorable.length > 0 && (
                <div style={s('padding:8px 10px;border-bottom:1px solid #eef1f2;display:flex;flex-direction:column;gap:5px;background:#fffdf5;')}>
                  <div style={s('font-size:12px;font-weight:700;color:#8a6100;')}>Put the original wording back for:</div>
                  {restorable.map((p) => (
                    <Hover key={p.id} tag="button" onClick={() => restore(p)} disabled={!String(draft || '').includes(p.after)}
                      base={'text-align:left;background:#fff;border:1px solid #e6d3a8;border-radius:8px;padding:5px 9px;font:inherit;font-size:12.5px;color:' + INK + ';cursor:pointer;'}
                      hover="border-color:#b58500;">
                      <span style={s('color:' + (verdicts[p.id].verdict === 'changed' ? RED : AMBER) + ';font-weight:700;')}>{verdicts[p.id].verdict === 'changed' ? 'Changed' : 'Unsure'}</span> · {p.after.slice(0, 90)}{p.after.length > 90 ? '…' : ''}
                    </Hover>
                  ))}
                </div>
              )}
              <textarea value={draft} onChange={(e) => onDraft && onDraft(e.target.value)} spellCheck={false}
                style={s('flex:1;min-height:40vh;max-height:60vh;width:100%;border:none;outline:none;resize:vertical;padding:8px 10px;font-family:Consolas,Menlo,monospace;font-size:12.5px;line-height:1.55;color:' + INK + ';')} />
            </div>
          </>
        ) : (
          <div style={s('grid-column:1 / span 2;display:grid;grid-template-columns:1fr 1fr;max-height:60vh;overflow:auto;')}>
            {rows.map((r, i) => (
              <React.Fragment key={i}>
                <Cell text={r.left} kind={r.kind} side="left" mark={markFor(r.left, leftMarks)} />
                <div style={s('border-left:1px solid #d8e1e5;')}><Cell text={r.right} kind={r.kind} side="right" mark={markFor(r.right, rightMarks)} /></div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
      <div style={s('display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:' + MUTED + ';')}>
        <span><span style={s('display:inline-block;width:10px;height:10px;background:#fbe9e7;border:1px solid #f0c2bd;vertical-align:-1px;margin-right:4px;')} />removed or changed</span>
        <span><span style={s('display:inline-block;width:10px;height:10px;background:#e7f5ec;border:1px solid #a7d8b6;vertical-align:-1px;margin-right:4px;')} />added or changed</span>
        <span><span style={s('display:inline-block;width:3px;height:12px;background:' + RED + ';vertical-align:-2px;margin-right:4px;')} />meaning changed</span>
        <span><span style={s('display:inline-block;width:3px;height:12px;background:' + AMBER + ';vertical-align:-2px;margin-right:4px;')} />unsure</span>
        <span style={s('text-decoration:underline wavy ' + RED + ';')}>not carried over</span>
      </div>
    </div>
  );
}
