'use client';

import { s, Hover, Svg, Icons } from '../ui';

// A pasted medical document, ready to file: the concise filing title
// "(dd-mm-yyyy) source department actions/note" front and centre with a
// one-click copy, the parts underneath, and the GP actions (if any) called out
// so the reader can see at a glance whether anything needs acknowledging now.
export default function DocFileAnswer({ v }) {
  return (
    <div style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaUp .25s ease;')}>
      <div className="riva-bot-avatar" style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #d8dde0;display:flex;align-items:center;justify-content:center;margin-top:2px;')}>
        <img src="/assets/logo.png" alt="" style={s('width:22px;height:22px;display:block;')} />
      </div>
      <div style={s('flex:1;min-width:0;background:#fff;border:1px solid #d8dde0;border-radius:16px;box-shadow:0 1px 3px rgba(33,43,50,.08);overflow:hidden;')}>
        <div style={s('background:#e8f1f8;color:#003087;padding:9px 22px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;border-bottom:1px solid #cfe1f0;')}>
          <span style={s('flex:none;')}><Svg w={16}>{Icons.file}</Svg></span>Document filing &mdash; check the title against the document before filing
        </div>

        {v.aiLoading && (
          <div style={s('padding:20px 22px;display:flex;align-items:center;gap:12px;color:#4c6272;font-size:17px;')}>
            <span style={s('display:inline-flex;gap:5px;align-items:center;')}>
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .2s;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .4s;')} />
            </span>
            <span>Reading the document&hellip;</span>
          </div>
        )}

        {v.aiError && (
          <div style={s('padding:18px 22px;font-size:17px;line-height:1.5;color:#212b32;')}>
            <p style={s('margin:0 0 14px;')}>Sorry, something went wrong. Please try again.</p>
            <Hover onClick={v.onRetry} base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 0 #002a52;" active="transform:translateY(4px);box-shadow:none;"><Svg w={16} sw={2.2}>{Icons.refresh}</Svg>Try again</Hover>
          </div>
        )}

        {v.aiDone && (
          <>
            {/* The filing title — the thing the reader came for */}
            <div style={s('padding:18px 22px 0;')}>
              <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:6px;')}>Filing title</div>
              <div style={s('display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#f0f4f5;border:1px solid #d8dde0;border-left:4px solid #005eb8;border-radius:0 8px 8px 0;padding:13px 16px;')}>
                <span style={s('flex:1;min-width:200px;font-size:17.5px;font-weight:600;line-height:1.45;color:#212b32;word-break:break-word;')}>{v.title}</span>
                <Hover onClick={v.onCopy} base="flex:none;background:#005eb8;color:#fff;border:none;border-radius:8px;padding:8px 14px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:7px;" hover="background:#003087;"><Svg w={15} stroke="#fff">{Icons.copy}</Svg>{v.copyLabel}</Hover>
              </div>
            </div>

            {/* The parts, so a wrong date or department is easy to spot */}
            <div style={s('padding:14px 22px 0;display:flex;gap:22px;flex-wrap:wrap;')}>
              {v.parts.map((p, i) => (
                <div key={i} style={s('min-width:0;')}>
                  <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:2px;')}>{p.label}</div>
                  <div style={s('font-size:16px;color:#212b32;')}>{p.value}</div>
                </div>
              ))}
            </div>

            {v.hasActions ? (
              <div style={s('margin:16px 22px 0;border:1px solid #f0c9c5;background:#fdf2f2;border-radius:8px;padding:12px 16px;')}>
                <div style={s('display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#a5130b;margin-bottom:8px;')}>
                  <Svg w={15} sw={2.2} stroke="#a5130b">{Icons.alertCircle}</Svg>For the GP to action
                </div>
                <ul style={s('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;')}>
                  {v.actions.map((a, i) => (
                    <li key={i} style={s('font-size:16px;line-height:1.45;color:#212b32;')}>
                      <span style={s('color:#a5130b;font-weight:700;margin-right:6px;')}>&bull;</span>{a}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div style={s('margin:16px 22px 0;display:flex;gap:10px;align-items:center;background:#eaf5ee;border:1px solid #b8d9c4;border-radius:8px;padding:11px 14px;')}>
                <span style={s('flex:none;color:#007f3b;')}><Svg w={17} sw={2.4} stroke="#007f3b">{Icons.check}</Svg></span>
                <div style={s('font-size:16px;line-height:1.4;color:#00602c;')}>Nothing for the GP to action &mdash; file only.</div>
              </div>
            )}

            <div style={s('border-top:1px solid #d8dde0;margin-top:16px;padding:12px 22px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
              <span style={s('display:inline-flex;align-items:center;gap:6px;font-size:14px;color:#4c6272;')}><Svg w={14} stroke="#007f3b" sw={2.4} style={s('flex:none;')}>{Icons.shield}</Svg>Read from the pasted document &mdash; the GP reviews the document itself when needed</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
