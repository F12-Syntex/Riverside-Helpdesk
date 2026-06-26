'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from './ui';
import PdfSourceView from './PdfSourceView';

// Right-hand side panel for a citation. On desktop it shows the entire document
// in its own formatting (an iframe of the source file), highlights the exact
// passage the statement is based on, scrolls to it, and reports the line (the
// text block) it sits on. On phones the heavy embed is hidden (CSS); the reader
// sees the passage text and Open / Download buttons. If the passage can't be
// located in the document, the passage text is shown as a fallback so a source
// is never left without its text.

// The text blocks we treat as "lines" for numbering — paragraphs, list items,
// headings, table cells and the like (a leaf block, not a layout wrapper).
const LINE_SEL = 'p,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,pre,dt,dd,figcaption,div';

// Normalise smart quotes / dashes / non-breaking spaces to plain ASCII. Every
// replacement is one-character-for-one, so positions stay aligned with the DOM.
function norm(str) {
  return str
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/ /g, ' ');
}

// Try the needle, then progressively shorter / shifted anchors, so a small
// divergence (a stray heading word, a footnote mark) doesn't defeat the match.
function findAnchor(hayLc, needle) {
  const cands = [needle];
  if (needle.length > 120) cands.push(needle.slice(0, 120));
  if (needle.length > 80) cands.push(needle.slice(0, 80));
  if (needle.length > 40) cands.push(needle.slice(0, 40));
  if (needle.length > 120) cands.push(needle.slice(30, 110));
  for (const c of cands) {
    if (c.length < 8) continue;
    const i = hayLc.indexOf(c);
    if (i !== -1) return { idx: i, len: c.length };
  }
  return null;
}

// Find the extract inside the just-loaded same-origin document, highlight it and
// scroll to it. Returns { ok, line }: ok=true when the passage was located,
// line=the 1-based text block it starts on (or null). Best-effort — any failure
// (cross-origin, unsupported, no match) returns { ok:false, line:null } and the
// document is left untouched and still readable.
function highlightPassage(iframe, query) {
  const fail = { ok: false, line: null };
  try {
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc || !doc.body || !query) return fail;

    let needle = norm(query.replace(/\s+/g, ' ')).trim().toLowerCase();
    if (needle.length < 8) return fail;
    if (needle.length > 200) needle = needle.slice(0, 200); // a stable anchor

    // Flatten the document's visible text, mapping each character back to its
    // source position so a match can be turned into a DOM Range.
    const walker = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
    let hay = '';
    const at = []; // at[i] = { node, offset } for hay[i]
    let prevSpace = false;
    let node;
    while ((node = walker.nextNode())) {
      const val = norm(node.nodeValue || '');
      for (let i = 0; i < val.length; i++) {
        const ws = /\s/.test(val[i]);
        if (ws && prevSpace) continue;
        hay += ws ? ' ' : val[i];
        at.push({ node, offset: i });
        prevSpace = ws;
      }
    }
    const found = findAnchor(hay.toLowerCase(), needle);
    if (!found) return fail;

    const start = at[found.idx];
    const end = at[Math.min(found.idx + found.len, at.length - 1)];
    const range = doc.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    // Highlight without mutating the DOM, via the CSS Custom Highlight API; fall
    // back to wrapping a single-node match in a <mark> on older browsers.
    let painted = false;
    if (win.CSS && win.CSS.highlights && typeof win.Highlight === 'function') {
      if (!doc.getElementById('riva-hl-style')) {
        const style = doc.createElement('style');
        style.id = 'riva-hl-style';
        style.textContent = '::highlight(riva-src){ background:#ffe066; color:inherit; }';
        doc.head.appendChild(style);
      }
      win.CSS.highlights.set('riva-src', new win.Highlight(range));
      painted = true;
    } else if (start.node === end.node) {
      const mark = doc.createElement('mark');
      mark.style.cssText = 'background:#ffe066;color:inherit;';
      try { range.surroundContents(mark); painted = true; } catch (e) { /* ignore */ }
    }

    const anchor = (painted && start.node.parentElement) || start.node.parentElement || doc.body;
    if (anchor && anchor.scrollIntoView) anchor.scrollIntoView({ block: 'center' });

    // Line number = the index of the text block (leaf) the passage starts in.
    const leaves = Array.from(doc.body.querySelectorAll(LINE_SEL)).filter(
      (el) => el.textContent && el.textContent.trim() && !el.querySelector(LINE_SEL),
    );
    let line = null;
    let el = start.node.parentElement;
    while (el && el !== doc.body) {
      const i = leaves.indexOf(el);
      if (i !== -1) { line = i + 1; break; }
      el = el.parentElement;
    }
    return { ok: true, line };
  } catch (e) {
    return fail;
  }
}

export default function DocumentViewer({ v }) {
  const vm = v.viewer;
  const [line, setLine] = React.useState(null);
  const [located, setLocated] = React.useState(false);
  // Reset when the panel switches to a different source.
  React.useEffect(() => { setLine(null); setLocated(false); }, [vm.fileUrl]);

  const label = 'font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin:0 0 8px;';
  const action = 'display:inline-flex;align-items:center;gap:8px;border-radius:8px;padding:9px 15px;font:inherit;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;';
  const frame = s('width:100%;height:78vh;border:none;display:block;');
  const card = 'background:#fff;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;';

  // The standalone passage is hidden on desktop ONLY when it was highlighted in
  // place; if we couldn't locate it, it stays visible so the source text shows.
  const hidePassageOnDesktop = vm.hasFile && vm.isHtml && located;
  const locParts = [vm.location, line ? 'line ' + line : ''].filter(Boolean);

  return (
    <div onClick={v.onCloseViewer} style={s('position:fixed;inset:0;background:rgba(33,43,50,.5);display:flex;align-items:stretch;justify-content:flex-end;z-index:60;')}>
      <div onClick={(e) => e.stopPropagation()} style={s('width:100%;max-width:680px;background:#fff;height:100%;display:flex;flex-direction:column;box-shadow:-8px 0 32px rgba(33,43,50,.2);')}>

        <div style={s('flex:none;display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #d8dde0;')}>
          <span style={s('flex:none;width:34px;height:34px;border-radius:8px;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={18}>{Icons.file}</Svg></span>
          <div style={s('flex:1;min-width:0;')}>
            <div style={s('font-size:17px;font-weight:700;line-height:1.25;text-wrap:pretty;')}>{vm.docTitle}</div>
            <div style={s('font-size:13px;color:#768692;')}>{locParts.join(' · ')}</div>
          </div>
          <Hover tag="button" onClick={v.onCloseViewer} aria-label="Close" base="flex:none;background:none;border:none;cursor:pointer;color:#4c6272;padding:4px;display:flex;" hover="color:#212b32;"><Svg w={24}>{Icons.close}</Svg></Hover>
        </div>

        <div data-riva-scroll="" style={s('flex:1;min-height:0;overflow-y:auto;background:#f0f4f5;padding:20px;')}>

          {/* The full document, formatted, with the passage highlighted (desktop). */}
          {vm.hasFile && (
            <div className="riva-doc-embed">
              <div style={s('display:flex;align-items:center;gap:7px;font-size:13px;color:#4c6272;margin:0 0 8px;')}>
                <Svg w={14} stroke="#946200" sw={2.4} style={s('flex:none;')}>{Icons.infoCircle}</Svg>
                {vm.isHtml ? (located ? 'The passage this answer relies on is highlighted below' + (line ? ' (line ' + line + ').' : '.') : 'Showing the full document. The exact passage is shown below.')
                  : vm.isPdf ? (located ? 'The exact passage is highlighted in the original document below' + (line ? ' (page ' + (vm.page || '?') + ', line ' + line + ').' : '.') : 'Showing the original document. The exact passage is shown below.')
                  : 'The full document is shown below.'}
              </div>
              {vm.isImage && <div style={s(card + 'padding:12px;')}><img src={vm.fileUrl} alt={vm.docTitle} style={s('display:block;max-width:100%;height:auto;margin:0 auto;')} /></div>}
              {vm.isPdf && <PdfSourceView url={vm.fileUrl} page={vm.page || 1} quote={vm.text} onResolve={(r) => { setLocated(r.located); setLine(r.line); }} />}
              {vm.isHtml && <div style={s(card)}><iframe src={vm.fileUrl} title={vm.docTitle} style={frame} onLoad={(e) => { const r = highlightPassage(e.currentTarget, vm.text); setLocated(r.ok); setLine(r.line); }} /></div>}
            </div>
          )}

          {/* The passage text. Always present; hidden on desktop only when it was
              highlighted in the document above. The source text is thus never
              missing — it's here whenever the highlight couldn't be placed. */}
          <div className={hidePassageOnDesktop ? 'riva-doc-passage' : ''} style={s((vm.hasFile ? 'margin-top:18px;' : '') + 'min-width:0;')}>
            <div style={s(label)}>What this is based on{line ? ' · line ' + line : ''}</div>
            <div style={s('background:#fff;border:1px solid #d8dde0;border-left:4px solid #ffb81c;border-radius:0 8px 8px 0;padding:16px 18px;font-size:16px;line-height:1.6;color:#212b32;text-wrap:pretty;overflow-wrap:anywhere;')}>
              &ldquo;{vm.text}&rdquo;
            </div>

            {vm.hasFile && (
              <div style={s('display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;')}>
                <Hover tag="a" href={vm.fileUrl} target="_blank" rel="noopener noreferrer" base={action + 'background:#005eb8;color:#fff;border:none;'} hover="background:#003087;">
                  <Svg w={16} stroke="#fff" sw={2.2}>{Icons.file}</Svg>Open full document
                </Hover>
                <Hover tag="a" href={vm.fileUrl} download base={action + 'background:#fff;color:#005eb8;border:2px solid #d8dde0;'} hover="border-color:#005eb8;">
                  <Svg w={16} sw={2.2}>{Icons.arrow}</Svg>Download
                </Hover>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
