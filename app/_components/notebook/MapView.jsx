'use client';

// The Notebook as a treemap: every page a rectangle sized by how much is
// written on it, coloured by whether the assistant can read it. Sections are
// the boxes around them. Click a section to zoom in, a page to see why it is
// the colour it is, double-click to open it in the editor.
//
// Everything drawn here comes from /api/notebook/map, which runs the same
// parsers the assistant does — so red means "an answer built from this page
// will be wrong or missing", not "untidy".
import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import { CARD, Tile, number, ago } from '../stats/parts';
import { layoutTree } from '@/lib/notebook/treemap.mjs';

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

function Treemap({ report, rootId, onRoot, onSelect, onOpen, selectedId }) {
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

  return (
    <div ref={box} style={s('position:relative;width:100%;')}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Notebook map" style={s('display:block;font-family:inherit;')}
          onMouseLeave={() => setHover(null)}>
          {cells.filter((c) => c.depth > 0).map((c) => {
            const isSection = c.kind === 'section';
            const band = c.node.health ? c.node.health.band : 'grey';
            const selected = c.id === selectedId;
            return (
              <g key={c.kind + c.id}
                onMouseMove={(e) => { if (!isSection) setHover({ id: c.id, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }); }}
                onClick={() => (isSection ? onRoot(c.id) : onSelect(c.id))}
                onDoubleClick={() => { if (!isSection) onOpen(c.id); }}
                style={s('cursor:pointer;')}>
                <rect x={c.x} y={c.y} width={Math.max(0, c.w)} height={Math.max(0, c.h)} rx={isSection ? 6 : 3}
                  fill={isSection ? '#e6ecf0' : BAND[band]} fillOpacity={isSection ? 1 : selected ? 1 : 0.82}
                  stroke={selected ? INK : '#fff'} strokeWidth={selected ? 2 : 1} />
                {isSection && c.h > 18 && <rect x={c.x} y={c.y} width={Math.max(0, c.w)} height={18} rx={6} fill={BAND[band]} fillOpacity={0.18} />}
                {isSection && c.h > 18 && c.w > 40 && (
                  <text x={c.x + 6} y={c.y + 13} fontSize={11} fontWeight={700} fill={INK}>{fit(c.node.title, c.w)}</text>
                )}
                {!isSection && c.w > 56 && c.h > 18 && (
                  <text x={c.x + 5} y={c.y + 14} fontSize={11} fontWeight={600} fill="#fff">{fit(c.node.title, c.w)}</text>
                )}
              </g>
            );
          })}
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
          {hovered.violations.slice(0, 4).map((v, i) => (
            <div key={i} style={s('font-size:12.5px;color:' + INK + ';margin-top:4px;')}>• {RULE_TITLES[v.rule] || v.rule}</div>
          ))}
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
            : <Hover tag="button" onClick={() => onRoot(n.id)} base={'background:none;border:none;padding:0;font:inherit;color:#005eb8;cursor:pointer;'} hover="text-decoration:underline;">{n.title}</Hover>}
        </React.Fragment>
      ))}
    </div>
  );
}

function PagePanel({ page, onOpenPage }) {
  if (!page) {
    return <div style={s('font-size:14px;color:' + MUTED + ';line-height:1.55;')}>Click a page on the map to see what the assistant makes of it. Click a section to zoom in.</div>;
  }
  const band = page.health.band;
  return (
    <div>
      <div style={s('font-size:12px;color:' + MUTED + ';')}>{page.path.slice(0, -1).join(' / ')}</div>
      <div style={s('font-size:18px;font-weight:700;color:' + INK + ';margin-top:2px;letter-spacing:-0.01em;')}>{page.title}</div>
      <div style={s('display:flex;align-items:center;gap:8px;margin-top:8px;')}>
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
      <div style={s('margin-top:14px;display:flex;gap:8px;')}>
        <Hover tag="button" onClick={() => onOpenPage(page.id)}
          base="display:inline-flex;align-items:center;gap:6px;background:#005eb8;color:#fff;border:none;border-radius:8px;padding:8px 14px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;"
          hover="background:#003d78;">
          <Svg w={14} sw={2.4}>{Icons.edit}</Svg>Open page
        </Hover>
      </div>
    </div>
  );
}

export default function MapView({ notes, onOpenPage, onChanged }) {
  const [report, setReport] = React.useState(null);
  const [error, setError] = React.useState('');
  const [rootId, setRootId] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState(null);

  const stamp = (notes || []).map((n) => n.id + ':' + (n.updatedAt || '')).join('|');
  React.useEffect(() => {
    let live = true;
    fetch('/api/notebook/map', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { if (!live) return; if (data.error) setError(data.error); else { setError(''); setReport(data); } })
      .catch(() => { if (live) setError('Could not load the map.'); });
    return () => { live = false; };
  }, [stamp]);

  if (error) return <div style={s('padding:28px;color:#8a1509;font-size:14.5px;')}>{error}</div>;
  if (!report) return <div style={s('padding:28px;color:' + MUTED + ';font-size:14.5px;')}>Reading every page…</div>;

  const t = report.totals;
  const selected = selectedId ? report.pages[selectedId] : null;
  const worst = Object.values(report.pages).sort((a, b) => a.health.score - b.health.score || b.chars - a.chars).slice(0, 8);

  return (
    <div style={s('flex:1;min-height:0;overflow:auto;padding:18px 22px 40px;background:#f0f4f5;')}>
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
          <Treemap report={report} rootId={rootId} onRoot={(id) => { setRootId(id); setSelectedId(null); }} onSelect={setSelectedId} onOpen={onOpenPage} selectedId={selectedId} />
          <div style={s('display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:' + MUTED + ';')}>
            {['green', 'amber', 'red'].map((b) => (
              <span key={b} style={s('display:inline-flex;align-items:center;gap:5px;')}><span style={s('width:10px;height:10px;border-radius:2px;background:' + BAND[b] + ';')} />{b === 'green' ? 'Reads cleanly' : b === 'amber' ? 'Needs attention' : 'Assistant cannot read it'}</span>
            ))}
            <span>Area = how much is written</span>
          </div>
        </div>
        <div style={s('display:flex;flex-direction:column;gap:14px;')}>
          <div style={s(CARD + 'padding:14px 16px 16px;')}><PagePanel page={selected} onOpenPage={onOpenPage} /></div>
          <div style={s(CARD + 'padding:14px 16px 12px;')}>
            <div style={s('font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:' + MUTED + ';margin-bottom:8px;')}>Needs attention first</div>
            {worst.map((p) => (
              <Hover key={p.id} tag="button" onClick={() => { setSelectedId(p.id); }}
                base={'display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:none;border:none;padding:6px 0;font:inherit;cursor:pointer;border-top:1px solid #eef1f2;'}
                hover="background:#f7fbff;">
                <span style={s('flex:none;width:9px;height:9px;border-radius:50%;background:' + BAND[p.health.band] + ';')} />
                <span style={s('flex:1;min-width:0;font-size:13.5px;color:' + INK + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{p.title}</span>
                <span style={s('flex:none;font-size:12.5px;font-weight:700;color:' + BAND_INK[p.health.band] + ';')}>{p.health.score}</span>
              </Hover>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
