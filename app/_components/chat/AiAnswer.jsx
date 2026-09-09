'use client';

import { s, Hover, Svg, Icons } from '../ui';
import CiteChip from './CiteChip';
import JudgementChip from './JudgementChip';
import ContactsCard from './ContactsCard';
import WorkingState from './WorkingState';
import Rich from './Rich';
import Md from './Md';
import TemplateView from '../templates/TemplateView';
import UnresolvedPanel from './UnresolvedPanel';

// A section written from a web page rather than the practice's own material.
// Deliberately unlike a citation chip: it opens the internet, not a practice
// document, and the reader must be able to tell those apart at a glance.
function WebChip({ label, url }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" title={url}
      style={s('margin-top:5px;display:inline-flex;align-items:center;gap:5px;max-width:100%;font-size:12px;font-weight:500;color:#e0b85f;text-decoration:none;')}>
      <Svg w={11} sw={2} style={s('flex:none;opacity:.8;')}>{Icons.globe}</Svg>
      <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-bottom:1px dotted #51442a;')}>From the web: {label}</span>
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
        <Hover key={i} tag="button" type="button" onClick={im.onOpen} aria-label="Open image from the source" title="Open image from the source" base="padding:0;border:1px solid #26262a;border-radius:10px;background:#141416;cursor:pointer;overflow:hidden;display:block;line-height:0;" hover="border-color:#e0554f;box-shadow:0 2px 8px rgba(0,0,0,.14);">
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
    <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:9px 0;background:#0b0b0c;border-bottom:1px solid #1d1d20;')}>
      <span style={s('display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#9a9aa3;')}>
        <Svg w={14} sw={2.2} style={s('flex:none;')}>{Icons.refresh}</Svg>{v.cachedLabel}
      </span>
      {v.hasCachedQuestion && (
        <span style={s('flex:1 1 240px;min-width:0;font-size:13px;color:#74747d;overflow-wrap:anywhere;')}>
          Asked before as &ldquo;{v.cachedQuestion}&rdquo;
        </span>
      )}
      <Hover tag="button" type="button" onClick={v.onReload} title="Ask this again and replace the saved answer"
        base="margin-left:auto;display:inline-flex;align-items:center;gap:7px;background:#141416;border:1px solid #424249;border-radius:999px;padding:5px 13px;font:inherit;font-size:13px;font-weight:600;color:#e0554f;cursor:pointer;"
        hover="border-color:#e0554f;background:#151518;">
        <Svg w={13} sw={2.4}>{Icons.refresh}</Svg>Reload
      </Hover>
    </div>
  );
}

// A request the assistant carried out itself — format this email, shorten this
// message, tidy these notes. Nothing in it comes from the practice's documents,
// and that is said once, before the work is read, rather than as an amber block
// against every paragraph: the whole answer has the same provenance, so marking
// each part separately would only make it harder to read the part that matters.
function GeneralBar() {
  return (
    <div style={s('display:flex;gap:9px;align-items:flex-start;margin:14px 0 0;border:1px dashed #4b3d1f;background:#1b1a15;border-radius:10px;padding:11px 14px;')}>
      <span style={s('flex:none;display:flex;margin-top:1px;')}><Svg w={15} stroke="#e0b85f" sw={2.2}>{Icons.sparkle}</Svg></span>
      <span style={s('font-size:13.5px;line-height:1.5;color:#e0b85f;')}>
        <strong>Done by the assistant.</strong> This is not from the practice&rsquo;s documents &mdash;
        check anything that has to match how the practice does things.
      </span>
    </div>
  );
}

// Was this any good? Five buttons, one press, no typing.
//
// It sits under every answer, quietly: the reader came for the answer, not to
// review it, so this must not compete with the content above. But it is always
// there, because feedback that has to be sought out is feedback that never
// arrives. Pressing one replaces the row with a thank-you — there is nothing
// further to do and no second chance to get wrong.
function Feedback({ v }) {
  if (v.feedbackSent) {
    return (
      <div style={s('display:flex;align-items:center;gap:8px;padding:12px 0 4px;font-size:13.5px;color:#9a9aa3;')}>
        <Svg w={15} sw={2.4} style={s('flex:none;color:#56c98a;')}>{Icons.check}</Svg>
        Thanks — logged as &ldquo;{v.feedbackLabel}&rdquo;.
      </div>
    );
  }
  return (
    <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 0 4px;')}>
      <span style={s('font-size:13px;color:#74747d;margin-right:2px;')}>Was this right?</span>
      {v.feedback.map((fb) => (
        <Hover key={fb.id} tag="button" type="button" onClick={fb.onClick}
          base={'border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;background:#141416;border:1px solid #2a2a2e;color:'
            + (fb.good ? '#56c98a;' : '#9a9aa3;')}
          hover={fb.good ? 'border-color:#56c98a;background:#151518;' : 'border-color:#ff7b72;background:#261619;color:#ff9d96;'}>
          {fb.label}
        </Hover>
      ))}
    </div>
  );
}

// The answer in brief, at the top of the card. Someone with a patient at the
// desk reads this and nothing else, so it carries the whole answer in two to
// four lines — and a point that risks safety, a breach or a deadline is red,
// not another grey bullet.
function KeyPoints({ points }) {
  return (
    <div style={s('margin:14px 0 0;border:1px solid #26262a;border-radius:12px;background:#141416;padding:13px 16px 14px;')}>
      <div style={s('font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#74747d;margin-bottom:9px;')}>In brief</div>
      <ul style={s('margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px;')}>
        {points.map((p) => (
          <li key={p.key} style={s('display:flex;gap:9px;align-items:flex-start;')}>
            <span style={s('flex:none;margin-top:2px;display:flex;color:' + (p.isCritical ? '#ff7b72' : '#56c98a') + ';')}>
              <Svg w={15} sw={2.4}>{p.isCritical ? Icons.alertCircle : Icons.check}</Svg>
            </span>
            <span style={s('font-size:15.5px;line-height:1.45;color:#e9e9ec;' + (p.isCritical ? 'font-weight:700;' : ''))}>
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
    <div style={s('font-size:17.5px;font-weight:700;color:#e9e9ec;margin:0 0 7px;letter-spacing:-0.01em;')}>{sec.heading}</div>
  ) : null;

  if (sec.isCritical) {
    return (
      <div style={s('border:1px solid #502624;border-left:4px solid #ff7b72;background:#261619;border-radius:0 12px 12px 0;padding:13px 16px 14px;')}>
        <div style={s('display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#ff9d96;margin-bottom:8px;')}>
          <Svg w={14} stroke="#ff7b72" sw={2.4} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
          {sec.hasHeading ? sec.heading : 'Must not be missed'}
        </div>
        <Md text={sec.markdown} />
        {sec.hasImages && <SourceImages images={sec.images} />}
        {sec.isWeb ? <WebChip label={sec.webLabel} url={sec.webUrl} /> : (sec.hasCite && <CiteChip label={sec.citeLabel} onClick={sec.onCite} />)}
      </div>
    );
  }

  return (
    <div style={s(sec.isWeb ? 'border-left:3px solid #4b3d1f;padding-left:13px;' : '')}>
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
    <span style={s('display:flex;gap:7px;align-items:flex-start;margin-top:7px;font-size:13.5px;line-height:1.45;font-weight:500;color:#e0b85f;')}>
      <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={14} stroke="#e0b85f" sw={2.2}>{Icons.alertCircle}</Svg></span>
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
          <span key={option} style={s('display:block;color:#e9e9ec;overflow-wrap:anywhere;font-size:' + size + ';font-weight:' + weight + ';' + (i ? 'margin-top:3px;' : ''))}>
            {i > 0 && <span style={s('font-size:13.5px;font-weight:600;color:#74747d;margin-right:7px;')}>or</span>}
            {option}
          </span>
        ))}
      </>
    );
  }
  if (row.value) {
    return <span style={s('display:block;color:#e9e9ec;overflow-wrap:anywhere;font-size:' + size + ';font-weight:' + weight + ';')}>{row.value}</span>;
  }
  return (
    <span style={s('display:flex;gap:7px;align-items:flex-start;font-size:15px;font-weight:600;color:#e0b85f;')}>
      <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={15} stroke="#e0b85f" sw={2.2}>{Icons.alertCircle}</Svg></span>
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
    <div style={s('padding:11px 16px 12px;border-top:1px solid #1c1c1f;background:#1b1a15;font-size:13.5px;line-height:1.5;color:#e0b85f;')}>
      <div style={s('display:flex;gap:8px;align-items:flex-start;')}>
        <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={15} stroke="#e0b85f" sw={2.2}>{Icons.sparkle}</Svg></span>
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
    <div style={s('margin:16px 0 0;border:2px solid #e0554f;border-radius:12px;overflow:hidden;background:#141416;')}>
      <div style={s('display:flex;align-items:center;gap:8px;padding:9px 16px;background:#e0554f;color:#ffffff;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;')}>
        <Svg w={15} stroke="#ffffff" sw={2.4}>{Icons.check}</Svg>Set this on e-RS
      </div>
      <div>
        {rows.map((row, i) => (
          <div key={row.label} style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px;padding:10px 16px;' + (i ? 'border-top:1px solid #1c1c1f;' : ''))}>
            <span style={s('flex:none;min-width:104px;font-size:13.5px;font-weight:600;color:#9a9aa3;')}>{row.label}</span>
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
      {/* No card: the answer is the page. A box around it added a border,
          a shadow and a colour change for nothing — the reading is the
          same and the page is quieter without them. */}
      <div style={s('min-width:0;')}>
        {/* The agent is working: one readable line saying what it is doing
            now, rather than a grid of every lookup in unreadable type. */}
        {v.aiLoading && <WorkingState steps={v.steps} statusText={v.statusText} />}

        {v.aiError && (
          <div style={s('padding:18px 0;font-size:17px;line-height:1.5;color:#e9e9ec;')}>
            <p style={s('margin:0 0 14px;')}>Sorry, something went wrong reaching the documents. Please try again.</p>
            <Hover onClick={v.onRetry} base="background:#e0554f;color:#ffffff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 0 #f5a29e;" active="transform:translateY(4px);box-shadow:none;"><Svg w={16} sw={2.2}>{Icons.refresh}</Svg>Try again</Hover>
          </div>
        )}

        {v.aiDeclined && (
          <>
            <div style={s('padding:18px 0;display:flex;gap:13px;align-items:flex-start;')}>
              <span style={s('flex:none;width:30px;height:30px;border-radius:50%;background:#0b0b0c;color:#9a9aa3;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;')}><Svg w={17}>{Icons.infoCircle}</Svg></span>
              <div style={s('flex:1;min-width:0;')}>
                <p style={s('margin:0;font-size:18px;line-height:1.55;color:#e9e9ec;')}><Rich text={v.intro} /></p>
                <p style={s('margin:8px 0 0;font-size:15px;line-height:1.5;color:#74747d;')}>Please check with the relevant lead, or a clinician if it is a clinical question.</p>
              </div>
            </div>
            <ContactsCard v={v} />
            {v.hasContacts && <div style={s('height:12px;')} />}
          </>
        )}

        {v.aiDone && (
          <>
            {v.isCached && <CacheBar v={v} />}

            {/* The question is already the heading of the page (ChatView renders
                it as the h1 with the rule under it), so printing it again here
                gave every answer two titles. Only the intro belongs in this
                slot, and when there is no intro the block goes away entirely
                rather than leaving a gap above the answer. */}
            {v.hasIntro && (
              <p style={s('margin:20px 0 0;font-size:18px;line-height:1.6;color:#9a9aa3;')}><Rich text={v.intro} /></p>
            )}

            {v.isGeneral && <GeneralBar />}

            {/* ABOVE THE CARD, ALWAYS. What the deterministic scanners found
                anywhere in the message — including in the paragraphs nothing
                routed and nothing answered. Not one word of these was written
                by a model, which is exactly why they sit above the part that
                was. They render before the card because a red flag found in
                the fourth paragraph does not wait its turn. */}
            {v.hasAlerts && v.alerts.map((alert) => (
              <div key={alert.key} style={s('margin:16px 0 0;')}><TemplateView answer={alert.answer} /></div>
            ))}

            {/* A templated answer. The template already decided the whole
                shape, so it renders on its own — the markdown sections, key
                points and citations below are all empty for these. */}
            {v.hasTemplate && (
              <div style={s('margin:16px 0 0;')}><TemplateView answer={v.template} /></div>
            )}

            {/* And beside it, everything the message asked for. The card can
                end on "book the patient in" without that reading as the whole
                job being done. */}
            {v.hasPanel && (
              <UnresolvedPanel panel={v.panel} onAsk={v.onAskItem} onDismiss={v.onDismissItem} />
            )}

            {/* The question as asked has more than one answer in the practice's
                own material, so the assistant asks which was meant rather than
                choosing one and hoping. Tapping an answer asks it properly. */}
            {v.hasClarify && (
              <div style={s('margin:16px 0 0;background:#141416;border:1px solid #3a2b2a;border-left:4px solid #e0554f;border-radius:0 12px 12px 0;padding:16px 18px 17px;animation:rivaAnswerIn .4s cubic-bezier(.2,.7,.3,1) both;')}>
                <div style={s('display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#e0554f;margin-bottom:9px;')}>
                  <Svg w={14} sw={2.4} style={s('flex:none;')}>{Icons.infoCircle}</Svg>Which did you mean?
                </div>
                <p style={s('margin:0 0 13px;font-size:17px;line-height:1.5;color:#e9e9ec;')}>{v.clarifyQuestion}</p>
                <div style={s('display:flex;flex-wrap:wrap;gap:8px;')}>
                  {v.clarifyOptions.map((o) => (
                    <Hover key={o.key} tag="button" type="button" className="riva-lift" onClick={o.onPick}
                      base="background:#1b1b1f;border:1px solid #3a2b2a;border-radius:999px;padding:10px 18px;font:inherit;font-size:15.5px;font-weight:600;color:#e0554f;cursor:pointer;text-align:left;"
                      hover="background:#e0554f;border-color:#e0554f;color:#ffffff;">
                      {o.label}
                    </Hover>
                  ))}
                </div>
              </div>
            )}

            {v.hasReferralRoute && <ReferralRoute route={v.referralRoute} />}

            {v.hasKeyPoints && <KeyPoints points={v.keyPoints} />}

            {v.hasSections && (
              <div style={s('padding:16px 0 6px;display:flex;flex-direction:column;gap:16px;')}>
                {v.sections.map((sec) => (sec.isJudgement || sec.isReasoned) ? (
                  <div key={sec.key} style={s('border:1px dashed #4b3d1f;background:#1b1a15;border-radius:12px;padding:12px 16px 13px;')}>
                    <div style={s('display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#e0b85f;margin-bottom:8px;')}>
                      <Svg w={14} stroke="#e0b85f" sw={2.2} style={s('flex:none;')}>{Icons.sparkle}</Svg>
                      {sec.isReasoned ? 'Worked out from the practice’s material' : 'AI judgement'}
                    </div>
                    <Md text={sec.markdown} />
                    {/* What the working was built on. The reader can open each
                        one and disagree with the step that was taken — which is
                        the whole difference between reasoning and being told. */}
                    {sec.isReasoned && sec.premises.length > 0 && (
                      <div style={s('margin-top:10px;padding-top:9px;border-top:1px solid #26262a;display:flex;flex-wrap:wrap;align-items:center;gap:6px;')}>
                        <span style={s('font-size:12.5px;color:#e0b85f;font-weight:600;')}>Based on</span>
                        {sec.premises.map((p) => (
                          <Hover key={p.key} tag="button" type="button" onClick={p.onOpen}
                            base="background:#141416;border:1px solid #51442a;border-radius:999px;padding:3px 10px;font:inherit;font-size:12.5px;color:#eac67e;cursor:pointer;"
                            hover="background:#18181a;border-color:#51442a;">
                            {p.label}
                          </Hover>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Section key={sec.key} sec={sec} />
                ))}
              </div>
            )}

            {v.hasGaps && (
              // What the practice's own material does not cover, said plainly
              // rather than filled in from the model's general knowledge.
              <div style={s('margin:12px 0 4px;display:flex;gap:10px;align-items:flex-start;border:1px solid #26262a;background:#141416;border-radius:10px;padding:12px 14px;')}>
                <span style={s('flex:none;color:#9a9aa3;display:flex;margin-top:2px;')}><Svg w={16} sw={2.2}>{Icons.infoCircle}</Svg></span>
                <div style={s('font-size:14.5px;line-height:1.5;color:#9a9aa3;')}>
                  <strong style={s('color:#e9e9ec;')}>Not in the practice&rsquo;s own material:</strong> <Rich text={v.gaps} />
                </div>
              </div>
            )}

            {v.hasMessage && (
              <div style={s('margin:10px 0 4px;')}>
                {/* The wording is written to be pasted somewhere else, so it
                    carries its own Copy — taking it out of the answer by hand
                    is the one thing the reader should not have to do. */}
                <div style={s('display:flex;align-items:center;gap:12px;margin-bottom:6px;')}>
                  <div style={s('flex:1;min-width:0;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#74747d;')}>
                    {v.isGeneral ? 'Ready to paste' : 'Suggested message'}
                  </div>
                  <Hover tag="button" type="button" onClick={v.onCopyMessage} className="riva-lift"
                    base="flex:none;display:inline-flex;align-items:center;gap:6px;background:#141416;border:1px solid #2a2a2e;border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;font-weight:600;color:#e0554f;cursor:pointer;"
                    hover="border-color:#e0554f;background:#151518;">
                    <Svg w={13} sw={2.2}>{Icons.copy}</Svg>{v.copyMessageLabel}
                  </Hover>
                </div>
                <div style={s('padding:14px 16px;background:#141416;border:1px solid #26262a;border-left:4px solid #e0554f;border-radius:0 8px 8px 0;font-size:17px;line-height:1.6;white-space:pre-wrap;')}>{v.message}</div>
                {v.hasMessageImages && <SourceImages images={v.messageImages} />}
                {v.hasMessageCite ? <CiteChip label={v.messageCiteLabel} onClick={v.onMessageCite} /> : <JudgementChip label="AI-drafted wording: check before sending" />}
              </div>
            )}

            {v.hasTip && <div style={s('margin:14px 0 4px;border-left:4px solid #e0554f;background:#221a1a;padding:12px 16px;border-radius:0 8px 8px 0;font-size:17px;line-height:1.55;')}><strong>Tip:</strong> <Rich text={v.tip} /></div>}

            {v.hasFollowUps && (
              // A step with its own procedure behind it is left out of the answer
              // and offered here instead. One tap asks it in this same chat, so
              // the reader never loses the referral they were part way through.
              <div style={s('margin:14px 0 4px;')}>
                <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#74747d;margin-bottom:7px;')}>Ask next</div>
                <div style={s('display:flex;flex-direction:column;gap:8px;')}>
                  {v.followUps.map((f) => (
                    <Hover key={f.key} className="riva-lift" onClick={f.onClick}
                      base="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#141416;border:1px solid #26262a;border-radius:10px;padding:12px 15px;cursor:pointer;font:inherit;font-size:16px;font-weight:600;color:#e0554f;transition:border-color .16s ease,background-color .16s ease;"
                      hover="border-color:#e0554f;background:#151518;">
                      <span style={s('flex:none;display:flex;')}><Svg w={17}>{Icons.arrow}</Svg></span><span>{f.question}</span>
                    </Hover>
                  ))}
                </div>
              </div>
            )}

            <Feedback v={v} />

            <div style={s('height:12px;')} />
            <ContactsCard v={v} />
            {v.hasContacts && <div style={s('height:12px;')} />}

            {v.hasProvenanceNote && (
              <div style={s('border-top:1px solid #1c1c1f;margin-top:14px;padding:10px 0 12px;display:flex;flex-direction:column;gap:3px;font-size:12.5px;line-height:1.5;')}>
                {v.isGeneral && <span style={s('font-size:12.5px;color:#74747d;')}>Written by the assistant for this request; no practice document was used</span>}
                {(v.usedJudgement || v.usedReasoning) && <span style={s('font-size:12.5px;color:#74747d;')}>{v.usedReasoning ? 'Amber blocks are the assistant\u2019s own working from the sources named in them, not the practice\u2019s own words' : 'Amber blocks are AI judgement, not the practice\u2019s documents'}</span>}
                {v.usedWeb && <span style={s('font-size:12.5px;color:#74747d;')}>Sections marked &ldquo;from the web&rdquo; are general guidance found online, not practice policy</span>}
                {v.hasDropped && <span style={s('font-size:12.5px;color:#74747d;')}>{v.droppedNote}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
