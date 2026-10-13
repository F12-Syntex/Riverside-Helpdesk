/* ------------------------------------------------------------------ *
 * Themes: the light behind the page.
 *
 * The colours are always Mist. A theme is no longer a palette — five
 * palettes were five ways of tinting the same metaballs, and the cards
 * on top had to read on every one of them. It is now WHICH background
 * is drawn: the moving gradients and patterns from 21st.dev (most of
 * them Paper Shaders, by way of its Shader Builder), each painted in
 * the same three quiet blue-greys on the page's near-white, so a white
 * card and an NHS-blue button look the same on all of them.
 *
 * One canvas draws whichever is chosen, behind every page
 * (PageBackground.jsx); the shaders themselves are in backgrounds.js.
 * Nothing here changes the controls, which stay NHS blue.
 *
 * The choice lives in localStorage and on <html data-bg>. The layout
 * sets the attribute before the first paint (THEME_BOOT), so a reload
 * never flashes the default and then swaps.
 * ------------------------------------------------------------------ */

// Mist: the page, then the three colours every background is drawn in,
// light to strong. Kept in step with --rv-sky-* in globals.css, which
// hands the same colours to everything CSS draws.
export const MIST = {
  base: '#f8fafc',
  colors: ['#8fa6b8', '#c3d1dc', '#7fa7c9'],
};

// The backgrounds, in the order the picker shows them. `source` is the
// 21st.dev component each one is, and `credit` whose it is; `still` is
// drawn by CSS alone (see .riva-sky).
export const THEMES = [
  { id: 'swirl', label: 'Swirl', credit: 'tom_ui', source: 'Animated Gradient' },
  { id: 'mesh', label: 'Mesh', credit: 'Paper Shaders', source: 'Mesh Gradient' },
  { id: 'grain', label: 'Grain', credit: 'Paper Shaders', source: 'Grain Gradient' },
  { id: 'waves', label: 'Waves', credit: 'Paper Shaders', source: 'Waves' },
  { id: 'aurora', label: 'Aurora', credit: 'Aceternity', source: 'Aurora Background' },
  { id: 'metaballs', label: 'Metaballs', credit: 'Paper Shaders', source: 'Metaballs' },
  { id: 'dots', label: 'Dots', credit: 'Paper Shaders', source: 'Dot Grid' },
  { id: 'still', label: 'Still', credit: 'No motion', source: null },
];

export const THEME_KEY = 'riva-background';
// The key the old colour themes were kept under. Read by nothing now; the
// boot script clears it so a stale palette name never lingers.
const OLD_THEME_KEY = 'riva-theme';
export const DEFAULT_THEME = 'swirl';

export const themeById = (id) => THEMES.find((t) => t.id === id)
  || THEMES.find((t) => t.id === DEFAULT_THEME);

export function readTheme() {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return themeById(document.documentElement.dataset.bg).id;
}

// Sets the background everywhere at once: the attribute the CSS reads,
// the key the next page load reads, and an event the canvas listens for.
export function applyTheme(id) {
  const theme = themeById(id);
  document.documentElement.dataset.bg = theme.id;
  try { localStorage.setItem(THEME_KEY, theme.id); } catch (e) {}
  window.dispatchEvent(new CustomEvent('riva-background', { detail: theme.id }));
  return theme.id;
}

// Run inline in <head>, before anything paints.
export const THEME_BOOT = `(function(){var d=document.documentElement;try{localStorage.removeItem('${OLD_THEME_KEY}');var t=localStorage.getItem('${THEME_KEY}');if(!/^(${THEMES.map((t) => t.id).join('|')})$/.test(t||''))t='${DEFAULT_THEME}';d.dataset.bg=t;}catch(e){d.dataset.bg='${DEFAULT_THEME}';}})();`;

// A hex colour as the normalised RGB triple a shader uniform wants.
export const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
