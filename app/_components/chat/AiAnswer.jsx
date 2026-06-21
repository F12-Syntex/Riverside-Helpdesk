'use client';

import { s, Hover, Svg, Icons } from '../ui';
import CiteChip from './CiteChip';

export default function AiAnswer({ v }) {
  return (
    <div style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaUp .25s ease;')}>
      <div className="riva-bot-avatar" style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #d8dde0;display:flex;align-items:center;justify-content:center;margin-top:2px;')}>
        <img src="/assets/logo.png" alt="" style={s('width:22px;height:22px;display:block;')} />
      </div>
      <div style={s('flex:1;min-width:0;background:#fff;border:1px solid #d8dde0;border-radius:16px;box-shadow:0 1px 3px rgba(33,43,50,.08);overflow:hidden;')}>
        <div style={s('background:#e8f1f8;color:#003087;padding:9px 22px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;border-bottom:1px solid #cfe1f0;')}>
          <span style={s('flex:none;')}><Svg w={16}>{Icons.fileLines}</Svg></span>Based on the practice&rsquo;s documents &mdash; open the sources below to check
        </div>

        {v.aiLoading && (
          <div style={s('padding:20px 22px;display:flex;align-items:center;gap:12px;color:#4c6272;font-size:17px;')}>
            <span style={s('display:inline-flex;gap:5px;align-items:center;')}>
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .2s;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .4s;')} />
            </span>
            <span>Checking the documents&hellip;</span>
          </div>
        )}

        {v.aiError && (
          <div style={s('padding:18px 22px;font-size:17px;line-height:1.5;color:#212b32;')}>
            <p style={s('margin:0 0 14px;')}>Sorry, something went wrong reaching the documents. Please try again.</p>
            <Hover onClick={v.onRetry} base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 0 #002a52;" active="transform:translateY(4px);box-shadow:none;"><Svg w={16} sw={2.2}>{Icons.refresh}</Svg>Try again</Hover>
          </div>
        )}

        {v.aiDeclined && (
          <div style={s('padding:18px 22px;display:flex;gap:13px;align-items:flex-start;')}>
            <span style={s('flex:none;width:30px;height:30px;border-radius:50%;background:#f0f4f5;color:#4c6272;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;')}><Svg w={17}>{Icons.infoCircle}</Svg></span>
            <div style={s('flex:1;min-width:0;')}>
              <p style={s('margin:0;font-size:17px;line-height:1.5;color:#212b32;')}>{v.intro}</p>
              <p style={s('margin:8px 0 0;font-size:15px;line-height:1.5;color:#768692;')}>Please check with the relevant lead, or a clinician if it is a clinical question.</p>
            </div>
          </div>
        )}

        {v.aiDone && (
          <>
            <div style={s('padding:18px 22px 0;')}>
              <h3 style={s('font-size:23px;margin:0;letter-spacing:-0.01em;')}>{v.question}</h3>
              {v.hasIntro && <p style={s('margin:8px 0 0;font-size:17px;color:#4c6272;')}>{v.intro}</p>}
            </div>
            {v.hasMessage && (
              <div style={s('margin:14px 22px 4px;')}>
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:6px;')}>Suggested message</div>
                <div style={s('padding:14px 16px;background:#f0f4f5;border:1px solid #d8dde0;border-left:4px solid #005eb8;border-radius:0 8px 8px 0;font-size:16px;line-height:1.55;white-space:pre-wrap;')}>{v.message}</div>
                {v.hasMessageCite && <CiteChip label={v.messageCiteLabel} onClick={v.onMessageCite} />}
              </div>
            )}
            {v.hasSteps && (
              <div style={s('padding:18px 22px;display:flex;flex-direction:column;gap:18px;')}>
                {v.steps.map((st) => (
                  <div key={st.num} style={s('display:flex;gap:14px;align-items:flex-start;')}>
                    <div style={s('flex:none;width:28px;height:28px;border-radius:50%;background:#005eb8;color:#fff;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;margin-top:1px;')}>{st.num}</div>
                    <div style={s('flex:1;min-width:0;')}>
                      <div style={s('font-size:17px;line-height:1.5;')}>{st.text}</div>
                      {st.hasCite && <CiteChip label={st.citeLabel} onClick={st.onCite} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {v.hasTip && <div style={s('margin:0 22px 16px;border-left:4px solid #005eb8;background:#e8f1f8;padding:12px 16px;border-radius:0 8px 8px 0;font-size:16px;line-height:1.5;')}><strong>Tip:</strong> {v.tip}</div>}
            <div style={s('border-top:1px solid #d8dde0;padding:12px 22px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
              <span style={s('display:inline-flex;align-items:center;gap:6px;font-size:14px;color:#4c6272;')}><Svg w={14} stroke="#007f3b" sw={2.4} style={s('flex:none;')}>{Icons.shield}</Svg>Each step is backed by a practice document</span>
              <div style={s('margin-left:auto;display:flex;gap:10px;')}>
                <Hover onClick={v.onCopy} base="background:#fff;border:2px solid #d8dde0;border-radius:8px;padding:6px 14px;font:inherit;font-size:15px;font-weight:600;color:#005eb8;cursor:pointer;display:inline-flex;align-items:center;gap:7px;" hover="border-color:#005eb8;"><Svg w={15}>{Icons.copy}</Svg>{v.copyLabel}</Hover>
                <Hover onClick={v.onSave} base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:7px 14px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;" hover="background:#003087;">Save to knowledge base</Hover>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
