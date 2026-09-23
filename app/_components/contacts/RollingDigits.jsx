'use client';

// Rolling digits: each digit springs and rolls vertically into place when
// the number changes. Ported from the 21st.dev "Rolling Digits" component
// (@edwinvakayil) to this app's plain CSS: same springs and right-anchored
// digit keys, without Tailwind or the value queue we do not need.
import React from 'react';
import { AnimatePresence, motion, useReducedMotion, useSpring } from 'motion/react';

const ENTER = { stiffness: 170, damping: 14 };
const EXIT = { stiffness: 170, damping: 15 };
const Y = 22;

const isDigit = (c) => /\d/.test(c);

// Keys count digits from the right, so "9,999" → "10,000" keeps the units in
// the units' cell and only grows on the left.
function cells(text) {
  const chars = String(text).split('');
  let fromRight = 0;
  const keys = new Array(chars.length);
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    keys[i] = isDigit(chars[i]) ? 'd' + (fromRight++) : 's' + fromRight;
  }
  return chars.map((char, i) => ({ key: keys[i], char, digit: isDigit(char) }));
}

function Digit({ char }) {
  const [leaving, setLeaving] = React.useState([]);
  const prev = React.useRef(char);
  const y = useSpring(0, ENTER);
  const opacity = useSpring(1, ENTER);

  React.useEffect(() => {
    const was = prev.current;
    prev.current = char;
    if (was === char) return;
    const up = Number(char) > Number(was);
    const id = Math.random();
    setLeaving((l) => [...l, { id, char: was, to: up ? -Y : Y }]);
    y.jump(up ? Y : -Y);
    opacity.jump(0);
    y.set(0);
    opacity.set(1);
  }, [char, y, opacity]);

  return (
    <span className="rd-cell">
      <AnimatePresence>
        {leaving.map((l) => (
          <motion.span key={l.id} aria-hidden="true" initial={{ opacity: 1, y: 0 }} animate={{ opacity: 0, y: l.to }}
            transition={{ type: 'spring', ...EXIT }}
            onAnimationComplete={() => setLeaving((q) => q.filter((x) => x.id !== l.id))}>
            {l.char}
          </motion.span>
        ))}
      </AnimatePresence>
      <motion.span style={{ y, opacity }}>{char}</motion.span>
    </span>
  );
}

const CSS = `
.rd{display:inline-flex;align-items:center;font-variant-numeric:tabular-nums;}
.rd-cell{position:relative;display:inline-grid;place-items:center;overflow:hidden;line-height:1.15;min-width:1ch;}
.rd-cell > *{grid-area:1/1;backface-visibility:hidden;}
`;

/**
 * `value` counts up from `from` in a few quick steps when it first arrives,
 * then rolls to any later value directly.
 */
export default function RollingDigits({ value, from = 0, className = '' }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = React.useState(reduce ? value : from);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (reduce || !value) { setShown(value); return undefined; }
    if (started.current) { setShown(value); return undefined; }
    started.current = true;
    const steps = [0.2, 0.45, 0.7, 0.88, 0.97, 1];
    const timers = steps.map((f, i) => setTimeout(() => setShown(Math.round(from + (value - from) * f)), 90 * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, [value, from, reduce]);

  const text = Number(shown || 0).toLocaleString('en-GB');
  return (
    <span className={'rd ' + className}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <span className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {Number(value || 0).toLocaleString('en-GB')}
      </span>
      <span aria-hidden="true" className="rd">
        {cells(text).map((c) => (c.digit ? <Digit key={c.key} char={c.char} /> : <span key={c.key}>{c.char}</span>))}
      </span>
    </span>
  );
}
