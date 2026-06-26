'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from './ui';

// In-browser renderer for a PDF citation. Unlike a native <iframe src=pdf#page>
// (which cannot be highlighted), this renders the *actual* cited page of the
// original PDF to a canvas with pdf.js, finds the verbatim quote in the page's
// own text layer, draws a highlight box over it, scrolls to it, and reports the
// page and line number(s) the passage sits on. The page is the real document —
// pixel-faithful — so the source is shown IN the original, highlighted and
// verbatim. If the quote can't be located on the page (e.g. a scanned page read
// by vision), the page still renders and the passage text is shown below by the
// parent as a fallback.

// One-character-for-one normalisation so positions stay aligned: unify smart
// quotes/dashes/non-breaking spaces, then lowercase for matching.
function normChar(str) {
  return String(str || '')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/ /g, ' ')
    .toLowerCase();
}

// Try the needle, then progressively shorter / shifted anchors, so a small
// divergence (a stray glyph, a hyphenation, a footnote mark) still matches.
function findAnchor(hay, needle) {
  const cands = [needle];
  if (needle.length > 160) cands.push(needle.slice(0, 160));
  if (needle.length > 110) cands.push(needle.slice(0, 110));
  if (needle.length > 70) cands.push(needle.slice(0, 70));
  if (needle.length > 40) cands.push(needle.slice(0, 40));
  if (needle.length > 160) cands.push(needle.slice(40, 150));
  for (const c of cands) {
    if (c.length < 10) continue;
    const i = hay.indexOf(c);
    if (i !== -1) return { idx: i, len: c.length };
  }
  return null;
}

// Flatten a page's text items into a searchable string, keeping a map from each
// character back to the item it came from (or -1 for inserted separators), so a
// text match can be turned back into the set of items to highlight.
function flattenItems(items) {
  let hay = '';
  const map = [];
  let prevSpace = true;
  const push = (ch, idx) => { hay += ch; map.push(idx); };
  items.forEach((it, idx) => {
    const str = normChar(it.str);
    for (const ch of str) {
      const ws = /\s/.test(ch);
      if (ws) { if (!prevSpace) { push(' ', -1); prevSpace = true; } }
      else { push(ch, idx); prevSpace = false; }
    }
    if (!prevSpace) { push(' ', -1); prevSpace = true; } // inter-item gap
  });
  return { hay, map };
}

// Group every item into reading-order lines by its baseline y (PDF user space,
// so it is independent of render scale). Returns lineNo[itemIdx] (1-based, top
// of page = 1) and the total line count.
function computeLines(items) {
  const order = items.map((it, idx) => ({ idx, y: it.transform[5] }))
    .sort((a, b) => b.y - a.y); // larger y is higher up the page
  const lineNo = new Array(items.length).fill(0);
  let line = 0;
  let lastY = null;
  const TOL = 3; // user-space units; items within this share a line
  for (const o of order) {
    if (lastY === null || Math.abs(o.y - lastY) > TOL) { line++; lastY = o.y; }
    lineNo[o.idx] = line;
  }
  return { lineNo, count: line };
}

export default function PdfSourceView({ url, page = 1, quote = '', onResolve }) {
  const wrapRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const pdfRef = React.useRef(null);
  const pdfjsRef = React.useRef(null);
  const renderSeq = React.useRef(0);

  const [numPages, setNumPages] = React.useState(0);
  const [pageNum, setPageNum] = React.useState(page);
  const [status, setStatus] = React.useState('loading'); // loading | ready | error
  const [boxes, setBoxes] = React.useState([]);           // highlight rects (css px)
  const [canvasW, setCanvasW] = React.useState(0);
  const [canvasH, setCanvasH] = React.useState(0);

  const onResolveRef = React.useRef(onResolve);
  React.useEffect(() => { onResolveRef.current = onResolve; });

  // Load the PDF document once per url, then jump to the cited page.
  React.useEffect(() => {
    let cancelled = false;
    setStatus('loading'); setBoxes([]); setNumPages(0);
    (async () => {
      try {
        const pdfjs = pdfjsRef.current || (await import('pdfjs-dist/build/pdf.min.mjs'));
        pdfjsRef.current = pdfjs;
        if (pdfjs.GlobalWorkerOptions && !pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }
        const task = pdfjs.getDocument({ url, isEvalSupported: false });
        const doc = await task.promise;
        if (cancelled) { try { doc.destroy(); } catch (e) {} return; }
        pdfRef.current = doc;
        setNumPages(doc.numPages);
        setPageNum(Math.min(Math.max(1, page || 1), doc.numPages));
        setStatus('ready');
      } catch (e) {
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; const d = pdfRef.current; pdfRef.current = null; if (d) { try { d.destroy(); } catch (e) {} } };
  }, [url, page]);

  // Render the current page and locate + highlight the quote on it.
  const renderPage = React.useCallback(async () => {
    const pdfjs = pdfjsRef.current;
    const doc = pdfRef.current;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!pdfjs || !doc || !canvas || !wrap) return;
    const seq = ++renderSeq.current;
    try {
      const pageObj = await doc.getPage(pageNum);
      if (seq !== renderSeq.current) return;
      const cssWidth = Math.max(240, Math.min(wrap.clientWidth || 600, 900));
      const base = pageObj.getViewport({ scale: 1 });
      const scale = cssWidth / base.width;
      const viewport = pageObj.getViewport({ scale });
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      const ctx = canvas.getContext('2d');
      await pageObj.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
      if (seq !== renderSeq.current) return;
      setCanvasW(viewport.width); setCanvasH(viewport.height);

      // Locate the quote in this page's text.
      let rects = [];
      let line = null;
      const needle = normChar(quote.replace(/\s+/g, ' ')).trim();
      if (needle.length >= 10) {
        const content = await pageObj.getTextContent();
        if (seq !== renderSeq.current) return;
        const items = content.items.filter((it) => typeof it.str === 'string');
        const { hay, map } = flattenItems(items);
        const hit = findAnchor(hay, needle);
        if (hit) {
          const idxSet = new Set();
          for (let i = hit.idx; i < hit.idx + hit.len && i < map.length; i++) {
            if (map[i] >= 0) idxSet.add(map[i]);
          }
          const { lineNo } = computeLines(items);
          let minLine = Infinity, maxLine = -Infinity;
          // Merge the highlighted items into one rect per line for a clean box.
          const byLine = new Map();
          for (const idx of idxSet) {
            const it = items[idx];
            const t = pdfjs.Util.transform(viewport.transform, it.transform);
            const fontH = (it.height || Math.hypot(it.transform[2], it.transform[3])) * scale;
            const left = t[4];
            const top = t[5] - fontH;
            const right = left + it.width * scale;
            const bottom = t[5];
            const ln = lineNo[idx] || 0;
            minLine = Math.min(minLine, ln); maxLine = Math.max(maxLine, ln);
            const cur = byLine.get(ln) || { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
            cur.left = Math.min(cur.left, left); cur.top = Math.min(cur.top, top);
            cur.right = Math.max(cur.right, right); cur.bottom = Math.max(cur.bottom, bottom);
            byLine.set(ln, cur);
          }
          rects = Array.from(byLine.values()).map((r) => ({
            left: r.left - 1.5, top: r.top - 1.5,
            width: (r.right - r.left) + 3, height: (r.bottom - r.top) + 3,
          }));
          if (minLine !== Infinity) line = minLine === maxLine ? String(minLine) : minLine + '–' + maxLine;
        }
      }
      if (seq !== renderSeq.current) return;
      setBoxes(rects);
      if (onResolveRef.current) onResolveRef.current({ located: rects.length > 0, line, page: pageNum });

      // Scroll the highlight into view inside the panel's scroll container.
      if (rects.length) {
        requestAnimationFrame(() => {
          const sc = wrap.closest('[data-riva-scroll]');
          if (sc) {
            const target = sc.scrollTop + (wrap.getBoundingClientRect().top - sc.getBoundingClientRect().top) + rects[0].top - 60;
            sc.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
          }
        });
      }
    } catch (e) {
      if (seq === renderSeq.current) setBoxes([]);
    }
  }, [pageNum, quote]);

  React.useEffect(() => { if (status === 'ready') renderPage(); }, [status, pageNum, renderPage]);

  // Re-render on width changes so the highlight stays aligned to the canvas.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    let t = null;
    const onResize = () => { clearTimeout(t); t = setTimeout(() => { if (status === 'ready') renderPage(); }, 150); };
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(t); window.removeEventListener('resize', onResize); };
  }, [status, renderPage]);

  const card = 'background:#fff;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;';
  const navBtn = 'display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:7px;background:#fff;border:1px solid #d8dde0;cursor:pointer;color:#005eb8;';

  if (status === 'error') {
    return (
      <div style={s(card + 'padding:16px;font-size:14px;color:#4c6272;')}>
        The PDF could not be rendered here. Use “Open full document” below to view it.
      </div>
    );
  }

  return (
    <div>
      {numPages > 1 && (
        <div style={s('display:flex;align-items:center;gap:10px;margin:0 0 8px;')}>
          <Hover tag="button" onClick={() => setPageNum((n) => Math.max(1, n - 1))} disabled={pageNum <= 1} aria-label="Previous page" base={navBtn} hover="border-color:#005eb8;background:#f7fbff;"><Svg w={16}>{Icons.chevronLeft}</Svg></Hover>
          <span style={s('font-size:13px;color:#4c6272;font-weight:600;min-width:96px;text-align:center;')}>Page {pageNum} of {numPages}</span>
          <Hover tag="button" onClick={() => setPageNum((n) => Math.min(numPages, n + 1))} disabled={pageNum >= numPages} aria-label="Next page" base={navBtn} hover="border-color:#005eb8;background:#f7fbff;"><Svg w={16}>{Icons.chevronRight}</Svg></Hover>
          {pageNum !== page && (
            <Hover tag="button" onClick={() => setPageNum(page)} base="font:inherit;font-size:13px;font-weight:600;color:#005eb8;background:none;border:none;cursor:pointer;text-decoration:underline;" hover="color:#003087;">Back to cited page</Hover>
          )}
        </div>
      )}

      <div ref={wrapRef} style={s(card + 'position:relative;line-height:0;')}>
        {status === 'loading' && (
          <div style={s('padding:40px 16px;text-align:center;font-size:14px;color:#768692;line-height:1.5;')}>Rendering the document…</div>
        )}
        <div style={s('position:relative;display:inline-block;width:100%;')}>
          <canvas ref={canvasRef} style={s('display:block;width:100%;height:auto;')} />
          {/* Highlight overlay — positioned in the same CSS pixel space as the canvas. */}
          {canvasW > 0 && boxes.map((b, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: (b.left / canvasW * 100) + '%',
              top: (b.top / canvasH * 100) + '%',
              width: (b.width / canvasW * 100) + '%',
              height: (b.height / canvasH * 100) + '%',
              background: 'rgba(255,214,0,.42)',
              outline: '1.5px solid rgba(214,158,0,.85)',
              borderRadius: '2px',
              mixBlendMode: 'multiply',
              pointerEvents: 'none',
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
