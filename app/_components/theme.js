/* ------------------------------------------------------------------ *
 * Themes: the colours of the light behind the page.
 *
 * Subtle on purpose. A theme changes the sky (ShaderBackground), the
 * working card's loader and progress bar, and the glass shapes on the
 * opening screen — never the controls, which stay NHS blue whichever is
 * chosen, so a button is found in the same colour on every screen.
 *
 * The choice lives in localStorage and on <html data-theme>. The layout
 * sets the attribute before the first paint (THEME_BOOT), so a reload
 * never flashes the default and then swaps.
 * ------------------------------------------------------------------ */

export const THEMES = [
  { id: 'sky', label: 'Sky', colors: ['#41b6e6', '#005eb8', '#8fd3f4'], intensity: 1 },
  { id: 'aurora', label: 'Aurora', colors: ['#41b6e6', '#00a499', '#8f78f5'], intensity: 1 },
  { id: 'dusk', label: 'Dusk', colors: ['#8f78f5', '#f59ac2', '#41b6e6'], intensity: 0.95 },
  { id: 'meadow', label: 'Meadow', colors: ['#00a499', '#78be20', '#41b6e6'], intensity: 0.9 },
  { id: 'mist', label: 'Mist', colors: ['#8fa6b8', '#c3d1dc', '#7fa7c9'], intensity: 0.8 },
];

export const THEME_KEY = 'riva-theme';
export const DEFAULT_THEME = 'sky';

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

export function readTheme() {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return themeById(document.documentElement.dataset.theme).id;
}

// Sets the theme everywhere at once: the attribute the CSS reads, the key
// the next page load reads, and an event the shader listens for.
export function applyTheme(id) {
  const theme = themeById(id);
  document.documentElement.dataset.theme = theme.id;
  try { localStorage.setItem(THEME_KEY, theme.id); } catch (e) {}
  window.dispatchEvent(new CustomEvent('riva-theme', { detail: theme.id }));
  return theme.id;
}

// Run inline in <head>, before anything paints.
export const THEME_BOOT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(!/^(${THEMES.map((t) => t.id).join('|')})$/.test(t||''))t='${DEFAULT_THEME}';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='${DEFAULT_THEME}';}})();`;

// A hex colour as the normalised RGB triple a shader uniform wants.
export const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
