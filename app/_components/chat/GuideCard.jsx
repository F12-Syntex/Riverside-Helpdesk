'use client';

import { s, Hover, Svg, Icons } from '../ui';

export default function GuideCard({ v }) {
  const g = v.guide;
  return (
    <div>
      <div style={s('min-width:0;background:#141416;border:1px solid #26262a;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden;')}>
        <div style={s('padding:18px 22px 0;')}>
          <div style={s('font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#e0554f;')}>{g.categoryLabel}</div>
          <h3 style={s('font-size:23px;margin:6px 0 0;letter-spacing:-0.01em;')}>{g.title}</h3>
          {g.hasIntro && <p style={s('margin:8px 0 0;font-size:17px;color:#9a9aa3;')}>{g.intro}</p>}
        </div>
        {g.hasCards && (
          <div style={s('padding:16px 22px 4px;display:flex;flex-direction:column;gap:12px;')}>
            {g.cards.map((c, i) => (
              <div key={i} style={s('border:1px solid #26262a;border-radius:10px;overflow:hidden;')}>
                {c.isEmergency && <div style={s('background:#ff9db4;color:#ffffff;padding:10px 16px;font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px;')}><Svg w={17} stroke="#ffffff" sw={2.2}>{Icons.triangle}</Svg>{c.title}</div>}
                {c.isUrgent && <div style={s('background:#ff7b72;color:#ffffff;padding:10px 16px;font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px;')}><Svg w={17} stroke="#ffffff" sw={2.2}>{Icons.alertCircle}</Svg>{c.title}</div>}
                {c.isInfo && <div style={s('background:#e0554f;color:#ffffff;padding:10px 16px;font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px;')}><Svg w={17} stroke="#ffffff" sw={2.2}>{Icons.infoCircle}</Svg>{c.title}</div>}
                <div style={s('padding:14px 16px;background:#141416;')}>
                  {c.hasBody && <div style={s('font-size:16px;line-height:1.5;')}>{c.body}</div>}
                  {c.hasSub && <div style={s('margin-top:6px;font-size:14px;color:#74747d;line-height:1.45;')}>{c.sub}</div>}
                  {c.hasPhone && (
                    <div style={s('margin-top:12px;display:flex;align-items:center;gap:10px;')}>
                      <span style={s('flex:none;width:34px;height:34px;border-radius:50%;background:#221a1a;color:#e0554f;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={17}>{Icons.phone}</Svg></span>
                      <span><span style={s('display:block;font-size:12px;color:#74747d;')}>{c.phoneLabel}</span><span style={s('display:block;font-size:22px;font-weight:800;letter-spacing:.01em;')}>{c.phone}</span></span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={s('padding:18px 22px;display:flex;flex-direction:column;gap:18px;')}>
          {g.steps.map((st, i) => (
            <div key={i} style={s('display:flex;gap:14px;align-items:flex-start;')}>
              {st.notKbd && <div style={s('flex:none;width:28px;height:28px;border-radius:50%;background:#e0554f;color:#ffffff;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;margin-top:1px;')}>{st.badge}</div>}
              {st.isKbd && <div style={s('flex:none;min-width:42px;height:30px;padding:0 10px;border-radius:6px;background:#141416;color:#e9e9ec;border:1px solid #55555e;border-bottom-width:3px;font-weight:700;font-size:15px;font-family:ui-monospace,Menlo,Consolas,monospace;display:flex;align-items:center;justify-content:center;')}>{st.badge}</div>}
              <div style={s('flex:1;min-width:0;')}>
                <div style={s('font-size:17px;line-height:1.5;')}>{st.text}</div>
                {st.hasShot && (
                  <div style={s('margin-top:10px;border:1px solid #26262a;border-radius:8px;overflow:hidden;background:#141416;')}>
                    <div style={s('font-size:12px;color:#74747d;padding:6px 10px;border-bottom:1px solid #26262a;background:#151518;display:flex;align-items:center;gap:6px;')}><Svg w={13} stroke="#74747d">{Icons.image}</Svg>From the EMIS Web guide</div>
                    {st.shotEl}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {g.hasTip && <div style={s('margin:0 22px 16px;border-left:4px solid #e0554f;background:#221a1a;padding:12px 16px;border-radius:0 8px 8px 0;font-size:16px;line-height:1.5;')}><strong>Tip:</strong> {g.tip}</div>}
        {g.hasWarning && <div style={s('margin:0 22px 16px;border-left:4px solid #d9a441;background:#241f12;padding:12px 16px;border-radius:0 8px 8px 0;font-size:16px;line-height:1.5;')}><strong>Important:</strong> {g.warning}</div>}
        <div style={s('border-top:1px solid #26262a;padding:12px 22px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
          {v.showFeedbackButtons && (
            <>
              <span style={s('font-size:15px;color:#9a9aa3;')}>Was this helpful?</span>
              <Hover onClick={v.onHelpful} base="background:#141416;border:2px solid #26262a;border-radius:8px;padding:6px 16px;font:inherit;font-size:15px;font-weight:600;color:#e9e9ec;cursor:pointer;" hover="border-color:#56c98a;color:#56c98a;">Yes</Hover>
              <Hover onClick={v.onNotHelpful} base="background:#141416;border:2px solid #26262a;border-radius:8px;padding:6px 16px;font:inherit;font-size:15px;font-weight:600;color:#e9e9ec;cursor:pointer;" hover="border-color:#ff7b72;color:#ff7b72;">No</Hover>
            </>
          )}
          {v.feedbackGiven && <span style={s('font-size:15px;color:#56c98a;font-weight:600;')}>{v.thanksText}</span>}
          <Hover onClick={v.onCopy} base="margin-left:auto;background:#141416;border:2px solid #26262a;border-radius:8px;padding:6px 14px;font:inherit;font-size:15px;font-weight:600;color:#e0554f;cursor:pointer;display:inline-flex;align-items:center;gap:7px;" hover="border-color:#e0554f;"><Svg w={15}>{Icons.copy}</Svg>{v.copyLabel}</Hover>
        </div>
        {g.hasRelated && (
          <div style={s('border-top:1px solid #26262a;padding:12px 22px;background:#151518;')}>
            <div style={s('font-size:13px;color:#74747d;margin-bottom:8px;')}>Related</div>
            <div style={s('display:flex;gap:8px;flex-wrap:wrap;')}>
              {g.related.map((r) => <Hover key={r.id} onClick={r.onClick} base="background:#221a1a;color:#e0554f;border:1px solid #3a2b2a;border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;" hover="background:#e0554f;color:#ffffff;border-color:#e0554f;">{r.question}</Hover>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
