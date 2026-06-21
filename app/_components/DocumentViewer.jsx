'use client';

import { s, Hover, Svg, Icons } from './ui';

// A right-hand side panel for a citation. It always leads with the exact source
// extract that backs the statement. When the source has a full document file we
// embed it underneath on desktop; on phones the embed is hidden (CSS) and the
// reader gets Open / Download buttons instead, so they aren't handed the whole
// document on a small screen unless they ask for it.
export default function DocumentViewer({ v }) {
  const vm = v.viewer;
  const label = 'font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin:0 0 8px;';
  const action = 'display:inline-flex;align-items:center;gap:8px;border-radius:8px;padding:9px 15px;font:inherit;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;';

  return (
    <div onClick={v.onCloseViewer} style={s('position:fixed;inset:0;background:rgba(33,43,50,.5);display:flex;align-items:stretch;justify-content:flex-end;z-index:60;')}>
      <div onClick={(e) => e.stopPropagation()} style={s('width:100%;max-width:560px;background:#fff;height:100%;display:flex;flex-direction:column;box-shadow:-8px 0 32px rgba(33,43,50,.2);')}>

        <div style={s('flex:none;display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #d8dde0;')}>
          <span style={s('flex:none;width:34px;height:34px;border-radius:8px;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={18}>{Icons.file}</Svg></span>
          <div style={s('flex:1;min-width:0;')}>
            <div style={s('font-size:17px;font-weight:700;line-height:1.25;text-wrap:pretty;')}>{vm.docTitle}</div>
            <div style={s('font-size:13px;color:#768692;')}>{vm.location}</div>
          </div>
          <Hover tag="button" onClick={v.onCloseViewer} aria-label="Close" base="flex:none;background:none;border:none;cursor:pointer;color:#4c6272;padding:4px;display:flex;" hover="color:#212b32;"><Svg w={24}>{Icons.close}</Svg></Hover>
        </div>

        <div style={s('flex:1;min-height:0;overflow-y:auto;background:#f0f4f5;padding:20px;')}>

          {/* The relevant extract — always shown, on every screen size. */}
          <div style={s('margin-bottom:18px;')}>
            <div style={s(label)}>What this is based on</div>
            <div style={s('background:#fff;border:1px solid #d8dde0;border-left:4px solid #005eb8;border-radius:0 8px 8px 0;padding:16px 18px;font-size:16px;line-height:1.6;color:#212b32;text-wrap:pretty;overflow-wrap:anywhere;')}>
              &ldquo;{vm.text}&rdquo;
            </div>
          </div>

          {/* The full document, when one exists. */}
          {vm.hasFile && (
            <div>
              <div style={s(label)}>Full document</div>

              {/* Desktop only — embedded preview (hidden on phones via CSS). */}
              <div className="riva-doc-embed">
                {vm.isImage && <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;padding:12px;')}>{vm.imageEl}</div>}
                {vm.isPdf && <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;')}>{vm.pdfEl}</div>}
                {vm.isHtml && <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;')}>{vm.htmlEl}</div>}
              </div>

              {/* Open / download — primary access on phones, optional on desktop. */}
              <div style={s('display:flex;flex-wrap:wrap;gap:10px;margin-top:12px;')}>
                <Hover tag="a" href={vm.fileUrl} target="_blank" rel="noopener noreferrer" base={action + 'background:#005eb8;color:#fff;border:none;'} hover="background:#003087;">
                  <Svg w={16} stroke="#fff" sw={2.2}>{Icons.file}</Svg>Open full document
                </Hover>
                <Hover tag="a" href={vm.fileUrl} download base={action + 'background:#fff;color:#005eb8;border:2px solid #d8dde0;'} hover="border-color:#005eb8;">
                  <Svg w={16} sw={2.2}>{Icons.arrow}</Svg>Download
                </Hover>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
