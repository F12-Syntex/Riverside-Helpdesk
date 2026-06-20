'use client';

import { s, Hover, Svg, Icons } from './ui';

export default function DocumentViewer({ v }) {
  const vm = v.viewer;
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
          {vm.isImage && <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;padding:12px;')}>{vm.imageEl}</div>}
          {vm.isPdf && <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;')}>{vm.pdfEl}</div>}
          {vm.isHtml && <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;')}>{vm.htmlEl}</div>}
          {vm.isText && <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;padding:20px 22px;font-size:16px;line-height:1.6;color:#212b32;text-wrap:pretty;')}>{vm.text}</div>}
        </div>
      </div>
    </div>
  );
}
