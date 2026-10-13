'use client';

import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Svg, Icons } from '../ui';
import { EASE, EASE_EXIT } from './motion.mjs';

/* ------------------------------------------------------------------ *
 * "There is more below", and the way to it.
 *
 * A question opens at the top of the page and its answer grows down from
 * there (QaApp.componentDidUpdate), which is right for reading and wrong
 * for knowing: a long answer ran on under the dock's fade with nothing to
 * say it had, and a phone does not even draw a scrollbar. So when the page
 * runs on more than a short way past the dock, a pill sits just above the
 * field saying so — "Answer continues" while it is still being written,
 * "Jump to end" once it is not — and takes the reader there.
 *
 * Having gone to the end — by the pill, or by scrolling there themselves —
 * the reader is kept there while the page under them is still growing (the
 * answer still being written, or still being revealed after it was), until
 * they scroll back up. Nobody else is ever moved: a short answer growing
 * past the dock under a reader who has not scrolled leaves the question
 * where it is, at the top. The page is watched rather than told: a scroll,
 * or a change in the size of what is in it, and the pill decides again
 * (after the 21st.dev Message Scroller and Scroll Button, and the round
 * "↓" over ChatGPT's composer).
 * ------------------------------------------------------------------ */

// How far past the foot the page has to run before it is worth a pill, and
// for how long: an answer settling — its card easing to its final height,
// its row arriving — passes through "more below" for a moment, and a pill
// that blinked up for that would be noise.
// The page's own foot is padding the height of the dock and a little more,
// so the last line of an answer is in sight until the page runs on past
// that by more than the action row under it.
const SHOW_PAST = 140;
const SHOW_AFTER = 220;
// How close to the foot counts as being at it.
const AT_FOOT = 24;

export default function ScrollPill({ turnKey, live }) {
  const reduce = useReducedMotion();
  const [show, setShow] = React.useState(false);
  // Following the foot of a growing answer, and the moment a jump started —
  // the smooth scroll passes through "not at the foot" on its way there, and
  // must not read as the reader leaving.
  const follow = React.useRef(false);
  const jumping = React.useRef(0);

  React.useEffect(() => {
    const el = document.getElementById('riva-scroll');
    if (!el) return undefined;
    const content = el.firstElementChild;
    const gap = () => el.scrollHeight - el.scrollTop - el.clientHeight;
    let wait = 0;
    const check = () => {
      if (gap() <= SHOW_PAST) { clearTimeout(wait); wait = 0; setShow(false); return; }
      if (!wait) wait = setTimeout(() => { wait = 0; setShow(gap() > SHOW_PAST); }, SHOW_AFTER);
    };
    // At the foot only counts once the page has been scrolled at all: a page
    // too short to scroll is "at the foot" without anybody having gone there.
    const onScroll = () => {
      if (performance.now() > jumping.current) follow.current = el.scrollTop > 0 && gap() < AT_FOOT;
      check();
    };
    const onResize = () => {
      if (follow.current) {
        if (performance.now() > jumping.current) el.scrollTop = el.scrollHeight;
        else el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
      }
      check();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onResize) : null;
    if (ro) { ro.observe(el); if (content) ro.observe(content); }
    check();
    return () => { clearTimeout(wait); el.removeEventListener('scroll', onScroll); if (ro) ro.disconnect(); };
  }, [reduce, turnKey]);

  // A new question starts at its top, and nobody is following anything.
  React.useEffect(() => { follow.current = false; jumping.current = 0; }, [turnKey]);

  const jump = () => {
    const el = document.getElementById('riva-scroll');
    if (!el) return;
    follow.current = true;
    jumping.current = performance.now() + 700;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.button key="pill" type="button" className="riva-jump" onClick={jump}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: EASE } }}
          exit={{ opacity: 0, y: 6, scale: 0.96, transition: { duration: 0.16, ease: EASE_EXIT } }}>
          {live ? <span className="riva-live-dot" aria-hidden="true" /> : <Svg w={15} sw={2.4}>{Icons.chevronDown}</Svg>}
          {live ? 'Answer continues' : 'Jump to end'}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
