'use client';

import { s, Hover, Svg, Icons } from '../ui';
import CiteChip from './CiteChip';
import ContactsCard from './ContactsCard';

// How each urgency band is shown. Colours follow the NHS palette already used
// across the app (emergency red, urgent amber, routine/self-care blues/greens).
const BANDS = {
  emergency: { label: 'Emergency', bg: '#fdf2f2', border: '#d5281b', fg: '#a5130b', icon: Icons.triangle },
  urgent: { label: 'Urgent — duty doctor', bg: '#fff8e6', border: '#d9a300', fg: '#8a6100', icon: Icons.alertCircle },
  routine: { label: 'Routine', bg: '#e8f1f8', border: '#005eb8', fg: '#003087', icon: Icons.calendar },
  'self-care': { label: 'Self-care / signpost', bg: '#eaf5ee', border: '#007f3b', fg: '#00602c', icon: Icons.pill },
  unclear: { label: 'Unclear — escalate', bg: '#f0f4f5', border: '#768692', fg: '#4c6272', icon: Icons.infoCircle },
};

export default function TriageAnswer({ v }) {
  const band = BANDS[v.urgency] || BANDS.unclear;
  return (
    <div style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaUp .25s ease;')}>
      <div className="riva-bot-avatar" style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #d8dde0;display:flex;align-items:center;justify-content:center;margin-top:2px;')}>
        <img src="/assets/logo.png" alt="" style={s('width:22px;height:22px;display:block;')} />
      </div>
      <div style={s('flex:1;min-width:0;background:#fff;border:1px solid #d8dde0;border-radius:16px;box-shadow:0 1px 3px rgba(33,43,50,.08);overflow:hidden;')}>
        <div style={s('background:#e8f1f8;color:#003087;padding:9px 22px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;border-bottom:1px solid #cfe1f0;')}>
          <span style={s('flex:none;')}><Svg w={16}>{Icons.fileLines}</Svg></span>Triage notes &mdash; routing only, from the practice&rsquo;s documents. Not clinical advice.
        </div>

        {v.aiLoading && (
          <div style={s('padding:20px 22px;display:flex;align-items:center;gap:12px;color:#4c6272;font-size:17px;')}>
            <span style={s('display:inline-flex;gap:5px;align-items:center;')}>
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .2s;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .4s;')} />
            </span>
            <span>Reading the practice&rsquo;s triage protocols&hellip;</span>
          </div>
        )}

        {v.aiError && (
          <div style={s('padding:18px 22px;font-size:17px;line-height:1.5;color:#212b32;')}>
            <p style={s('margin:0 0 14px;')}>Sorry, something went wrong reaching the documents. Please try again.</p>
            <Hover onClick={v.onRetry} base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 0 #002a52;" active="transform:translateY(4px);box-shadow:none;"><Svg w={16} sw={2.2}>{Icons.refresh}</Svg>Try again</Hover>
          </div>
        )}

        {v.aiDone && (
          <>
            {/* Urgency band */}
            <div style={s('margin:18px 22px 0;display:flex;gap:12px;align-items:flex-start;border:1px solid ' + band.border + ';background:' + band.bg + ';border-left:5px solid ' + band.border + ';border-radius:0 8px 8px 0;padding:12px 16px;')}>
              <span style={s('flex:none;color:' + band.fg + ';margin-top:1px;')}><Svg w={20} sw={2.2}>{band.icon}</Svg></span>
              <div style={s('flex:1;min-width:0;')}>
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:' + band.fg + ';')}>{band.label}</div>
                {v.hasUrgencyReason && <div style={s('margin-top:3px;font-size:16px;line-height:1.45;color:#212b32;')}>{v.urgencyReason}</div>}
              </div>
            </div>

            {v.hasSummary && (
              <div style={s('padding:14px 22px 0;')}>
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:4px;')}>Request</div>
                <p style={s('margin:0;font-size:17px;line-height:1.5;color:#4c6272;')}>{v.summary}</p>
              </div>
            )}

            {v.hasActions && (
              <div style={s('padding:16px 22px 4px;')}>
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:10px;')}>Suggested actions</div>
                <div style={s('display:flex;flex-direction:column;gap:16px;')}>
                  {v.actions.map((a) => (
                    <div key={a.num} style={s('display:flex;gap:14px;align-items:flex-start;')}>
                      <div style={s('flex:none;width:28px;height:28px;border-radius:50%;background:#005eb8;color:#fff;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;margin-top:1px;')}>{a.num}</div>
                      <div style={s('flex:1;min-width:0;')}>
                        <div style={s('font-size:17px;line-height:1.5;')}>{a.text}</div>
                        {a.hasCite && <CiteChip label={a.citeLabel} onClick={a.onCite} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {v.hasRoute && (
              <div style={s('margin:14px 22px 0;display:flex;gap:10px;align-items:center;background:#f0f4f5;border:1px solid #d8dde0;border-radius:8px;padding:11px 14px;')}>
                <span style={s('flex:none;color:#005eb8;')}><Svg w={18} sw={2.2}>{Icons.arrow}</Svg></span>
                <div style={s('font-size:16px;line-height:1.4;')}><strong>Route to:</strong> {v.route}</div>
              </div>
            )}

            {v.hasRedFlags && (
              <div style={s('margin:16px 22px 0;border:1px solid #f0c9c5;background:#fdf2f2;border-radius:8px;padding:12px 16px;')}>
                <div style={s('display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#a5130b;margin-bottom:8px;')}>
                  <Svg w={15} sw={2.2} stroke="#a5130b">{Icons.triangle}</Svg>Escalate if any of these appear
                </div>
                <ul style={s('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px;')}>
                  {v.redFlags.map((r, i) => (
                    <li key={i} style={s('font-size:16px;line-height:1.45;color:#212b32;')}>
                      <span style={s('color:#a5130b;font-weight:700;margin-right:6px;')}>&bull;</span>{r.text}
                      {r.hasCite && <div><CiteChip label={r.citeLabel} onClick={r.onCite} /></div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {v.hasPatientMessage && (
              <div style={s('margin:16px 22px 4px;')}>
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:6px;')}>Draft reply to patient</div>
                <div style={s('padding:14px 16px;background:#f0f4f5;border:1px solid #d8dde0;border-left:4px solid #005eb8;border-radius:0 8px 8px 0;font-size:16px;line-height:1.55;white-space:pre-wrap;')}>{v.patientMessage}</div>
                {v.hasPatientMessageCite && <CiteChip label={v.patientMessageCiteLabel} onClick={v.onPatientMessageCite} />}
              </div>
            )}

            <ContactsCard v={v} />
            <div style={s('border-top:1px solid #d8dde0;margin-top:16px;padding:12px 22px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
              <span style={s('display:inline-flex;align-items:center;gap:6px;font-size:14px;color:#4c6272;')}><Svg w={14} stroke="#007f3b" sw={2.4} style={s('flex:none;')}>{Icons.shield}</Svg>Routing only &mdash; a clinician makes the clinical decision</span>
              <div style={s('margin-left:auto;display:flex;gap:10px;')}>
                <Hover onClick={v.onCopy} base="background:#fff;border:2px solid #d8dde0;border-radius:8px;padding:6px 14px;font:inherit;font-size:15px;font-weight:600;color:#005eb8;cursor:pointer;display:inline-flex;align-items:center;gap:7px;" hover="border-color:#005eb8;"><Svg w={15}>{Icons.copy}</Svg>{v.copyLabel}</Hover>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
