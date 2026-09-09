'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import SourceLink from './SourceLink';

// One medicine's result card. Presentational — the page owns the state and
// passes a card object plus callbacks. Layered by design: the plain-English
// sections show first, the more clinical detail is revealed on demand, and every
// point (and the summary) carries the source it came from.

function fmtDate(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; }
}

// A list of sourced points: each fact on its own line with the source chip
// underneath. References are crucial, so the source sits with the point itself.
function Points({ points }) {
  return (
    <div style={s('display:flex;flex-direction:column;gap:14px;')}>
      {points.map((p, i) => (
        <div key={i} style={s('display:flex;gap:12px;align-items:flex-start;')}>
          <span style={s('flex:none;width:7px;height:7px;border-radius:50%;background:#e0554f;margin-top:9px;')} />
          <div style={s('flex:1;min-width:0;')}>
            <div style={s('font-size:16.5px;line-height:1.5;')}>{p.text}</div>
            {p.cite && <SourceLink url={p.cite.url} title={p.cite.title} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({ title, points }) {
  return (
    <div>
      <h4 style={s('font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#74747d;margin:0 0 12px;')}>{title}</h4>
      <Points points={points} />
    </div>
  );
}

export default function MedicationCard({ card }) {
  const { name, query, status } = card;
  const r = card.result;
  const plain = r ? r.sections.filter((sec) => sec.tier !== 'clinical') : [];
  const clinical = r ? r.sections.filter((sec) => sec.tier === 'clinical') : [];
  const emergency = !!(r && r.queryAnswer && r.queryAnswer.emergency);
  const corrected = !!(r && r.correctedFrom && r.correctedFrom.toLowerCase() !== (r.name || '').toLowerCase());

  return (
    <div style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaUp .25s ease;')}>
      <div className="riva-bot-avatar" style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#141416;border:1px solid #26262a;display:flex;align-items:center;justify-content:center;margin-top:2px;color:#e0554f;')}>
        <Svg w={20} sw={2}>{Icons.pill}</Svg>
      </div>

      <div style={s('flex:1;min-width:0;background:#141416;border:1px solid #26262a;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden;')}>
        <div style={s('background:#221a1a;color:#f0817c;padding:9px 22px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;border-bottom:1px solid #3a2b2a;')}>
          <span style={s('flex:none;')}><Svg w={16}>{Icons.pill}</Svg></span>
          Medicines information from public UK sources (general information only)
          <Hover tag="button" onClick={card.onRemove} aria-label="Remove this result"
            base="margin-left:auto;flex:none;background:none;border:none;cursor:pointer;color:#9a9aa3;padding:2px;display:flex;" hover="color:#e9e9ec;">
            <Svg w={18}>{Icons.close}</Svg>
          </Hover>
        </div>

        {status === 'loading' && (
          <div style={s('padding:20px 22px;display:flex;align-items:center;gap:12px;color:#9a9aa3;font-size:17px;')}>
            <span style={s('display:inline-flex;gap:5px;align-items:center;')}>
              <span style={s('width:8px;height:8px;border-radius:50%;background:#e0554f;animation:rivaBlink 1.2s infinite;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#e0554f;animation:rivaBlink 1.2s infinite .2s;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#e0554f;animation:rivaBlink 1.2s infinite .4s;')} />
            </span>
            <span>Looking up {name} from NHS, BNF and eMC{query ? ', and answering your question' : ''}…</span>
          </div>
        )}

        {status === 'error' && (
          <div style={s('padding:18px 22px;font-size:17px;line-height:1.5;color:#e9e9ec;')}>
            <p style={s('margin:0 0 14px;')}>{card.message || 'Sorry, something went wrong looking this up. Please try again.'}</p>
            <Hover onClick={card.onRetry} base="background:#e0554f;color:#ffffff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 0 #f5a29e;" active="transform:translateY(4px);box-shadow:none;"><Svg w={16} sw={2.2}>{Icons.refresh}</Svg>Try again</Hover>
          </div>
        )}

        {status === 'not_found' && (
          <div style={s('padding:18px 22px;display:flex;gap:13px;align-items:flex-start;')}>
            <span style={s('flex:none;width:30px;height:30px;border-radius:50%;background:#0b0b0c;color:#9a9aa3;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;')}><Svg w={17}>{Icons.infoCircle}</Svg></span>
            <div style={s('flex:1;min-width:0;')}>
              <p style={s('margin:0;font-size:17px;line-height:1.5;color:#e9e9ec;')}>{card.message}</p>
              <Hover onClick={card.onRetry} base="margin-top:12px;background:#141416;border:2px solid #26262a;border-radius:8px;padding:7px 14px;font:inherit;font-size:15px;font-weight:600;color:#e0554f;cursor:pointer;display:inline-flex;align-items:center;gap:7px;" hover="border-color:#e0554f;"><Svg w={15} sw={2.2}>{Icons.refresh}</Svg>Try again</Hover>
            </div>
          </div>
        )}

        {status === 'ok' && r && (
          <>
            {corrected && (
              <div style={s('display:flex;gap:9px;align-items:flex-start;background:#141416;border-bottom:1px solid #18181a;padding:10px 22px;font-size:14px;color:#9a9aa3;')}>
                <span style={s('flex:none;color:#74747d;margin-top:1px;')}><Svg w={16} sw={2}>{Icons.search}</Svg></span>
                <span>Showing information for <strong style={s('color:#e9e9ec;')}>{r.name}</strong>. You searched “{r.correctedFrom}”.</span>
              </div>
            )}
            <div style={s('padding:18px 22px 0;display:flex;gap:16px;align-items:flex-start;')}>
              <div style={s('flex:1;min-width:0;')}>
                <h3 style={s('font-size:24px;margin:0;letter-spacing:-0.01em;')}>{r.name}</h3>
                {r.alsoKnownAs && (
                  <p style={s('margin:4px 0 0;font-size:14.5px;color:#74747d;')}>
                    Also known as: {r.alsoKnownAs.text}
                    {r.alsoKnownAs.cite && <SourceLink url={r.alsoKnownAs.cite.url} title={r.alsoKnownAs.cite.title} />}
                  </p>
                )}
                {r.summary && (
                  <div style={s('margin:10px 0 0;')}>
                    <p style={s('margin:0;font-size:17px;line-height:1.55;color:#9a9aa3;')}>{r.summary.text}</p>
                    {r.summary.cite && <SourceLink url={r.summary.cite.url} title={r.summary.cite.title} />}
                  </div>
                )}
              </div>
              {r.image && (
                <figure style={s('flex:none;width:120px;margin:0;text-align:center;')}>
                  <img
                    src={r.image.url}
                    alt={r.image.alt || (r.name + ' image')}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    onError={(e) => { const fig = e.currentTarget.closest('figure'); if (fig) fig.style.display = 'none'; }}
                    style={s('width:120px;height:120px;object-fit:contain;background:#151518;border:1px solid #26262a;border-radius:10px;display:block;')}
                  />
                  <figcaption style={s('margin-top:4px;font-size:11px;color:#74747d;line-height:1.3;')}>
                    {r.image.sourcePage
                      ? <a href={r.image.sourcePage} target="_blank" rel="noopener noreferrer" style={s('color:#74747d;')}>Illustrative image from Wikipedia</a>
                      : 'Illustrative image from Wikipedia'}
                  </figcaption>
                </figure>
              )}
            </div>

            {/* Emergency: urgent-help guidance, shown prominently instead of an answer */}
            {emergency && (
              <div style={s('margin:16px 22px 4px;display:flex;gap:13px;align-items:flex-start;background:#261619;border:1px solid #502624;border-left:4px solid #ff7b72;border-radius:0 8px 8px 0;padding:14px 16px;')}>
                <span style={s('flex:none;color:#ff7b72;margin-top:1px;')}><Svg w={22} sw={2.2}>{Icons.alertCircle}</Svg></span>
                <div style={s('flex:1;min-width:0;')}>
                  <p style={s('margin:0 0 4px;font-size:18px;font-weight:700;color:#ff7b72;')}>Call 999 now</p>
                  <p style={s('margin:0;font-size:16px;line-height:1.55;color:#e9e9ec;')}>{r.queryAnswer.safetyMessage}</p>
                </div>
              </div>
            )}

            {/* Specific question, when one was asked (and not an emergency) */}
            {!emergency && r.queryAnswer && (
              <div style={s('margin:16px 22px 0;')}>
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#74747d;margin-bottom:6px;')}>Your question</div>
                <div style={s('padding:14px 16px;background:#0b0b0c;border:1px solid #26262a;border-left:4px solid #e0554f;border-radius:0 8px 8px 0;')}>
                  <p style={s('margin:0 0 12px;font-size:16px;font-weight:600;line-height:1.5;')}>{r.queryAnswer.question || query}</p>
                  {r.queryAnswer.points.length
                    ? <Points points={r.queryAnswer.points} />
                    : <p style={s('margin:0;font-size:16px;line-height:1.5;color:#9a9aa3;')}>This question could not be answered from a trusted source. Please check the BNF or ask a pharmacist or the prescriber.</p>}
                </div>
              </div>
            )}

            {/* Plain-English sections */}
            {plain.length > 0 && (
              <div style={s('padding:18px 22px 4px;display:flex;flex-direction:column;gap:20px;')}>
                {plain.map((sec) => <Section key={sec.key} title={sec.title} points={sec.points} />)}
              </div>
            )}

            {/* Clinical detail — revealed on demand */}
            {clinical.length > 0 && (
              <div style={s('padding:8px 22px 4px;')}>
                <Hover tag="button" onClick={card.onToggleClinical}
                  base="display:inline-flex;align-items:center;gap:9px;background:#141416;border:2px solid #26262a;border-radius:999px;padding:8px 16px;font:inherit;font-size:15px;font-weight:600;color:#e0554f;cursor:pointer;" hover="border-color:#e0554f;">
                  <Svg w={17} sw={2.2}>{card.showClinical ? Icons.chevronLeft : Icons.chevronRight}</Svg>
                  {card.showClinical ? 'Hide clinical detail' : 'Show clinical detail (interactions, cautions, pregnancy)'}
                </Hover>
                {card.showClinical && (
                  <div style={s('margin-top:16px;padding-top:4px;display:flex;flex-direction:column;gap:20px;')}>
                    {clinical.map((sec) => <Section key={sec.key} title={sec.title} points={sec.points} />)}
                  </div>
                )}
              </div>
            )}

            {/* Sources */}
            {r.references.length > 0 && (
              <div style={s('margin:18px 22px 0;padding-top:14px;border-top:1px solid #18181a;')}>
                <h4 style={s('font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#74747d;margin:0 0 8px;')}>Sources</h4>
                <div style={s('display:flex;flex-wrap:wrap;gap:8px;')}>
                  {r.references.map((ref) => <SourceLink key={ref.url} url={ref.url} title={ref.title} />)}
                </div>
              </div>
            )}

            <div style={s('margin-top:16px;border-top:1px solid #26262a;padding:12px 22px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13.5px;color:#9a9aa3;')}>
              {r.references.length > 0 && (
                <span style={s('display:inline-flex;align-items:center;gap:6px;')}><Svg w={14} stroke="#56c98a" sw={2.4} style={s('flex:none;')}>{Icons.shield}</Svg>Every point links to its source</span>
              )}
              <span style={s('margin-left:auto;color:#74747d;')}>
                {r.fromCache ? 'Saved answer' : 'Retrieved'}{r.retrievedAt ? ' · ' + fmtDate(r.retrievedAt) : ''}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
