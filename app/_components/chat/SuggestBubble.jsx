'use client';

import { s, Hover, Svg, Icons } from '../ui';

export default function SuggestBubble({ v }) {
  return (
    <div>
      <div style={s('min-width:0;background:#141416;border:1px solid #26262a;border-radius:16px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.08);')}>
        <p style={s('margin:0 0 12px;font-size:17px;line-height:1.45;')}>{v.text}</p>
        <div style={s('display:flex;flex-direction:column;gap:8px;')}>
          {(v.suggestions || []).map((sug) => (
            <Hover key={sug.id} onClick={sug.onClick} base="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#0b0b0c;border:1px solid #26262a;border-radius:10px;padding:12px 14px;cursor:pointer;font:inherit;font-size:16px;font-weight:600;color:#e0554f;" hover="border-color:#e0554f;background:#151518;">
              <span style={s('flex:none;')}><Svg w={17}>{Icons.arrow}</Svg></span><span>{sug.question}</span>
            </Hover>
          ))}
        </div>
      </div>
    </div>
  );
}
