'use client';

import { s, Hover, Svg, Icons } from './ui';

// Right-hand side panel for a citation. On desktop it shows the entire document
// in its own formatting (an iframe of the source file) and highlights the exact
// passage the statement is based on, scrolling to it. On phones the heavy embed
// is hidden (CSS); the reader sees the passage text and Open / Download buttons.

// Find the extract inside the just-loaded same-origin document, highlight it and
// scroll to it. Best-effort: any failure (cross-origin, unsupported, no match)
// leaves the document untouched and still readable.
function highlightPassage(iframe, query) {
  try {
    const win = iframe.contentWindow;
    const doc = iframe.contentDocument;
    if (!win || !doc || !doc.body || !query) return;

    const collapse = (str) => str.replace(/\s+/g, ' ');
    let needle = collapse(query).trim().toLowerCase();
    if (needle.length < 8) return;
    if (needle.length > 200) needle = needle.slice(0, 200); // a stable anchor

    // Build the document's visible text with a map back to each source position,
    // so a match in the flattened string can be turned into a DOM Range.
    const walker = doc.createTreeWalker(doc.body, 4 /* SHOW_TEXT */);
    let hay = '';
    const at = []; // at[i] = { node, offset } for hay[i]
    let prevSpace = false;
    let node;
    while ((node = walker.nextNode())) {
      const val = node.nodeValue || '';
      for (let i = 0; i < val.length; i++) {
        const ws = /\s/.test(val[i]);
        if (ws && prevSpace) continue;
        hay += ws ? ' ' : val[i];
        at.push({ node, offset: i });
        prevSpace = ws;
      }
    }
    const lc = hay.toLowerCase();
    let idx = lc.indexOf(needle);
    if (idx === -1 && needle.length > 60) idx = lc.indexOf(needle.slice(0, 60)); // looser anchor
    if (idx === -1) return;

    const start = at[idx];
    const end = at[Math.min(idx + needle.length, at.length - 1)];
    const range = doc.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    // Highlight without mutating the DOM, via the CSS Custom Highlight API.
    if (win.CSS && win.CSS.highlights && typeof win.Highlight === 'function') {
      if (!doc.getElementById('riva-hl-style')) {
        const style = doc.createElement('style');
        style.id = 'riva-hl-style';
        style.textContent = '::highlight(riva-src){ background:#ffe066; color:inherit; }';
        doc.head.appendChild(style);
      }
      win.CSS.highlights.set('riva-src', new win.Highlight(range));
    }

    const anchor = start.node.parentElement || doc.body;
    if (anchor.scrollIntoView) anchor.scrollIntoView({ block: 'center' });
  } catch (e) {
    /* leave the document as-is */
  }
}

export default function DocumentViewer({ v }) {
  const vm = v.viewer;
  const label = 'font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin:0 0 8px;';
  const action = 'display:inline-flex;align-items:center;gap:8px;border-radius:8px;padding:9px 15px;font:inherit;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;';
  const frame = s('width:100%;height:78vh;border:none;display:block;');
  const card = 'background:#fff;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;';

  return (
    <div onClick={v.onCloseViewer} style={s('position:fixed;inset:0;background:rgba(33,43,50,.5);display:flex;align-items:stretch;justify-content:flex-end;z-index:60;')}>
      <div onClick={(e) => e.stopPropagation()} style={s('width:100%;max-width:680px;background:#fff;height:100%;display:flex;flex-direction:column;box-shadow:-8px 0 32px rgba(33,43,50,.2);')}>

        <div style={s('flex:none;display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #d8dde0;')}>
          <span style={s('flex:none;width:34px;height:34px;border-radius:8px;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={18}>{Icons.file}</Svg></span>
          <div style={s('flex:1;min-width:0;')}>
            <div style={s('font-size:17px;font-weight:700;line-height:1.25;text-wrap:pretty;')}>{vm.docTitle}</div>
            <div style={s('font-size:13px;color:#768692;')}>{vm.location}</div>
          </div>
          <Hover tag="button" onClick={v.onCloseViewer} aria-label="Close" base="flex:none;background:none;border:none;cursor:pointer;color:#4c6272;padding:4px;display:flex;" hover="color:#212b32;"><Svg w={24}>{Icons.close}</Svg></Hover>
        </div>

        <div style={s('flex:1;min-height:0;overflow-y:auto;background:#f0f4f5;padding:20px;')}>

          {/* The full document, formatted, with the passage highlighted (desktop). */}
          {vm.hasFile && (
            <div className="riva-doc-embed">
              <div style={s('display:flex;align-items:center;gap:7px;font-size:13px;color:#4c6272;margin:0 0 8px;')}>
                <Svg w={14} stroke="#946200" sw={2.4} style={s('flex:none;')}>{Icons.infoCircle}</Svg>
                {vm.isHtml ? 'The passage this answer relies on is highlighted below.' : vm.isPdf ? 'The document opens at the relevant page; the exact passage is shown below.' : 'The full document is shown below.'}
              </div>
              {vm.isImage && <div style={s(card + 'padding:12px;')}><img src={vm.fileUrl} alt={vm.docTitle} style={s('display:block;max-width:100%;height:auto;margin:0 auto;')} /></div>}
              {vm.isPdf && <div style={s(card)}><iframe src={vm.pdfSrc} title={vm.docTitle} style={frame} /></div>}
              {vm.isHtml && <div style={s(card)}><iframe src={vm.fileUrl} title={vm.docTitle} style={frame} onLoad={(e) => highlightPassage(e.currentTarget, vm.text)} /></div>}
            </div>
          )}

          {/* The passage on its own — the whole content on phones, and a fallback
              where the document can't be highlighted in place (e.g. PDFs). */}
          <div className={vm.hasFile && vm.isHtml ? 'riva-doc-passage' : ''} style={s((vm.hasFile ? 'margin-top:18px;' : '') + 'min-width:0;')}>
            <div style={s(label)}>What this is based on</div>
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
