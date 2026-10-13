'use client';

import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { s, Hover, Svg, Icons } from '../ui';
import CiteChip from './CiteChip';
import WorkingState, { useBusyPage } from './WorkingState';
import RollingLine from './RollingLine';
import Rich from './Rich';
import Md from './Md';
import TemplateView from '../templates/TemplateView';
import AccurxCard from './AccurxCard';
import SpellCard from './SpellCard';
import UnresolvedPanel from './UnresolvedPanel';
import useSmoothText from './useSmoothText';
import { EASE, EASE_EXIT } from './motion.mjs';

// The assistant's answer, laid out like an AI-formatted notebook page: markdown
// sections (headings, lists, tables, highlights), with a quiet citation link
// under a document-backed section (and any pictures from that source shown as
// thumbnails). A Q&A answer is one section of prose whose citations are links
// to the Notebook pages it used; a command answers with its card instead.
//
// ONE CARD, FROM THE FIRST SECOND TO THE LAST. The answer is the page's one
// white card, as every other tool's content is (Referrals is the reference).
// It appears the moment the question is asked, holding the working line in
// the place the answer will be written; the first words of the draft take the
// line's place; and the finished answer takes the draft's place WITHOUT
// ANYTHING BEING REDRAWN. The prose is one element from the first draft to the
// final word — it used to be two, the draft's and the answer's, and swapping
// one for the other replayed every paragraph's entrance at the moment the
// answer settled, so a finished answer blinked out and back in. Only what is
// genuinely new when it settles arrives: the sources, and the row of actions
// under the card.
//
// A templated answer is a card of its own (TemplateView, AccurxCard,
// SpellCard), so it is not put inside this one; when the check withdraws a
// streamed answer and sends the "not in the Notebook" card instead, the prose
// card fades out where it stands while the template card comes in over it.

// The thumbs, which ui.js has no glyph for. Lucide's, at the same weight.
const THUMB_UP = (<><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></>);
const THUMB_DOWN = (<><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></>);
const STOP = (<rect x="7" y="7" width="10" height="10" rx="2" />);

// Thumbnails of the pictures that live in a section's source — a notebook
// note's attached images, or the cited PDF page. Click to view full-size.
function SourceImages({ images }) {
  return (
    <div style={s('display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;')}>
      {images.map((im, i) => (
        <Hover key={i} tag="button" type="button" onClick={im.onOpen} aria-label="Open image from the source" title="Open image from the source" base="padding:0;border:1px solid var(--rv-line-soft);border-radius:14px;background:#fff;cursor:pointer;overflow:hidden;display:block;line-height:0;" hover="border-color:#005eb8;box-shadow:0 2px 8px rgba(33,43,50,.14);">
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
    <div className="riva-answer-general">
      <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={15} sw={2.2}>{Icons.infoCircle}</Svg></span>
      <span>
        <strong>Done by the assistant.</strong> This is not from the practice&rsquo;s documents &mdash;
        check anything that has to match how the practice does things.
      </span>
    </div>
  );
}

// Something that arrives inside a card that is already on screen — the
// "done by the assistant" bar, an intro, a red-flag band above the answer —
// opens up to its height instead of shoving what is being read down in one
// jump. Clipped only while it opens, so a card's shadow inside it is whole
// once it has.
function Reveal({ grow, className, children }) {
  const [open, setOpen] = React.useState(!grow);
  if (!grow) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
      transition={{ duration: 0.4, ease: EASE }} onAnimationComplete={() => setOpen(true)}
      style={{ overflow: open ? 'visible' : 'hidden' }}>
      {children}
    </motion.div>
  );
}

// The card. Its height follows what is in it, on the house curve, so the
// working line giving way to the first words, the last words, the check line
// and the sources each grow the card rather than jumping it (the card height
// Referrals animates the same way). Instant where less motion is asked for.
function AnswerCard({ children, onMove, onRest }) {
  const inner = React.useRef(null);
  const reduce = useReducedMotion();
  const [h, setH] = React.useState('auto');
  React.useLayoutEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div className="riva-answer-card" initial={false} animate={{ height: h }}
      transition={{ duration: reduce ? 0 : 0.38, ease: EASE }}
      onAnimationStart={onMove} onAnimationComplete={onRest}>
      <div ref={inner} className="riva-answer-card__in">{children}</div>
    </motion.div>
  );
}

// One section of the body. Two looks, because the reader must be able to tell
// them apart without reading: a critical block is a red callout, and an
// ordinary block is plain text with its quiet citation. `markdown` and
// `mdClass` are the first section's own while it is still being revealed.
function Section({ sec, markdown, mdClass }) {
  const text = markdown != null ? markdown : sec.markdown;
  if (sec.isCritical) {
    return (
      <div className="riva-answer-critical">
        <div className="riva-answer-critical__head">
          <Svg w={14} sw={2.4} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
          {sec.hasHeading ? sec.heading : 'Must not be missed'}
        </div>
        <Md text={text} />
        {sec.hasImages && <SourceImages images={sec.images} />}
        {sec.hasCite && <CiteChip label={sec.citeLabel} onClick={sec.onCite} />}
      </div>
    );
  }
  return (
    <div>
      {sec.hasHeading ? <div className="riva-answer-h">{sec.heading}</div> : null}
      <Md text={text} className={mdClass} />
      {sec.hasImages && <SourceImages images={sec.images} />}
      {sec.hasCite && <CiteChip label={sec.citeLabel} onClick={sec.onCite} />}
    </div>
  );
}

// The prose, from the first word of the draft to the last of the answer.
// `bornLive` is fixed when it mounts: prose that was watched arriving lets
// each new paragraph fade straight in as it is written, where a finished
// answer that arrives whole keeps its paragraph-by-paragraph stagger. It is
// fixed rather than followed because changing an entrance's delay under a
// paragraph that has already arrived sends it back to invisible.
function Prose({ v, text, revealing }) {
  const [bornLive] = React.useState(() => v.aiLoading);
  const sections = v.aiLoading
    ? [{ key: 0, markdown: text, hasHeading: false, isCritical: false }]
    : v.sections;
  const mdClass = (bornLive ? 'is-born-live' : '') + (revealing ? ' is-streaming' : '');
  return (
    <div className="riva-answer-prose">
      {v.hasIntro && <Reveal grow={v.streamed}><p className="riva-answer-intro"><Rich text={v.intro} /></p></Reveal>}
      {v.isGeneral && <Reveal grow={v.streamed}><GeneralBar /></Reveal>}
      <div className="riva-answer-sections">
        {sections.map((sec, i) => (
          <Section key={sec.key} sec={sec} markdown={i === 0 ? text : null} mdClass={i === 0 ? mdClass : ''} />
        ))}
      </div>
      {v.hasProvenanceNote && (
        <Reveal grow={v.streamed} className="riva-answer-prov">
          {v.isGeneral && <span>Written by the assistant for this request; no practice document was used</span>}
          {v.hasDropped && <span>{v.droppedNote}</span>}
        </Reveal>
      )}
      {/* Out of the flow as it goes, so the card eases straight to the
          finished answer's height rather than holding this line's room
          open and then giving it back. */}
      <AnimatePresence initial={false} mode="popLayout">
        {v.aiLoading && (
          <motion.div key="status" className="riva-answer-status"
            exit={{ opacity: 0, transition: { duration: 0.16, ease: EASE_EXIT } }}>
            <span className="riva-live-dot" aria-hidden="true" />
            <RollingLine text={v.statusText || 'Writing the answer'} className="riva-answer-status__text" />
            <span className="rv-sr" role="status">{v.statusText || 'Writing the answer'}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ErrorState({ v }) {
  return (
    <div className="rv-state riva-answer-state" role="alert">
      <span className="rv-state__ico is-bad"><Svg w={20} sw={2}>{Icons.alertCircle}</Svg></span>
      <p className="rv-state__title">Couldn&rsquo;t get an answer.</p>
      <p className="rv-state__text">{v.errorText || 'The documents could not be reached just now. Try again in a moment.'}</p>
      <div className="rv-state__acts">
        {v.canEdit && (
          <button type="button" className="rv-btn rv-btn--quiet" onClick={v.onEdit}>
            <Svg w={15} sw={2.2}>{Icons.edit}</Svg>Edit question
          </button>
        )}
        <button type="button" className="rv-btn rv-btn--primary" onClick={v.onRetry}>
          <Svg w={15} sw={2.2}>{Icons.refresh}</Svg>Try again
        </button>
      </div>
    </div>
  );
}

// Stopped from the field. What had been written is not kept: a draft is shown
// only until the check has passed it (see QaApp, `draft`), and a stopped one
// never was.
function StoppedState({ v }) {
  return (
    <div className="rv-state riva-answer-state">
      <span className="rv-state__ico"><Svg w={20} sw={2}>{STOP}</Svg></span>
      <p className="rv-state__title">Stopped.</p>
      <p className="rv-state__text">The answer was stopped before it was finished and checked, so none of it is shown.</p>
      <div className="rv-state__acts">
        {v.canEdit && (
          <button type="button" className="rv-btn rv-btn--quiet" onClick={v.onEdit}>
            <Svg w={15} sw={2.2}>{Icons.edit}</Svg>Edit question
          </button>
        )}
        <button type="button" className="rv-btn rv-btn--primary" onClick={v.onRetry}>
          <Svg w={15} sw={2.2}>{Icons.refresh}</Svg>Ask again
        </button>
      </div>
    </div>
  );
}

// Not an error: a question that is not reception's to answer. Said quietly,
// with who to ask instead.
function DeclinedState({ v }) {
  return (
    <div className="riva-answer-declined">
      <span className="riva-answer-declined__ico"><Svg w={18} sw={2}>{Icons.infoCircle}</Svg></span>
      <div style={s('flex:1;min-width:0;')}>
        <p className="riva-answer-declined__text"><Rich text={v.intro} /></p>
        <p className="riva-answer-declined__help">Please check with the relevant lead, or a clinician if it is a clinical question.</p>
      </div>
    </div>
  );
}

// Copy, with the glyph turning into a tick and the word into "Copied". Both
// words are laid in the same cell so the button is the width of the longer
// one from the start, and nothing after it moves when it changes.
function CopyButton({ copied, onCopy }) {
  return (
    <button type="button" className="rv-btn rv-btn--plain rv-btn--sm riva-act" onClick={onCopy}
      aria-label={copied ? 'Copied' : 'Copy the answer'}>
      <span className="riva-act__ico">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={copied ? 'done' : 'copy'} className={copied ? 'is-ok' : ''}
            initial={{ opacity: 0, scale: 0.6, filter: 'blur(3px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.6, filter: 'blur(3px)' }}
            transition={{ duration: 0.18, ease: EASE }} style={{ display: 'flex' }}>
            <Svg w={15} sw={copied ? 2.8 : 2.1}>{copied ? Icons.check : Icons.copy}</Svg>
          </motion.span>
        </AnimatePresence>
      </span>
      <span className="riva-act__label" aria-hidden="true">
        <span className={copied ? '' : 'is-off'}>Copied</span>
        <span className={copied ? 'is-off' : ''}>Copy</span>
      </span>
    </button>
  );
}

// Was this any good? A thumb either way, one press, no typing.
//
// It sits under every answer, quietly: the reader came for the answer, not to
// review it, so this must not compete with the content above. But it is always
// there, because feedback that has to be sought out is feedback that never
// arrives. The five verdicts (lib/feedback.mjs) are all still one press from
// the answer: thumbs up is "Helpful", and thumbs down opens the other four
// under the row, in place, rather than a dialog — what was wrong is the only
// thing worth knowing about a wrong answer, and it is a button, not a sentence.
// Pressing one replaces the thumbs with a thank-you; there is nothing further
// to do and no second chance to get wrong.
function Verdicts({ v, why, setWhy }) {
  const good = (v.feedback || []).find((fb) => fb.good);
  return (
    <AnimatePresence mode="wait" initial={false}>
      {v.feedbackSent ? (
        <motion.span key="thanks" className="riva-acts__thanks" role="status"
          initial={{ opacity: 0, filter: 'blur(4px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.24, ease: EASE }}>
          <Svg w={15} sw={2.6} style={s('flex:none;color:var(--rv-green);')}>{Icons.check}</Svg>
          Thanks — logged as &ldquo;{v.feedbackLabel}&rdquo;
        </motion.span>
      ) : (
        <motion.span key="ask" className="riva-acts__group"
          exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_EXIT } }}>
          <span className="riva-acts__label">Was this right?</span>
          {good && (
            <button type="button" className="rv-ibtn riva-acts__thumb" onClick={good.onClick} aria-label="Yes, helpful" title="Helpful">
              <Svg w={16} sw={2}>{THUMB_UP}</Svg>
            </button>
          )}
          <button type="button" className={'rv-ibtn riva-acts__thumb' + (why ? ' is-on' : '')} onClick={() => setWhy(!why)}
            aria-label="No — say what was wrong" aria-expanded={why} title="Not right">
            <Svg w={16} sw={2}>{THUMB_DOWN}</Svg>
          </button>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// The row under a finished answer. It arrives after the answer has: once the
// last word is on the page, a beat later, each control a touch after the one
// before (21st.dev Streaming Response Actions).
function ActionRow({ v, delay }) {
  const [why, setWhy] = React.useState(false);
  const hasVerdicts = (v.feedback || []).length > 0 || !!v.feedbackSent;
  const bad = (v.feedback || []).filter((fb) => !fb.good);
  if (!v.canCopy && !v.canRetry && !hasVerdicts) return null;
  const item = {
    hidden: { opacity: 0, y: 4 },
    shown: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE } },
  };
  return (
    <div className="riva-acts-wrap">
      <motion.div className="riva-acts" initial="hidden" animate="shown"
        variants={{ shown: { transition: { delayChildren: delay, staggerChildren: 0.04 } } }}>
        {v.canCopy && <motion.span variants={item} style={{ display: 'flex' }}><CopyButton copied={v.copied} onCopy={v.onCopy} /></motion.span>}
        {v.canRetry && (
          <motion.span variants={item} style={{ display: 'flex' }}>
            <button type="button" className="rv-btn rv-btn--plain rv-btn--sm riva-act" onClick={v.onRetry}>
              <Svg w={15} sw={2.1}>{Icons.refresh}</Svg>Ask again
            </button>
          </motion.span>
        )}
        {hasVerdicts && (
          <motion.span variants={item} className="riva-acts__end">
            <Verdicts v={v} why={why && !v.feedbackSent} setWhy={setWhy} />
          </motion.span>
        )}
      </motion.div>
      <AnimatePresence initial={false}>
        {why && !v.feedbackSent && (
          <motion.div key="why" className="riva-why"
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.18, ease: EASE_EXIT } }}
            transition={{ duration: 0.3, ease: EASE }}>
            <div className="riva-why__in">
              <span className="riva-why__label">What was wrong?</span>
              {bad.map((fb) => (
                <button key={fb.id} type="button" className="rv-btn rv-btn--quiet rv-btn--sm" onClick={() => { setWhy(false); fb.onClick(); }}>
                  {fb.label}
                </button>
              ))}
              <button type="button" className="rv-ibtn riva-why__x" onClick={() => setWhy(false)} aria-label="Close">
                <Svg w={14} sw={2.4}>{Icons.close}</Svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AiAnswer({ v }) {
  // The light behind the page quickens for as long as the answer is being
  // worked out — through the writing and the check, not just the first wait.
  useBusyPage(v.aiLoading);

  // The reveal runs while the draft streams and, for an answer that was
  // watched arriving, on through the finished text until it has caught up —
  // the answer's last words and its sources are typed on in the same breath
  // rather than landing all at once when the turn ends. An answer first seen
  // finished (an earlier question reopened) is simply there.
  const [caught, setCaught] = React.useState(() => !v.aiLoading);
  React.useEffect(() => { if (v.aiLoading) setCaught(false); }, [v.aiLoading]);
  const finalText = v.aiDone && v.hasSections ? v.sections[0].markdown : '';
  const target = v.aiLoading ? v.draft : finalText;
  const revealing = (v.aiLoading && v.hasDraft) || (v.aiDone && v.streamed && !caught && !!finalText);
  const [text, caughtUp] = useSmoothText(target, revealing);
  React.useEffect(() => { if (v.aiDone && caughtUp && !caught) setCaught(true); }, [v.aiDone, caughtUp, caught]);

  let phase = 'none';
  if (v.aiLoading) phase = v.hasDraft ? 'prose' : 'work';
  else if (v.aiError) phase = 'error';
  else if (v.aiStopped) phase = 'stopped';
  else if (v.aiDeclined) phase = 'declined';
  else if (v.aiDone && (v.hasSections || (v.hasIntro && !v.hasTemplate))) phase = 'prose';
  const showTpl = v.aiDone && v.hasTemplate;
  const settled = v.aiDone && (caught || !v.streamed || !finalText);
  // The row waits for the card as well as the words: the card's height is
  // still easing out to the last line when the reveal reaches it, and a row
  // placed under a card that is still moving is pushed along the page as it
  // arrives. So it comes once the card has come to rest.
  const [cardStill, setCardStill] = React.useState(true);
  const onCardMove = React.useCallback(() => setCardStill(false), []);
  const onCardRest = React.useCallback(() => setCardStill(true), []);
  const [rowReady, setRowReady] = React.useState(settled);
  React.useEffect(() => {
    if (!settled) { setRowReady(false); return undefined; }
    if (!v.streamed) { setRowReady(true); return undefined; }
    if (!cardStill || rowReady) return undefined;
    const t = setTimeout(() => setRowReady(true), 80);
    return () => clearTimeout(t);
  }, [settled, cardStill, rowReady, v.streamed]);

  const swap = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } },
    exit: { opacity: 0, y: -4, transition: { duration: 0.16, ease: EASE_EXIT } },
  };

  return (
    <div className="riva-answer">
      {/* ABOVE THE CARD, ALWAYS. What the deterministic scanners found
          anywhere in the message — including in the paragraphs nothing
          routed and nothing answered. Not one word of these was written
          by a model, which is exactly why they sit above the part that
          was. They render before the card because a red flag found in
          the fourth paragraph does not wait its turn. */}
      {v.aiDone && v.hasAlerts && (
        <Reveal grow={v.streamed} className="riva-answer-alerts">
          {v.alerts.map((alert) => <div key={alert.key}><TemplateView answer={alert.answer} /></div>)}
        </Reveal>
      )}

      <AnimatePresence mode="popLayout" initial={false}>
        {phase !== 'none' && (
          <motion.div key="card" className="riva-answer-slot" exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE_EXIT } }}>
            <AnswerCard onMove={onCardMove} onRest={onCardRest}>
              {/* What the card holds changes by crossfading in place: the
                  line that is leaving is lifted out of the flow as it fades,
                  so the card never stands empty between the two. */}
              <AnimatePresence mode="popLayout" initial={false}>
                {phase === 'work' && (
                  <motion.div key="work" {...swap}>
                    <WorkingState steps={v.steps} statusText={v.statusText} progress={v.progress} screening={v.screening} />
                  </motion.div>
                )}
                {phase === 'prose' && (
                  <motion.div key="prose" {...swap}>
                    <Prose v={v} text={text} revealing={revealing} />
                  </motion.div>
                )}
                {phase === 'error' && <motion.div key="error" {...swap}><ErrorState v={v} /></motion.div>}
                {phase === 'stopped' && <motion.div key="stopped" {...swap}><StoppedState v={v} /></motion.div>}
                {phase === 'declined' && <motion.div key="declined" {...swap}><DeclinedState v={v} /></motion.div>}
              </AnimatePresence>
            </AnswerCard>
          </motion.div>
        )}

        {/* A templated answer. The template already decided the whole
            shape, so it renders on its own card, with its own entrance —
            its blocks lift in one after another. */}
        {showTpl && (
          <motion.div key="tpl" className="riva-answer-slot riva-answer-flow" initial={false}
            exit={{ opacity: 0, transition: { duration: 0.18, ease: EASE_EXIT } }}>
            {/* The prose that was being written did not pass the check
                against the Notebook, and the card below is what came instead.
                Said, because the reader watched it being written. */}
            {v.streamed && <p className="riva-answer-withdrawn">The written answer didn&rsquo;t pass the check against the Notebook, so it was taken back.</p>}
            {v.hasIntro && phase === 'none' && <p className="riva-answer-intro is-light"><Rich text={v.intro} /></p>}
            {/* An AccurX request has its own card: the same answer, drawn
                around the three things reception came for. */}
            <div>{v.template.accurx ? <AccurxCard answer={v.template} /> : v.template.spell ? <SpellCard answer={v.template} /> : <TemplateView answer={v.template} />}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* And beside it, everything the message asked for. The card can
          end on "book the patient in" without that reading as the whole
          job being done. */}
      {v.aiDone && v.hasPanel && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE, delay: 0.1 }}>
          <UnresolvedPanel panel={v.panel} onAsk={v.onAskItem} onDismiss={v.onDismissItem} />
        </motion.div>
      )}

      {/* Straight after the last word of an answer watched arriving; after
          the paragraphs of one that arrived whole have had their entrance. */}
      {settled && rowReady && <ActionRow v={v} delay={v.streamed ? 0.08 : 0.45} />}
    </div>
  );
}
