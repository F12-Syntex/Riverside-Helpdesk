'use client';

import { s, Hover, Svg, Icons } from '../ui';
import CiteChip from './CiteChip';
import JudgementChip from './JudgementChip';
import ContactsCard from './ContactsCard';
import Rich from './Rich';
import Md from './Md';

// The assistant's answer, laid out like an AI-formatted notebook page: markdown
// sections (headings, lists, tables, highlights) with per-section provenance —
// a quiet citation link for document-backed sections (with any pictures from
// that source shown as thumbnails), and a clearly marked amber block for
// anything that comes from the assistant's own judgement.

// Thumbnails of the pictures that live in a section's source — a notebook
// note's attached images, or the cited PDF page. Click to view full-size.
function SourceImages({ images }) {
  return (
    <div style={s('display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;')}>
      {images.map((im, i) => (
        <Hover key={i} tag="button" type="button" onClick={im.onOpen} aria-label="Open image from the source" title="Open image from the source" base="padding:0;border:1px solid #d8dde0;border-radius:10px;background:#fff;cursor:pointer;overflow:hidden;display:block;line-height:0;" hover="border-color:#005eb8;box-shadow:0 2px 8px rgba(33,43,50,.14);">
          <img src={im.src} alt="Image from the source" style={s('display:block;max-height:150px;max-width:230px;width:auto;height:auto;')} />
        </Hover>
      ))}
    </div>
  );
}

export default function AiAnswer({ v }) {
  return (
    <div style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaUp .25s ease;')}>
      <div className="riva-bot-avatar" style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #d8dde0;display:flex;align-items:center;justify-content:center;margin-top:2px;')}>
        <img src="/assets/logo.png" alt="" style={s('width:22px;height:22px;display:block;')} />
      </div>
      <div style={s('flex:1;min-width:0;background:#fff;border:1px solid #d8dde0;border-radius:16px;box-shadow:0 1px 3px rgba(33,43,50,.08);overflow:hidden;')}>
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
          <>
            <div style={s('padding:18px 22px;display:flex;gap:13px;align-items:flex-start;')}>
              <span style={s('flex:none;width:30px;height:30px;border-radius:50%;background:#f0f4f5;color:#4c6272;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;')}><Svg w={17}>{Icons.infoCircle}</Svg></span>
              <div style={s('flex:1;min-width:0;')}>
                <p style={s('margin:0;font-size:17px;line-height:1.5;color:#212b32;')}><Rich text={v.intro} /></p>
                <p style={s('margin:8px 0 0;font-size:15px;line-height:1.5;color:#768692;')}>Please check with the relevant lead, or a clinician if it is a clinical question.</p>
              </div>
            </div>
            <ContactsCard v={v} />
            {v.hasContacts && <div style={s('height:12px;')} />}
          </>
        )}

        {v.aiDone && (
          <>
            <div style={s('padding:20px 24px 0;')}>
              <h3 style={s('font-size:23px;margin:0;letter-spacing:-0.01em;')}>{v.question}</h3>
              {v.hasIntro && <p style={s('margin:8px 0 0;font-size:17px;line-height:1.55;color:#4c6272;')}><Rich text={v.intro} /></p>}
            </div>

            {v.hasSections && (
              <div style={s('padding:16px 24px 6px;display:flex;flex-direction:column;gap:16px;')}>
                {v.sections.map((sec) => sec.isJudgement ? (
                  <div key={sec.key} style={s('border:1px dashed #ecd39a;background:#fffdf5;border-radius:12px;padding:12px 16px 13px;')}>
                    <div style={s('display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8a6100;margin-bottom:8px;')}>
                      <Svg w={14} stroke="#b58500" sw={2.2} style={s('flex:none;')}>{Icons.sparkle}</Svg>AI judgement
                    </div>
                    <Md text={sec.markdown} />
                  </div>
                ) : (
                  <div key={sec.key}>
                    <Md text={sec.markdown} />
                    {sec.hasImages && <SourceImages images={sec.images} />}
                    {sec.hasCite && <CiteChip label={sec.citeLabel} onClick={sec.onCite} />}
                  </div>
                ))}
              </div>
            )}

            {v.hasMessage && (
              <div style={s('margin:10px 24px 4px;')}>
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:6px;')}>Suggested message</div>
                <div style={s('padding:14px 16px;background:#f0f4f5;border:1px solid #d8dde0;border-left:4px solid #005eb8;border-radius:0 8px 8px 0;font-size:16px;line-height:1.55;white-space:pre-wrap;')}>{v.message}</div>
                {v.hasMessageCite ? <CiteChip label={v.messageCiteLabel} onClick={v.onMessageCite} /> : <JudgementChip label="AI-drafted wording: check before sending" />}
              </div>
            )}

            {v.hasTip && <div style={s('margin:14px 24px 4px;border-left:4px solid #005eb8;background:#e8f1f8;padding:12px 16px;border-radius:0 8px 8px 0;font-size:16px;line-height:1.5;')}><strong>Tip:</strong> <Rich text={v.tip} /></div>}

            <div style={s('height:12px;')} />
            <ContactsCard v={v} />
            {v.hasContacts && <div style={s('height:12px;')} />}

            <div style={s('border-top:1px solid #eef1f2;padding:10px 22px 12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
              {v.usedJudgement && (
                <span style={s('font-size:12.5px;color:#768692;')}>Amber blocks are AI judgement, not the practice&rsquo;s documents</span>
              )}
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
