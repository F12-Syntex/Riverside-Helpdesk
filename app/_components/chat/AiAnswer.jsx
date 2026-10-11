'use client';

import { s, Hover, Svg, Icons } from '../ui';
import CiteChip from './CiteChip';
import WorkingState from './WorkingState';
import Rich from './Rich';
import Md from './Md';
import TemplateView from '../templates/TemplateView';
import AccurxCard from './AccurxCard';
import SpellCard from './SpellCard';
import UnresolvedPanel from './UnresolvedPanel';

// The assistant's answer, laid out like an AI-formatted notebook page: markdown
// sections (headings, lists, tables, highlights), with a quiet citation link
// under a document-backed section (and any pictures from that source shown as
// thumbnails). A Q&A answer is one section of prose whose citations are links
// to the Notebook pages it used; a command answers with its card instead.

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

// A request the assistant carried out itself — format this email, shorten this
// message, tidy these notes. Nothing in it comes from the practice's documents,
// and that is said once, before the work is read, rather than as an amber block
// against every paragraph: the whole answer has the same provenance, so marking
// each part separately would only make it harder to read the part that matters.
function GeneralBar() {
  return (
    <div style={s('display:flex;gap:9px;align-items:flex-start;margin:14px 0 0;border:1px dashed #ecd39a;background:#fffdf5;border-radius:10px;padding:11px 14px;')}>
      <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={15} stroke="#b58500" sw={2.2}>{Icons.infoCircle}</Svg></span>
      <span style={s('font-size:13.5px;line-height:1.5;color:#8a6100;')}>
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
  // An answer made in the browser has no verdict row — see `local` in QaApp.
  if (!v.feedbackSent && !(v.feedback || []).length) return null;
  if (v.feedbackSent) {
    return (
      <div style={s('display:flex;align-items:center;gap:8px;padding:12px 0 4px;font-size:13.5px;color:#4c6272;')}>
        <Svg w={15} sw={2.4} style={s('flex:none;color:#007f3b;')}>{Icons.check}</Svg>
        Thanks — logged as &ldquo;{v.feedbackLabel}&rdquo;.
      </div>
    );
  }
  return (
    <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 0 4px;')}>
      <span style={s('font-size:13px;color:#768692;margin-right:2px;')}>Was this right?</span>
      {v.feedback.map((fb) => (
        <Hover key={fb.id} tag="button" type="button" onClick={fb.onClick}
          base={'border-radius:999px;padding:5px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;background:#fff;border:1px solid #d5dee2;color:'
            + (fb.good ? '#007f3b;' : '#4c6272;')}
          hover={fb.good ? 'border-color:#007f3b;background:#f2f9f4;' : 'border-color:#d5281b;background:#fdf4f3;color:#a51b0f;'}>
          {fb.label}
        </Hover>
      ))}
    </div>
  );
}

// The answer while it is still being written. The same prose the finished
// answer is drawn in, and under it one quiet line saying what is happening —
// "Writing the answer", then "Checking the answer" — so the reader can start
// reading at once and still see it is not final.
function Draft({ markdown, statusText }) {
  return (
    <div className="riva-answer-flow">
      <div style={s('padding:16px 0 6px;')}>
        <Md text={markdown} />
      </div>
      <div role="status" style={s('display:flex;align-items:center;gap:7px;padding:4px 0 12px;font-size:13px;color:#768692;')}>
        <span style={s('display:flex;animation:rivaSpin 1s linear infinite;')}><Svg w={13} sw={2.4}>{Icons.spinner}</Svg></span>
        {statusText || 'Writing the answer'}
      </div>
    </div>
  );
}

// One section of the body. Two looks, because the reader must be able to tell
// them apart without reading: a critical block is a red callout, and an
// ordinary block is plain text with its quiet citation.
function Section({ sec }) {
  const heading = sec.hasHeading ? (
    <div style={s('font-size:17.5px;font-weight:700;color:#212b32;margin:0 0 7px;letter-spacing:-0.01em;')}>{sec.heading}</div>
  ) : null;

  if (sec.isCritical) {
    return (
      <div style={s('border:1px solid #f0c2bd;background:#fdf4f3;border-radius:12px;padding:13px 16px 14px;')}>
        <div style={s('display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#a51b0f;margin-bottom:8px;')}>
          <Svg w={14} stroke="#d5281b" sw={2.4} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
          {sec.hasHeading ? sec.heading : 'Must not be missed'}
        </div>
        <Md text={sec.markdown} />
        {sec.hasImages && <SourceImages images={sec.images} />}
        {sec.hasCite && <CiteChip label={sec.citeLabel} onClick={sec.onCite} />}
      </div>
    );
  }

  return (
    <div>
      {heading}
      <Md text={sec.markdown} />
      {sec.hasImages && <SourceImages images={sec.images} />}
      {sec.hasCite && <CiteChip label={sec.citeLabel} onClick={sec.onCite} />}
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
        {v.aiLoading && (v.hasDraft
          ? <Draft markdown={v.draft} statusText={v.statusText} />
          : <WorkingState steps={v.steps} statusText={v.statusText} progress={v.progress} />)}

        {v.aiError && (
          <div style={s('padding:18px 0;font-size:17px;line-height:1.5;color:#212b32;')}>
            <p style={s('margin:0 0 14px;')}>Sorry, something went wrong reaching the documents. Please try again.</p>
            <Hover onClick={v.onRetry} base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 0 #002a52;" active="transform:translateY(4px);box-shadow:none;"><Svg w={16} sw={2.2}>{Icons.refresh}</Svg>Try again</Hover>
          </div>
        )}

        {v.aiDeclined && (
          <div style={s('padding:18px 0;display:flex;gap:11px;align-items:flex-start;')}>
            <span style={s('flex:none;display:flex;margin-top:4px;color:#4c6272;')}><Svg w={18} sw={2}>{Icons.infoCircle}</Svg></span>
            <div style={s('flex:1;min-width:0;')}>
              <p style={s('margin:0;font-size:18px;line-height:1.55;color:#212b32;')}><Rich text={v.intro} /></p>
              <p style={s('margin:8px 0 0;font-size:15px;line-height:1.5;color:#768692;')}>Please check with the relevant lead, or a clinician if it is a clinical question.</p>
            </div>
          </div>
        )}

        {v.aiDone && (
          <div className={'riva-answer-flow' + (v.streamed ? ' is-settled' : '')}>
            {/* The question is already the heading of the page (ChatView renders
                it as the h1 with the rule under it), so printing it again here
                gave every answer two titles. Only the intro belongs in this
                slot, and when there is no intro the block goes away entirely
                rather than leaving a gap above the answer. */}
            {v.hasIntro && (
              <p style={s('margin:20px 0 0;font-size:18px;line-height:1.6;color:#4c6272;')}><Rich text={v.intro} /></p>
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
                shape, so it renders on its own — the markdown sections below
                are empty for these. */}
            {v.hasTemplate && (
              <div style={s('margin:16px 0 0;')}>
                {/* An AccurX request has its own card: the same answer, drawn
                    around the three things reception came for. */}
                {v.template.accurx ? <AccurxCard answer={v.template} /> : v.template.spell ? <SpellCard answer={v.template} /> : <TemplateView answer={v.template} />}
              </div>
            )}

            {/* And beside it, everything the message asked for. The card can
                end on "book the patient in" without that reading as the whole
                job being done. */}
            {v.hasPanel && (
              <UnresolvedPanel panel={v.panel} onAsk={v.onAskItem} onDismiss={v.onDismissItem} />
            )}

            {v.hasSections && (
              <div style={s('padding:16px 0 6px;display:flex;flex-direction:column;gap:16px;')}>
                {v.sections.map((sec) => <Section key={sec.key} sec={sec} />)}
              </div>
            )}

            <Feedback v={v} />

            <div style={s('height:12px;')} />

            {v.hasProvenanceNote && (
              <div style={s('border-top:1px solid #eef1f2;margin-top:14px;padding:10px 0 12px;display:flex;flex-direction:column;gap:3px;font-size:12.5px;line-height:1.5;')}>
                {v.isGeneral && <span style={s('font-size:12.5px;color:#768692;')}>Written by the assistant for this request; no practice document was used</span>}
                {v.hasDropped && <span style={s('font-size:12.5px;color:#768692;')}>{v.droppedNote}</span>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
