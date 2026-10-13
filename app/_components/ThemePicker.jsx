'use client';

import React from 'react';
import { Svg, Icons } from './ui';
import { THEMES, themeById, readTheme, applyTheme, DEFAULT_THEME } from './theme';

/* ------------------------------------------------------------------ *
 * The theme picker: a swatch in the bar, and a short list under it.
 *
 * Each theme is a row: a small window onto its colours — the three the
 * light behind the page is made of, blended as they are on the page —
 * its name, and a tick on the one in use. Choosing one changes the page
 * at once and the list stays open, so the next can be tried. Five
 * palettes, all quiet — see app/_components/theme.js for what a theme
 * does and does not change.
 * ------------------------------------------------------------------ */

const swatch = (t) => ({
  background: `radial-gradient(circle at 30% 28%, rgba(255,255,255,.95) 0 8%, rgba(255,255,255,0) 34%),`
    + `conic-gradient(from 210deg, ${t.colors[0]}, ${t.colors[1]}, ${t.colors[2]}, ${t.colors[0]})`,
});

// The colours as they sit behind the page: three soft pools on near-white.
const preview = (t) => ({
  background: `radial-gradient(70% 90% at 18% 30%, ${t.colors[0]} 0%, transparent 70%),`
    + `radial-gradient(70% 90% at 82% 22%, ${t.colors[1]} 0%, transparent 72%),`
    + `radial-gradient(80% 90% at 58% 100%, ${t.colors[2]} 0%, transparent 70%), #f8fafc`,
});

export default function ThemePicker() {
  const [open, setOpen] = React.useState(false);
  // The server does not know the theme; the attribute set before paint does.
  const [theme, setTheme] = React.useState(DEFAULT_THEME);
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

  return (
    <div ref={ref} className="riva-theme">
      <button type="button" className={'riva-top-btn riva-theme-btn' + (open ? ' is-on' : '')}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog" aria-expanded={open ? 'true' : 'false'}
        aria-label={'Theme: ' + current.label} title={'Theme: ' + current.label}>
        <span className="riva-theme-dot" style={swatch(current)} />
      </button>
      {open && (
        <div className="riva-theme-pop" role="dialog" aria-label="Theme">
          <div className="riva-theme-head">
            <div className="riva-theme-title">Theme</div>
            <div className="riva-theme-sub">The colours behind the page. Buttons and links stay NHS blue.</div>
          </div>
          <div className="riva-theme-list" role="radiogroup" aria-label="Theme">
            {THEMES.map((t, i) => {
              const on = t.id === theme;
              return (
                <button key={t.id} type="button" role="radio" aria-checked={on}
                  className={'riva-theme-opt' + (on ? ' is-on' : '')} style={{ animationDelay: i * 25 + 'ms' }}
                  onClick={() => setTheme(applyTheme(t.id))}>
                  <span className="riva-theme-preview" style={preview(t)} aria-hidden="true" />
                  <span className="riva-theme-label">{t.label}</span>
                  <span className="riva-theme-check" aria-hidden="true"><Svg w={15} sw={2.6}>{Icons.check}</Svg></span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
