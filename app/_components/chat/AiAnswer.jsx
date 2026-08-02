'use client';

import { s, Hover, Svg, Icons } from '../ui';
import CiteChip from './CiteChip';
import JudgementChip from './JudgementChip';
import ContactsCard from './ContactsCard';
import WorkingState from './WorkingState';
import Rich from './Rich';
import Md from './Md';

// A section written from a web page rather than the practice's own material.
// Deliberately unlike a citation chip: it opens the internet, not a practice
// document, and the reader must be able to tell those apart at a glance.
function WebChip({ label, url }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" title={url}
      style={s('margin-top:5px;display:inline-flex;align-items:center;gap:5px;max-width:100%;font-size:12px;font-weight:500;color:#8a6100;text-decoration:none;')}>
      <Svg w={11} sw={2} style={s('flex:none;opacity:.8;')}>{Icons.globe}</Svg>
      <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px dotted #d8bd7a;')}>From the web: {label}</span>
    </a>
  );
}

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

// This answer was not worked out just now: it was given earlier and kept, and
// is being shown again instead of costing another twenty seconds. Said at the
// top of the card, before the answer is read rather than after — with the
// question it was originally written for whenever the wording differed, and
// Reload for anyone who would rather have it researched again.
function CacheBar({ v }) {
  return (
    <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:9px 24px;background:#f0f4f5;border-bottom:1px solid #e3e9ec;')}>
      <span style={s('display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#4c6272;')}>
        <Svg w={14} sw={2.2} style={s('flex:none;')}>{Icons.refresh}</Svg>{v.cachedLabel}
      </span>
      {v.hasCachedQuestion && (
        <span style={s('flex:1 1 240px;min-width:0;font-size:13px;color:#768692;overflow-wrap:anywhere;')}>
          Asked before as &ldquo;{v.cachedQuestion}&rdquo;
        </span>
      )}
      <Hover tag="button" type="button" onClick={v.onReload} title="Ask this again and replace the saved answer"
        base="margin-left:auto;display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid #aeb7bb;border-radius:999px;padding:5px 13px;font:inherit;font-size:13px;font-weight:600;color:#005eb8;cursor:pointer;"
        hover="border-color:#005eb8;background:#f7fbff;">
        <Svg w={13} sw={2.4}>{Icons.refresh}</Svg>Reload
      </Hover>
    </div>
  );
}

// The answer in brief, at the top of the card. Someone with a patient at the
// desk reads this and nothing else, so it carries the whole answer in two to
// four lines — and a point that risks safety, a breach or a deadline is red,
// not another grey bullet.
function KeyPoints({ points }) {
  return (
    <div style={s('margin:14px 24px 0;border:1px solid #d8dde0;border-radius:12px;background:#f7fafb;padding:12px 15px 13px;')}>
      <div style={s('font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#768692;margin-bottom:9px;')}>In brief</div>
      <ul style={s('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;')}>
        {points.map((p) => (
          <li key={p.key} style={s('display:flex;gap:9px;align-items:flex-start;')}>
            <span style={s('flex:none;margin-top:2px;display:flex;color:' + (p.isCritical ? '#d5281b' : '#007f3b') + ';')}>
              <Svg w={15} sw={2.4}>{p.isCritical ? Icons.alertCircle : Icons.check}</Svg>
            </span>
            <span style={s('font-size:15.5px;line-height:1.45;color:#212b32;' + (p.isCritical ? 'font-weight:700;' : ''))}>
              <Rich text={p.text} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// One section of the body. Three looks, because the reader must be able to tell
// them apart without reading: a critical block is a red callout, a web-sourced
// block is amber-edged and links out, and an ordinary practice-backed block is
// plain text with its quiet citation.
function Section({ sec }) {
  const heading = sec.hasHeading ? (
    <div style={s('font-size:17.5px;font-weight:700;color:#212b32;margin:0 0 7px;letter-spacing:-0.01em;')}>{sec.heading}</div>
  ) : null;

  if (sec.isCritical) {
    return (
      <div style={s('border:1px solid #f0c2bd;border-left:4px solid #d5281b;background:#fdf4f3;border-radius:0 12px 12px 0;padding:13px 16px 14px;')}>
        <div style={s('display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#a51b0f;margin-bottom:8px;')}>
          <Svg w={14} stroke="#d5281b" sw={2.4} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
          {sec.hasHeading ? sec.heading : 'Must not be missed'}
        </div>
        <Md text={sec.markdown} />
        {sec.hasImages && <SourceImages images={sec.images} />}
        {sec.isWeb ? <WebChip label={sec.webLabel} url={sec.webUrl} /> : (sec.hasCite && <CiteChip label={sec.citeLabel} onClick={sec.onCite} />)}
      </div>
    );
  }

  return (
    <div style={s(sec.isWeb ? 'border-left:3px solid #ecd39a;padding-left:13px;' : '')}>
      {heading}
      <Md text={sec.markdown} />
      {sec.hasImages && <SourceImages images={sec.images} />}
      {sec.isWeb ? <WebChip label={sec.webLabel} url={sec.webUrl} /> : (sec.hasCite && <CiteChip label={sec.citeLabel} onClick={sec.onCite} />)}
    </div>
  );
}

// The four fields that decide where a referral goes. Lifted out of the steps and
// put above them: a receptionist reading this has the e-RS form open, and the
// speciality + clinic type pairing is the thing they came for. Wrong pairing
// means the referral lands in the wrong service, so it gets the loudest
// treatment in the answer — louder than a critical section.

// What the card says instead of a value it does not have. Leaving the row out
// altogether reads as though the field did not matter; a plausible-looking guess
// in its place is worse still, because this is the box that gets typed into.
const NOT_RECORDED = 'Not recorded — take it from the doctor’s task';

// A condition the assistant cannot resolve, because it cannot see the doctor's
// task: "Extended Scope only when the doctor has asked for it". Shown against
// the field it applies to rather than buried in the steps below.
function RouteCondition({ text }) {
  return (
    <span style={s('display:flex;gap:7px;align-items:flex-start;margin-top:7px;font-size:13.5px;line-height:1.45;font-weight:500;color:#8a6100;')}>
      <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={14} stroke="#b58500" sw={2.2}>{Icons.alertCircle}</Svg></span>
      <span>{text}</span>
    </span>
  );
}

function RouteValue({ row }) {
  const size = row.strong ? '18px' : '16px';
  const weight = row.strong ? '700' : '600';
  if (row.options.length > 1) {
    // The material records a choice, so the card shows the choice. Picking one
    // of these for the reader is exactly the thing that cannot be done safely.
    return (
      <>
        {row.options.map((option, i) => (
          <span key={option} style={s('display:block;color:#212b32;overflow-wrap:anywhere;font-size:' + size + ';font-weight:' + weight + ';' + (i ? 'margin-top:3px;' : ''))}>
            {i > 0 && <span style={s('font-size:13.5px;font-weight:600;color:#768692;margin-right:7px;')}>or</span>}
            {option}
          </span>
        ))}
      </>
    );
  }
  if (row.value) {
    return <span style={s('display:block;color:#212b32;overflow-wrap:anywhere;font-size:' + size + ';font-weight:' + weight + ';')}>{row.value}</span>;
  }
  return (
    <span style={s('display:flex;gap:7px;align-items:flex-start;font-size:15px;font-weight:600;color:#8a6100;')}>
      <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={15} stroke="#b58500" sw={2.2}>{Icons.alertCircle}</Svg></span>
      <span>{NOT_RECORDED}</span>
    </span>
  );
}

// The pairing above was not recorded in the practice's notes — it was worked out
// from the practice's own data. That has to be said, and saying "matched from a
// list" is not enough on its own: the reader is about to type these two values
// into e-RS, so the block names every source the determination went through —
// the SNOMED concept the wording resolved to, the e-RS referral-types list the
// pairing came out of, how close the match was, and what else was close to it.
function DeterminedFrom({ label, children }) {
  return (
    <li style={s('display:flex;flex-wrap:wrap;gap:2px 8px;')}>
      <span style={s('flex:none;font-weight:700;')}>{label}</span>
      <span style={s('flex:1 1 180px;min-width:0;overflow-wrap:anywhere;')}>{children}</span>
    </li>
  );
}

function Determined({ determination }) {
  const d = determination || null;
  const snomed = d && d.snomed && d.snomed.conceptId ? d.snomed : null;
  const alternatives = d ? (d.alternatives || []).filter((a) => a && a.specialty && a.clinicType) : [];
  // A percentage rather than the raw score: the reader is judging how much to
  // trust a value, not reading a ranking function.
  const closeness = d && typeof d.confidence === 'number' && d.confidence > 0
    ? Math.round(d.confidence * 100) + '% match'
    : '';

  return (
    <div style={s('padding:11px 16px 12px;border-top:1px solid #eef1f2;background:#fffdf5;font-size:13.5px;line-height:1.5;color:#8a6100;')}>
      <div style={s('display:flex;gap:8px;align-items:flex-start;')}>
        <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={15} stroke="#b58500" sw={2.2}>{Icons.sparkle}</Svg></span>
        <span>
          <strong>Not recorded in the practice&rsquo;s notes.</strong> This pairing was determined from the practice&rsquo;s
          own referral data &mdash; check it against the doctor&rsquo;s task before sending.
        </span>
      </div>
      {d && (
        <ul style={s('margin:9px 0 0 23px;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px;font-size:13px;')}>
          {snomed && (
            <DeterminedFrom label="Condition">
              {snomed.term} &mdash; SNOMED CT {snomed.conceptId}
            </DeterminedFrom>
          )}
          <DeterminedFrom label="Pairing">
            e-RS referral types &mdash; the specialities and clinic types e-RS accepts{closeness ? ' (' + closeness + ')' : ''}
          </DeterminedFrom>
          {!!alternatives.length && (
            <DeterminedFrom label="Also close">
              {alternatives.map((a) => a.specialty + ' / ' + a.clinicType).join('; ')}
            </DeterminedFrom>
          )}
        </ul>
      )}
    </div>
  );
}

function ReferralRoute({ route }) {
  const options = (route.clinicTypeOptions || []).filter(Boolean);
  const rows = [
    { label: 'Request type', value: route.requestType, strong: false, options: [], skip: !route.requestType },
    { label: 'Priority', value: route.priority, strong: /2ww|urgent/i.test(route.priority || ''), options: [], skip: !route.priority },
    // The pairing a referral cannot be sent without. These two rows are shown
    // even when the material does not record them — saying so IS the answer.
    { label: 'Speciality', value: route.specialty, strong: true, options: [] },
    { label: 'Clinic type', value: route.clinicType, strong: true, options, condition: String(route.clinicTypeCondition || '').trim() },
  ].filter((row) => !row.skip);
  if (!rows.length) return null;
  return (
    <div style={s('margin:16px 24px 0;border:2px solid #005eb8;border-radius:12px;overflow:hidden;background:#fff;')}>
      <div style={s('display:flex;align-items:center;gap:8px;padding:9px 16px;background:#005eb8;color:#fff;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;')}>
        <Svg w={15} stroke="#fff" sw={2.4}>{Icons.check}</Svg>Set this on e-RS
      </div>
      <div>
        {rows.map((row, i) => (
          <div key={row.label} style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px;padding:10px 16px;' + (i ? 'border-top:1px solid #eef1f2;' : ''))}>
            <span style={s('flex:none;min-width:104px;font-size:13.5px;font-weight:600;color:#4c6272;')}>{row.label}</span>
            <span style={s('flex:1 1 auto;min-width:0;')}>
              <RouteValue row={row} />
              {row.condition && <RouteCondition text={row.condition} />}
            </span>
          </div>
        ))}
      </div>
      {route.source === 'suggested' && <Determined determination={route.determination} />}
    </div>
  );
}

export default function AiAnswer({ v }) {
  return (
    <div>
      <div style={s('min-width:0;background:#fff;border:1px solid #d8dde0;border-radius:16px;box-shadow:0 1px 3px rgba(33,43,50,.08);overflow:hidden;')}>
        {/* The agent is working: one readable line saying what it is doing
            now, rather than a grid of every lookup in unreadable type. */}
        {v.aiLoading && <WorkingState steps={v.steps} statusText={v.statusText} />}

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
                <p style={s('margin:0;font-size:18px;line-height:1.55;color:#212b32;')}><Rich text={v.intro} /></p>
                <p style={s('margin:8px 0 0;font-size:15px;line-height:1.5;color:#768692;')}>Please check with the relevant lead, or a clinician if it is a clinical question.</p>
              </div>
            </div>
            <ContactsCard v={v} />
            {v.hasContacts && <div style={s('height:12px;')} />}
          </>
        )}

        {v.aiDone && (
          <>
            {v.isCached && <CacheBar v={v} />}

            <div style={s('padding:20px 24px 0;')}>
              <h3 style={s('font-size:23px;margin:0;letter-spacing:-0.01em;')}>{v.question}</h3>
              {v.hasIntro && <p style={s('margin:8px 0 0;font-size:18px;line-height:1.6;color:#4c6272;')}><Rich text={v.intro} /></p>}
            </div>

            {v.hasReferralRoute && <ReferralRoute route={v.referralRoute} />}

            {v.hasKeyPoints && <KeyPoints points={v.keyPoints} />}

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
                  <Section key={sec.key} sec={sec} />
                ))}
              </div>
            )}

            {v.hasGaps && (
              // What the practice's own material does not cover, said plainly
              // rather than filled in from the model's general knowledge.
              <div style={s('margin:12px 24px 4px;display:flex;gap:10px;align-items:flex-start;border:1px solid #d8dde0;background:#f7fafb;border-radius:10px;padding:12px 14px;')}>
                <span style={s('flex:none;color:#4c6272;display:flex;margin-top:2px;')}><Svg w={16} sw={2.2}>{Icons.infoCircle}</Svg></span>
                <div style={s('font-size:14.5px;line-height:1.5;color:#4c6272;')}>
                  <strong style={s('color:#212b32;')}>Not in the practice&rsquo;s own material:</strong> <Rich text={v.gaps} />
                </div>
              </div>
            )}

            {v.hasMessage && (
              <div style={s('margin:10px 24px 4px;')}>
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:6px;')}>Suggested message</div>
                <div style={s('padding:14px 16px;background:#f0f4f5;border:1px solid #d8dde0;border-left:4px solid #005eb8;border-radius:0 8px 8px 0;font-size:17px;line-height:1.6;white-space:pre-wrap;')}>{v.message}</div>
                {v.hasMessageImages && <SourceImages images={v.messageImages} />}
                {v.hasMessageCite ? <CiteChip label={v.messageCiteLabel} onClick={v.onMessageCite} /> : <JudgementChip label="AI-drafted wording: check before sending" />}
              </div>
            )}

            {v.hasTip && <div style={s('margin:14px 24px 4px;border-left:4px solid #005eb8;background:#e8f1f8;padding:12px 16px;border-radius:0 8px 8px 0;font-size:17px;line-height:1.55;')}><strong>Tip:</strong> <Rich text={v.tip} /></div>}

            {v.hasFollowUps && (
              // A step with its own procedure behind it is left out of the answer
              // and offered here instead. One tap asks it in this same chat, so
              // the reader never loses the referral they were part way through.
              <div style={s('margin:14px 24px 4px;')}>
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:7px;')}>Ask next</div>
                <div style={s('display:flex;flex-direction:column;gap:8px;')}>
                  {v.followUps.map((f) => (
                    <Hover key={f.key} onClick={f.onClick}
                      base="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#f0f4f5;border:1px solid #d8dde0;border-radius:10px;padding:11px 14px;cursor:pointer;font:inherit;font-size:16px;font-weight:600;color:#005eb8;"
                      hover="border-color:#005eb8;background:#f7fbff;">
                      <span style={s('flex:none;display:flex;')}><Svg w={17}>{Icons.arrow}</Svg></span><span>{f.question}</span>
                    </Hover>
                  ))}
                </div>
              </div>
            )}

            <div style={s('height:12px;')} />
            <ContactsCard v={v} />
            {v.hasContacts && <div style={s('height:12px;')} />}

            {v.hasProvenanceNote && (
              <div style={s('border-top:1px solid #eef1f2;padding:10px 22px 12px;display:flex;flex-direction:column;gap:3px;')}>
                {v.usedJudgement && <span style={s('font-size:12.5px;color:#768692;')}>Amber blocks are AI judgement, not the practice&rsquo;s documents</span>}
                {v.usedWeb && <span style={s('font-size:12.5px;color:#768692;')}>Sections marked &ldquo;from the web&rdquo; are general guidance found online, not practice policy</span>}
                {v.hasDropped && <span style={s('font-size:12.5px;color:#768692;')}>{v.droppedNote}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
