'use client';

import { s, Hover, Svg, Icons } from '../ui';

// A pasted medical document, ready to file: the concise filing title
// "(dd-Mmm-yyyy) source department actions/note" front and centre with a
// one-click copy, the parts underneath, and explicit practice actions (if any) called out
// so the reader can see at a glance whether anything needs acknowledging now.
export default function DocFileAnswer({ v }) {
  return (
    <div>
      <div style={s('min-width:0;background:#141416;border:1px solid #26262a;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden;')}>
        <div style={s('background:#221a1a;color:#f0817c;padding:9px 22px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;border-bottom:1px solid #3a2b2a;')}>
          <span style={s('flex:none;')}><Svg w={16}>{Icons.file}</Svg></span>Document filing: check the title against the document before filing
        </div>

        {v.aiLoading && (
          <div style={s('padding:20px 22px;display:flex;align-items:center;gap:12px;color:#9a9aa3;font-size:17px;')}>
            <span style={s('display:inline-flex;gap:5px;align-items:center;')}>
              <span style={s('width:8px;height:8px;border-radius:50%;background:#e0554f;animation:rivaBlink 1.2s infinite;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#e0554f;animation:rivaBlink 1.2s infinite .2s;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#e0554f;animation:rivaBlink 1.2s infinite .4s;')} />
            </span>
            <span>Reading the document&hellip;</span>
          </div>
        )}

        {v.aiError && (
          <div style={s('padding:18px 22px;font-size:17px;line-height:1.5;color:#e9e9ec;')}>
            <p style={s('margin:0 0 14px;')}>Sorry, something went wrong. Please try again.</p>
            <Hover onClick={v.onRetry} base="background:#e0554f;color:#ffffff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 0 #f5a29e;" active="transform:translateY(4px);box-shadow:none;"><Svg w={16} sw={2.2}>{Icons.refresh}</Svg>Try again</Hover>
          </div>
        )}

        {v.aiDone && (
          <>
            {/* The filing title — the thing the reader came for */}
            <div style={s('padding:18px 22px 0;')}>
              <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#74747d;margin-bottom:6px;')}>Filing title</div>
              <div style={s('display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#0b0b0c;border:1px solid #26262a;border-left:4px solid #e0554f;border-radius:0 8px 8px 0;padding:13px 16px;')}>
                <span style={s('flex:1;min-width:200px;font-size:17.5px;font-weight:600;line-height:1.45;color:#e9e9ec;word-break:break-word;')}>{v.title}</span>
                <Hover onClick={v.onCopy} base="flex:none;background:#e0554f;color:#ffffff;border:none;border-radius:8px;padding:8px 14px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:7px;" hover="background:#f0817c;"><Svg w={15} stroke="#ffffff">{Icons.copy}</Svg>{v.copyLabel}</Hover>
              </div>
            </div>

            {/* The parts, so a wrong date or department is easy to spot */}
            <div style={s('padding:14px 22px 0;display:flex;gap:22px;flex-wrap:wrap;')}>
              {v.parts.map((p, i) => (
                <div key={i} style={s('min-width:0;')}>
                  <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#74747d;margin-bottom:2px;')}>{p.label}</div>
                  <div style={s('font-size:16px;color:#e9e9ec;')}>{p.value}</div>
                </div>
              ))}
            </div>

            {v.hasActions ? (
              <div style={s('margin:16px 22px 0;border:1px solid #242428;background:#261619;border-radius:8px;padding:12px 16px;')}>
                <div style={s('display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#ff9d96;margin-bottom:8px;')}>
                  <Svg w={15} sw={2.2} stroke="#ff9d96">{Icons.alertCircle}</Svg>Explicit practice action
                </div>
                <ul style={s('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;')}>
                  {v.actions.map((a, i) => (
                    <li key={i} style={s('font-size:16px;line-height:1.45;color:#e9e9ec;')}>
                      <span style={s('color:#ff9d96;font-weight:700;margin-right:6px;')}>&bull;</span>{a}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div style={s('margin:16px 22px 0;display:flex;gap:10px;align-items:center;background:#12211a;border:1px solid #323237;border-radius:8px;padding:11px 14px;')}>
                <span style={s('flex:none;color:#56c98a;')}><Svg w={17} sw={2.4} stroke="#56c98a">{Icons.check}</Svg></span>
                <div style={s('font-size:16px;line-height:1.4;color:#7fdcaa;')}>No immediate action. File only.</div>
              </div>
            )}

            <div style={s('border-top:1px solid #26262a;margin-top:16px;padding:12px 22px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
              <span style={s('display:inline-flex;align-items:center;gap:6px;font-size:14px;color:#9a9aa3;')}><Svg w={14} stroke="#56c98a" sw={2.4} style={s('flex:none;')}>{Icons.shield}</Svg>Only explicit practice actions quoted from the document are shown</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
