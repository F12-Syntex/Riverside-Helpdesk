'use client';

import React from 'react';
import { s } from './ui';
import GuideCard from './chat/GuideCard';
import SuggestBubble from './chat/SuggestBubble';
import AiAnswer from './chat/AiAnswer';
import TriageAnswer from './chat/TriageAnswer';
import DocFileAnswer from './chat/DocFileAnswer';

export default function ChatView({ v }) {
  return (
    <div style={s('max-width:820px;margin:0 auto;padding:32px 24px 28px;display:flex;flex-direction:column;gap:20px;')}>

      {/* Empty state: nothing at all. An empty chat is the composer and the
          page, with no hero and no example questions to read past. The
          patient-data warning stands above the composer instead, where it
          is in view on every screen rather than only this one. */}

      {v.messages.map((m, i) => (
        <React.Fragment key={i}>
          {m.isUser && (
            <div style={s('display:flex;justify-content:flex-end;animation:rivaUp .25s ease;')}>
              <div style={s('max-width:75%;background:#005eb8;color:#fff;border-radius:16px 16px 4px 16px;padding:12px 16px;font-size:17px;line-height:1.45;')}>
                {m.hasImages && (
                  <div style={s('display:flex;gap:8px;flex-wrap:wrap;margin-bottom:' + (m.text ? '10px' : '0') + ';')}>
                    {m.images.map((src, j) => (
                      <img key={j} src={src} alt="Attached image" style={s('max-width:200px;max-height:160px;border-radius:10px;display:block;background:#fff;')} />
                    ))}
                  </div>
                )}
                {m.imageNote && <div style={s('font-size:13.5px;opacity:.85;margin-bottom:' + (m.text ? '6px' : '0') + ';')}>{m.imageNote}</div>}
                {m.text}
              </div>
            </div>
          )}
          {m.isAnswer && <GuideCard v={m} />}
          {m.isSuggest && <SuggestBubble v={m} />}
          {m.isAi && <AiAnswer v={m} />}
          {m.isTriage && <TriageAnswer v={m} />}
          {m.isDocFile && <DocFileAnswer v={m} />}
        </React.Fragment>
      ))}
    </div>
  );
}
