'use client';

import React from 'react';
import { THEMES, themeById, readTheme, applyTheme, DEFAULT_THEME } from './theme';

/* ------------------------------------------------------------------ *
 * The theme picker: a swatch in the bar, and a row of them under it.
 *
 * The shape of the 21st.dev "avatar picker": round swatches in a row,
 * the chosen one lifted and ringed, and its name said underneath. Five
 * palettes, all quiet — see app/_components/theme.js for what a theme
 * does and does not change.
 * ------------------------------------------------------------------ */

const swatch = (t) => ({
  background: `radial-gradient(circle at 30% 28%, rgba(255,255,255,.95) 0 8%, rgba(255,255,255,0) 34%),`
    + `conic-gradient(from 210deg, ${t.colors[0]}, ${t.colors[1]}, ${t.colors[2]}, ${t.colors[0]})`,
});

export default function ThemePicker() {
  const [open, setOpen] = React.useState(false);
  // The server does not know the theme; the attribute set before paint does.
  const [theme, setTheme] = React.useState(DEFAULT_THEME);
  const [hover, setHover] = React.useState(null);
  const ref = React.useRef(null);

  React.useEffect(() => { setTheme(readTheme()); }, []);

  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  const current = themeById(theme);
  const shown = themeById(hover || theme);

  return (
    <div ref={ref} className="riva-theme">
      <button type="button" className={'riva-top-btn riva-theme-btn' + (open ? ' is-on' : '')}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'}
        aria-label={'Theme: ' + current.label} title={'Theme — ' + current.label}>
        <span className="riva-theme-dot" style={swatch(current)} />
      </button>
      {open && (
        <div className="riva-theme-pop" role="dialog" aria-label="Theme">
          <div className="riva-theme-title">Theme</div>
          <div className="riva-theme-row" role="radiogroup" aria-label="Theme" onMouseLeave={() => setHover(null)}>
            {THEMES.map((t) => {
              const on = t.id === theme;
              return (
                <button key={t.id} type="button" role="radio" aria-checked={on} aria-label={t.label}
                  className={'riva-theme-opt' + (on ? ' is-on' : '')}
                  onMouseEnter={() => setHover(t.id)} onFocus={() => setHover(t.id)} onBlur={() => setHover(null)}
                  onClick={() => setTheme(applyTheme(t.id))}>
                  <span className="riva-theme-swatch" style={swatch(t)} />
                </button>
              );
            })}
          </div>
          {/* Keyed so the name slides in as it changes. */}
          <div key={shown.id} className="riva-theme-name">
            {shown.label}{shown.id === theme ? <span className="riva-theme-cur"> · in use</span> : null}
          </div>
        </div>
      )}
    </div>
  );
}
