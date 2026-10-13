'use client';

import React from 'react';
import { AnimatePresence, motion, animate, useReducedMotion } from 'motion/react';
import { s, Svg, Icons } from './ui';
import GuideCard from './chat/GuideCard';
import SuggestBubble from './chat/SuggestBubble';
import AiAnswer from './chat/AiAnswer';
import { EASE, EASE_EXIT } from './chat/motion.mjs';

/* ------------------------------------------------------------------ *
 * One question at a time.
 *
 * The question being asked IS the page: its heading is the question and
 * its body is the answer, on the page's one white card. Every other
 * question asked in this session is minimised to a single numbered row
 * in a card above it — 01, 02, in the order they were asked — and the
 * whole row brings one back.
 *
 * The page is the same column as Referrals and Contacts (688px) before
 * the first question and after it, so the field only ever moves down the
 * page, never wider.
 * ------------------------------------------------------------------ */

/* ---------------------------------------------------------------- *
 * A question, or a wall of pasted text.
 *
 * Both arrive the same way and they are not the same thing. "How do I
 * refer for an ECG" is a heading and reads like one. A consultation
 * pasted in for triage is six hundred words of somebody else's message,
 * and setting THAT at heading size pushes the answer — the thing that
 * was asked for — clean off the screen.
 *
 * So a long one is treated as what it is: a short line saying what was
 * asked, and the message itself below it in reading type, folded to a
 * few lines with the rest one press away. Nothing is thrown away; the
 * whole text is on the page and can be opened, because it is the only
 * record of what the answer was given about.
 *
 * A QUESTION JUST ASKED TRAVELS. Its words leave the field and become
 * the heading: they start where they were in the field, at the field's
 * size, and grow into the heading's place at the top of the page (`fly`,
 * measured by QaApp as Enter was pressed). It is one object moving, where
 * it used to be a heading rising from below while the field fell away from
 * it and a bar meant to carry the words up was clipped out of sight.
 *
 * What travels is a copy, drawn over everything: the heading itself lives
 * in the page under the dock, so flown from the field it spent the first
 * half of the journey hidden behind the field it was leaving. The copy
 * lands exactly on the heading and hands over to it with a short fade.
 *
 * A question reopened from the history was not just asked and does not
 * travel; it fades in where it lives, and takes the focus, so the reader
 * is on the question they asked for rather than nowhere.
 * ---------------------------------------------------------------- */

// Roughly two lines at heading size. Past this, a heading is the wrong shape.
const HEADING_LIMIT = 120;

// The opening of a long message, cut at a sentence or a word rather than
// mid-syllable.
function opening(text, max = 96) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sentence = cut.search(/[.!?](?=[^.!?]*$)/);
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.5 ? cut.slice(0, space) : cut) + '…';
}

function TurnQuestion({ question, fly, focus }) {
  const [open, setOpen] = React.useState(false);
  const text = String(question || '');
  const long = text.length > HEADING_LIMIT;
  const ref = React.useRef(null);
  const reduce = useReducedMotion();

  // Measured and started before the first paint, so the heading is never
  // seen in its final place first and then jumping back to the field.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (focus) el.focus({ preventScroll: true });
    let anim;
    let ghost = null;
    let launch = 0;
    let alive = true;
    if (fly && !long && !reduce) {
      // The page is about to be put back at the top for the new question
      // (QaApp.componentDidUpdate, which runs after this); it is done here
      // first so the heading is measured where it will actually be.
      const scroller = document.getElementById('riva-scroll');
      if (scroller) scroller.scrollTop = 0;
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el);
      const first = range.getClientRects()[0] || box;
      const cs = window.getComputedStyle(el);
      const size = parseFloat(cs.fontSize) || 32;
      const mid = first.top + first.height / 2;
      // The copy: the heading's words in the heading's type, laid over the
      // heading's own box, so where it ends is exactly where the heading is.
      ghost = document.createElement('div');
      ghost.className = 'riva-fly';
      ghost.setAttribute('aria-hidden', 'true');
      ghost.textContent = el.textContent;
      Object.assign(ghost.style, {
        left: box.left + 'px', top: box.top + 'px', width: box.width + 'px',
        font: cs.font, letterSpacing: cs.letterSpacing,
        // Grown from the start of its first line, which is where the words
        // were sitting in the field.
        transformOrigin: (first.left - box.left) + 'px ' + (mid - box.top) + 'px',
      });
      document.body.appendChild(ghost);
      el.style.opacity = '0';
      // The field's placeholder is held back while the words are still on
      // their way out of it, or the two lines of text sit on top of each
      // other for the first frames of the journey. (A ::placeholder cannot
      // be animated, so it is simply held for a moment.)
      const composer = document.querySelector('.riva-composer');
      if (composer) {
        composer.classList.add('is-launching');
        launch = setTimeout(() => composer.classList.remove('is-launching'), 260);
      }
      anim = animate(ghost, {
        x: [fly.left - first.left, 0],
        y: [fly.top - mid, 0],
        scale: [fly.size / size, 1],
      }, { duration: 0.6, ease: EASE });
      anim.then(() => {
        if (!alive) return;
        // Landed: the heading takes over under the copy as the copy goes.
        el.style.opacity = '';
        animate(el, { opacity: [0, 1] }, { duration: 0.14 });
        const g = ghost;
        animate(g, { opacity: [1, 0] }, { duration: 0.14 }).then(() => g.remove());
        ghost = null;
      });
    } else {
      anim = animate(el, { opacity: [0, 1], y: [reduce ? 0 : 8, 0] }, { duration: reduce ? 0.12 : 0.32, ease: EASE });
    }
    return () => {
      alive = false;
      if (anim) anim.stop();
      if (ghost) ghost.remove();
      if (launch) {
        clearTimeout(launch);
        const composer = document.querySelector('.riva-composer');
        if (composer) composer.classList.remove('is-launching');
      }
      el.style.opacity = '';
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!long) {
    return <h1 ref={ref} tabIndex={-1} className="riva-turn-q">{text}</h1>;
  }

  return (
    <div ref={ref} tabIndex={-1} className="riva-turn-qwrap">
      <h1 className="riva-turn-q is-long">{opening(text)}</h1>
      <div className="riva-pasted">
        <div className="riva-pasted__label">What was pasted</div>
        <div className={'riva-pasted__text' + (open ? '' : ' is-folded')}>{text}</div>
        <button type="button" className="rv-btn rv-btn--plain rv-btn--sm riva-pasted__more" onClick={() => setOpen(!open)}>
          {open ? 'Show less' : 'Show the whole message'}
        </button>
      </div>
    </div>
  );
}

/**
 * The heading's last word, turning over: what staff come here to do, one
 * at a time, each arriving a letter at a time out of a blur (the 21st.dev
 * "Text Rotate"). The width eases between words rather than jumping, so the
 * centred line does not twitch. Read as one plain sentence by a screen
 * reader, and held on the first word where less motion is asked for — and
 * held on whatever word it is on once somebody starts typing under it,
 * because a heading still turning over the field is a distraction from it.
 */
const HERO_WORDS = ['find', 'book', 'refer', 'check', 'send'];
function HeroRotator({ paused = false }) {
  const [i, setI] = React.useState(0);
  const [w, setW] = React.useState(null);
  const measure = React.useRef(null);
  React.useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % HERO_WORDS.length), 2800);
    return () => clearInterval(t);
  }, [paused]);
  React.useLayoutEffect(() => {
    if (measure.current) setW(measure.current.offsetWidth);
  }, [i]);
  const word = HERO_WORDS[i];
  return (
    <span className="riva-rotate" style={w ? { width: w + 'px' } : undefined}>
      <span ref={measure} className="riva-rotate-measure" aria-hidden="true">{word}</span>
      <span key={word} className="riva-rotate-word" aria-hidden="true">
        {word.split('').map((ch, k) => (
          <span key={k} className="riva-rotate-ch" style={{ animationDelay: k * 32 + 'ms' }}>{ch}</span>
        ))}
      </span>
    </span>
  );
}

// "Answer ready", said once to a screen reader when the answer on screen
// stops being worked out. The working line had its own live region, but it
// is gone the moment the answer arrives, so the arrival itself was silent.
// Keyed on the question by the caller, so opening another question is not
// mistaken for its answer arriving.
function Announcer({ status }) {
  const prev = React.useRef(status);
  const [said, setSaid] = React.useState('');
  React.useEffect(() => {
    const was = prev.current;
    prev.current = status;
    if (was !== 'loading' || status === 'loading') return;
    setSaid({
      done: 'Answer ready.',
      error: 'Couldn’t get an answer.',
      stopped: 'Answer stopped.',
      declined: 'This question can’t be answered here.',
    }[status] || '');
  }, [status]);
  return <span className="rv-sr" role="status" aria-live="polite">{said}</span>;
}

const HISTORY_STATUS = {
  working: 'still being worked out',
  failed: 'couldn’t get an answer',
  stopped: 'stopped',
};

export default function ChatView({ v }) {
  const lastAi = v.turn ? v.turn.items.filter((m) => m && m.isAi).pop() : null;
  return (
    <div className="riva-column" style={s('position:relative;max-width:688px;margin:0 auto;padding:28px 24px 28px;display:flex;flex-direction:column;')}>

      {/* Leaves rather than vanishing when the first question is asked:
          it lifts away into a blur while the question takes the top of the
          page. Taken out of the flow as it goes (popLayout), so it holds
          nothing up while it fades. Its lines arrive by CSS (.riva-hero-block
          > *), so this element itself only ever animates on the way out. */}
      <AnimatePresence initial={false} mode="popLayout">
        {v.isEmpty && (
          // Sits a fixed margin above the dock, which is centred while nothing
          // has been asked. Where that is on the page is worked out from the
          // dock's own geometry in globals.css (.riva-hero-block), so the gap
          // between this text and the field holds on every screen size.
          <motion.div key="hero" className="riva-hero-block" style={s('text-align:center;')}
            exit={{ opacity: 0, y: -14, filter: 'blur(6px)', transition: { duration: 0.22, ease: EASE_EXIT } }}>
            <h1 className="riva-hero-h1" aria-label="What do you need to find?"
              style={s('font-size:56px;font-weight:800;letter-spacing:-0.04em;margin:0;line-height:1.05;color:var(--rv-ink);')}>
              <span aria-hidden="true">What do you need to <HeroRotator paused={!!v.input} />?</span>
            </h1>
            {/* Only when the host page sets one. The default is nothing: a line
                explaining what can be asked is read once and then sits there. */}
            {v.welcome && <p style={s('font-size:17px;color:#4c6272;max-width:52ch;margin:10px auto 0;text-wrap:pretty;')}>{v.welcome}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimised history — one numbered row per question, on a card of its
          own, the whole row a button. A question still being worked out, or
          one that failed, says so on its row, so a reader reading something
          else can see the answer they left is not lost. */}
      {v.hasHistory && (
        <div className="riva-history rv-card">
          {v.history.map((t) => (
            <button key={t.key} type="button" className="riva-history-row" onClick={t.onOpen}
              aria-label={'Show answer to: ' + t.question + (t.status ? ' (' + HISTORY_STATUS[t.status] + ')' : '')}>
              <span className="riva-history-num">{t.num}</span>
              <span className="riva-history-q">{t.question}</span>
              {t.status && <span className={'riva-history-dot is-' + t.status} title={HISTORY_STATUS[t.status]} aria-hidden="true" />}
              <span className="riva-history-chev" aria-hidden="true"><Svg w={16} sw={2.2}>{Icons.chevronRight}</Svg></span>
            </button>
          ))}
        </div>
      )}

      {/* The active question. Keyed on the turn, so a question opened in its
          place arrives the way a new one does. The one it replaces goes at
          once rather than fading over it: it has already become its row in
          the card above, and two questions laid over each other for a
          moment read as a glitch, not a change. */}
      {v.turn && (
        <div key={v.turn.key} className="riva-turn">
          <div className="riva-turn-head">
            {/* A pasted consultation is not a heading — see TurnQuestion. */}
            <TurnQuestion question={v.turn.question} fly={v.turn.flyFrom} focus={v.turn.focusOnMount} />
            {(v.turn.askedAs || v.turn.imageNote || v.turn.redactedNote || v.turn.hasDocs || v.turn.hasImages) && (
              <motion.div className="riva-turn-meta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.25 }}>
                {/* WHICH KIND OF ANSWER THIS WAS ASKED FOR. Without it a wrong
                    answer has nothing on screen explaining which list it came from. */}
                {v.turn.askedAs && <span className="rv-chip rv-chip--accent">Asked as {v.turn.askedAs}</span>}
                {v.turn.imageNote && <span className="riva-turn-imgnote">{v.turn.imageNote}</span>}
                {/* What the local identifier check took out of this question
                    before it was sent. The toast that said so has gone by now;
                    the question on screen has a hole in it and this is the only
                    thing that explains it. It counts what went and quotes none of
                    it — see lib/safety/identifiers.mjs. */}
                {v.turn.redactedNote && (
                  <div className="riva-turn-note">
                    <Svg w={15} sw={2.2} style={s('flex:none;margin-top:2px;')}>{Icons.triangle}</Svg>
                    <span>{v.turn.redactedNote}</span>
                  </div>
                )}
                {/* The documents this question was asked about. Named, because an
                    answer about "the letter" has to say which letter — and because
                    nothing here is stored, so this is the only record of it. */}
                {v.turn.hasDocs && (
                  <div className="riva-turn-docs">
                    {v.turn.docNames.map((name, j) => (
                      <span key={j} className="rv-chip riva-turn-doc">
                        <Svg w={12} sw={2.2} style={s('flex:none;')}>{Icons.file}</Svg>
                        <span className="riva-turn-doc__name">{name}</span>
                      </span>
                    ))}
                  </div>
                )}
                {v.turn.hasImages && (
                  <div className="riva-turn-docs">
                    {v.turn.images.map((src, j) => (
                      <img key={j} src={src} alt="Attached image" className="riva-turn-img" />
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* The answer comes in under the question a beat after it, once the
              heading has mostly landed. */}
          {v.turn.items.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: EASE, delay: 0.12 + i * 0.08 }}>
              {m.isAnswer && <GuideCard v={m} />}
              {m.isSuggest && <SuggestBubble v={m} />}
              {m.isAi && <AiAnswer v={m} />}
            </motion.div>
          ))}

          {v.isViewingHistory && (
            <button type="button" className="rv-btn rv-btn--quiet rv-btn--sm riva-latest" onClick={v.onLatest}>
              <Svg w={14} sw={2.4}>{Icons.chevronDown}</Svg>
              Back to the latest question
            </button>
          )}
        </div>
      )}

      {v.turn && <Announcer key={'said-' + v.turn.key} status={lastAi ? lastAi.status : ''} />}
    </div>
  );
}
