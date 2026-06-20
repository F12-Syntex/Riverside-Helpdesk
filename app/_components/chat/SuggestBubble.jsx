'use client';

import { s, Hover, Svg, Icons } from '../ui';

export default function SuggestBubble({ v }) {
  return (
    <div style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaUp .25s ease;')}>
      <div className="riva-bot-avatar" style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #d8dde0;display:flex;align-items:center;justify-content:center;margin-top:2px;')}>
        <img src="/assets/logo.png" alt="" style={s('width:22px;height:22px;display:block;')} />
      </div>
      <div style={s('flex:1;min-width:0;background:#fff;border:1px solid #d8dde0;border-radius:16px;padding:16px 20px;box-shadow:0 1px 3px rgba(33,43,50,.08);')}>
        <p style={s('margin:0 0 12px;font-size:17px;line-height:1.45;')}>{v.text}</p>
        <div style={s('display:flex;flex-direction:column;gap:8px;')}>
          {(v.suggestions || []).map((sug) => (
            <Hover key={sug.id} onClick={sug.onClick} base="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#f0f4f5;border:1px solid #d8dde0;border-radius:10px;padding:12px 14px;cursor:pointer;font:inherit;font-size:16px;font-weight:600;color:#005eb8;" hover="border-color:#005eb8;background:#f7fbff;">
              <span style={s('flex:none;')}><Svg w={17}>{Icons.arrow}</Svg></span><span>{sug.question}</span>
            </Hover>
          ))}
        </div>
      </div>
    </div>
  );
}
