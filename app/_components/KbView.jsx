'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from './ui';

function KbCard({ d }) {
  return (
    <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:14px;box-shadow:0 1px 3px rgba(33,43,50,.08);overflow:hidden;')}>
      <div style={s('display:flex;align-items:center;gap:14px;padding:16px 20px;')}>
        <span style={s('flex:none;width:38px;height:38px;border-radius:9px;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={20}>{Icons.file}</Svg></span>
        <div style={s('flex:1;min-width:0;')}>
          <div style={s('font-size:17px;font-weight:700;line-height:1.25;text-wrap:pretty;')}>{d.title}</div>
          <div style={s('font-size:13.5px;color:#768692;margin-top:2px;')}>{d.subtitle}</div>
        </div>
        {d.canOpen && (
          <Hover tag="button" onClick={d.onOpen} base="flex:none;display:inline-flex;align-items:center;gap:6px;background:none;border:none;font:inherit;font-size:15px;font-weight:600;color:#005eb8;cursor:pointer;padding:6px 4px;" hover="color:#003087;">
            View <Svg w={16} sw={2.2}>{Icons.chevronRight}</Svg>
          </Hover>
        )}
      </div>
      {d.hasThumbs && (
        <div style={s('display:flex;gap:8px;overflow-x:auto;padding:0 20px 16px;')}>
          {d.thumbs.map((src, i) => (
            <Hover key={i} tag="button" onClick={d.onOpen} base="flex:none;width:88px;height:62px;border:1px solid #d8dde0;border-radius:6px;overflow:hidden;background:#f7fbff;cursor:pointer;padding:0;" hover="border-color:#005eb8;">
              <img src={src} alt="" loading="lazy" style={s('width:100%;height:100%;object-fit:cover;object-position:top;display:block;')} />
            </Hover>
          ))}
        </div>
      )}
    </div>
  );
}

export default function KbView({ v }) {
  return (
    <div style={s('max-width:820px;margin:0 auto;padding:32px 24px 48px;display:flex;flex-direction:column;gap:22px;')}>
      <div style={s('text-align:center;padding:20px 0 4px;')}>
        <div style={s('width:72px;height:72px;border-radius:18px;background:#fff;border:1px solid #d8dde0;box-shadow:0 1px 3px rgba(33,43,50,.08);display:inline-flex;align-items:center;justify-content:center;')}>
          <img src="/assets/logo.png" alt="The Riverside Practice" style={s('width:44px;height:44px;display:block;')} />
        </div>
        <h1 className="riva-hero-h1" style={s('font-size:34px;margin:18px 0 8px;letter-spacing:-0.01em;')}>Knowledge base</h1>
        <p style={s('font-size:19px;color:#4c6272;max-width:560px;margin:0 auto;text-wrap:pretty;')}>Every answer I give comes from these practice documents. I never use outside information.</p>
        {v.kbTotal > 0 && <p style={s('font-size:14px;color:#768692;margin:12px 0 0;')}>{v.kbTotal} documents indexed</p>}
      </div>

      {v.kbStatus === 'done' && v.kbTotal > 0 && (
        <div style={s('max-width:520px;width:100%;margin:0 auto;')}>
          <div style={s('display:flex;align-items:center;gap:10px;background:#fff;border:2px solid #d8dde0;border-radius:999px;padding:11px 18px;')}>
            <Svg w={18} stroke="#768692" sw={2.2}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg>
            <input value={v.kbQuery} onChange={v.onKbSearch} placeholder="Search documents…" aria-label="Search the knowledge base" style={s('flex:1;min-width:0;border:none;outline:none;font:inherit;font-size:16px;background:none;')} />
          </div>
          {v.kbHasQuery && <div style={s('text-align:center;font-size:13.5px;color:#768692;margin-top:10px;')}>{v.kbMatchCount} matching document{v.kbMatchCount === 1 ? '' : 's'}</div>}
        </div>
      )}

      {v.kbStatus === 'loading' && (
        <div style={s('display:flex;align-items:center;justify-content:center;gap:12px;color:#4c6272;font-size:17px;padding:30px 0;')}>
          <span style={s('display:inline-flex;gap:5px;align-items:center;')}>
            <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite;')} />
            <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .2s;')} />
            <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .4s;')} />
          </span>
          Loading the document library&hellip;
        </div>
      )}

      {v.kbStatus === 'error' && (
        <div style={s('text-align:center;color:#4c6272;font-size:17px;padding:24px 0;')}>
          <p style={s('margin:0 0 14px;')}>Could not load the document library.</p>
          <Hover tag="button" onClick={() => v.onSetView('kb')} base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;" hover="background:#003087;">Try again</Hover>
        </div>
      )}

      {v.kbStatus === 'done' && v.kbGroups.map((g) => (
        <div key={g.key}>
          <div style={s('font-size:13px;font-weight:700;color:#768692;text-transform:uppercase;letter-spacing:.05em;margin:0 0 12px;')}>{g.label}</div>
          <div style={s('display:flex;flex-direction:column;gap:12px;')}>
            {g.docs.map((d) => <React.Fragment key={d.docId}><KbCard d={d} /></React.Fragment>)}
          </div>
        </div>
      ))}

      {v.kbStatus === 'done' && v.kbGroups.length === 0 && (
        <div style={s('text-align:center;color:#768692;font-size:16px;padding:24px 0;')}>{v.kbHasQuery ? 'No documents match your search.' : 'No documents have been added to the knowledge base yet.'}</div>
      )}
    </div>
  );
}
