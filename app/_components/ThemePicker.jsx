'use client';

import React from 'react';
import { Svg, Icons } from './ui';
import { THEMES, themeById, readTheme, applyTheme, DEFAULT_THEME } from './theme';
import { backgroundStills } from './backgrounds';

/* ------------------------------------------------------------------ *
 * The theme picker: a swatch in the bar, and the backgrounds under it.
 *
 * The colours are always Mist; what is chosen is the background — the
 * moving gradients and patterns from 21st.dev (see theme.js). Each is a
 * tile: a still of the background itself, drawn by its own shader the
 * first time the picker opens (backgrounds.js), its name, where it came
 * from, and a tick on the one in use. Choosing one changes the page at
 * once and the picker stays open, so the next can be tried.
 *
 * Still has no shader: its tile is the CSS light it is drawn with.
 * Without WebGL every tile falls back to the same.
 * ------------------------------------------------------------------ */

// The swatch in the bar: the chosen background in a circle, or the Mist
// colours turned round one until its still has been drawn.
const MIST_DOT = 'radial-gradient(circle at 30% 28%, rgba(255,255,255,.95) 0 8%, rgba(255,255,255,0) 34%),'
  + 'conic-gradient(from 210deg, var(--rv-sky-a), var(--rv-sky-b), var(--rv-sky-c), var(--rv-sky-a))';

export default function ThemePicker() {
  const [open, setOpen] = React.useState(false);
  // The server does not know the theme; the attribute set before paint does.
  const [theme, setTheme] = React.useState(DEFAULT_THEME);
  const [stills, setStills] = React.useState({});
  const ref = React.useRef(null);
  const btnRef = React.useRef(null);
  const listRef = React.useRef(null);

  React.useEffect(() => { setTheme(readTheme()); }, []);

  // The stills are drawn once, on the first open, and kept: before then
  // the bar shows the Mist swatch, which costs nothing.
  React.useEffect(() => {
    if (!open) return undefined;
    const id = requestAnimationFrame(() => setStills(backgroundStills()));
    return () => cancelAnimationFrame(id);
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    // Esc closes the picker and nothing else (a referral open under it
    // stays open: its own Esc handler skips a handled key), and hands
    // focus back to the swatch rather than to the page's body.
    const key = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      if (btnRef.current) btnRef.current.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    // Focus goes to the background in use, so the arrow keys start there.
    const on = listRef.current && listRef.current.querySelector('[aria-checked="true"]');
    if (on) on.focus({ preventScroll: true });
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const current = themeById(theme);
  const choose = (id) => setTheme(applyTheme(id));

  // A radio group moves with the arrow keys: left/up back, right/down on.
  function onListKey(e) {
    const step = { ArrowRight: 1, ArrowDown: 2, ArrowLeft: -1, ArrowUp: -2 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = THEMES.findIndex((t) => t.id === theme);
    const next = THEMES[(i + step + THEMES.length) % THEMES.length];
    choose(next.id);
    const el = listRef.current && listRef.current.querySelector(`[data-bg-id="${next.id}"]`);
    if (el) el.focus();
  }

  return (
    <div ref={ref} className="riva-theme">
      <button ref={btnRef} type="button" className={'riva-top-btn riva-theme-btn' + (open ? ' is-on' : '')}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'}
        aria-label={'Background: ' + current.label} title={'Background: ' + current.label}>
        <span className="riva-theme-dot"
          style={{ background: stills[current.id] ? `center / cover url(${stills[current.id]})` : MIST_DOT }} />
      </button>
      {open && (
        <div className="riva-theme-pop" role="dialog" aria-label="Background">
          <div className="riva-theme-head">
            <div className="riva-theme-title">Background</div>
            <div className="riva-theme-sub">From 21st.dev, always in Mist. Buttons and links stay NHS blue.</div>
          </div>
          <div ref={listRef} className="riva-theme-list" role="radiogroup" aria-label="Background" onKeyDown={onListKey}>
            {THEMES.map((t, i) => {
              const on = t.id === theme;
              const still = stills[t.id];
              return (
                <button key={t.id} type="button" role="radio" aria-checked={on} data-bg-id={t.id}
                  tabIndex={on ? 0 : -1}
                  title={t.source ? t.source + ' by ' + t.credit + ', on 21st.dev' : t.label}
                  className={'riva-theme-opt' + (on ? ' is-on' : '')} style={{ animationDelay: i * 22 + 'ms' }}
                  onClick={() => choose(t.id)}>
                  <span className={'riva-theme-preview' + (still ? '' : ' is-css')} aria-hidden="true"
                    style={still ? { backgroundImage: `url(${still})` } : undefined}>
                    <span className="riva-theme-check"><Svg w={13} sw={2.8}>{Icons.check}</Svg></span>
                  </span>
                  <span className="riva-theme-text">
                    <span className="riva-theme-label">{t.label}</span>
                    <span className="riva-theme-credit">{t.credit}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
