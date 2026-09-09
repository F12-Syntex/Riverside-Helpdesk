'use client';

/* ------------------------------------------------------------------ *
 * GradientBackground — from the 21st.dev Gradient Builder ("Almoayyed"),
 * exported as live CSS: the builder's own background recipe plus its
 * grain pass. No dependencies and no Tailwind — one <div> that fills its
 * parent, written in this project's inline-style idiom.
 *
 *   <div style={s('position:relative;height:400px;')}>
 *     <GradientBackground style={s('position:absolute;inset:0;')} />
 *   </div>
 *
 * Remix the source recipe (colours, mode, finish) in the editor:
 * https://21st.dev/community/gradients/editor?from=dc893a4f-0b29-4732-9b29-d4de9c0b70ee
 *
 * TONES
 * -----
 * `almoayyed` is the recipe exactly as exported: near-black maroon and
 * plum on warm grey. It is kept whole so it can still be compared with
 * the editor, but it is not what the Q&A uses — this page sets #212b32
 * text straight over its background, and dark text on those blobs
 * cannot be read.
 *
 * `nhs` keeps the geometry, blend and grain and swaps the palette for
 * the page's own — the practice grey-blue, NHS blue, NHS light blue —
 * at strengths that leave body text well clear of the contrast floor.
 * That is the default.
 * ------------------------------------------------------------------ */

const NOISE = "url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.280'/></svg>\")";

const TONES = {
  // The exported recipe, verbatim.
  almoayyed: {
    backgroundColor: '#D7D5D5',
    layers: [
      'radial-gradient(circle at 66.94% 46.43%, rgba(215, 213, 213, 1) 0%, rgba(215, 213, 213, 0.844) 19.02%, rgba(215, 213, 213, 0.5) 38.05%, rgba(215, 213, 213, 0.156) 57.07%, rgba(215, 213, 213, 0) 76.1%)',
      'radial-gradient(circle at 34.69% 66.31%, rgba(49, 5, 39, 1) 0%, rgba(49, 5, 39, 0.844) 12.73%, rgba(49, 5, 39, 0.5) 25.45%, rgba(49, 5, 39, 0.156) 38.18%, rgba(49, 5, 39, 0) 50.9%)',
      'radial-gradient(circle at 48.93% 19.32%, rgba(57, 5, 31, 1) 0%, rgba(57, 5, 31, 0.844) 16.75%, rgba(57, 5, 31, 0.5) 33.5%, rgba(57, 5, 31, 0.156) 50.25%, rgba(57, 5, 31, 0) 67%)',
      'radial-gradient(circle at 80.23% 87.54%, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.844) 10.28%, rgba(255, 255, 255, 0.5) 20.55%, rgba(255, 255, 255, 0.156) 30.83%, rgba(255, 255, 255, 0) 41.1%)',
    ],
    grain: 0.28,
  },
  // The same shape in the practice's palette, kept light enough to read
  // over: a pale wash rather than colour — mint at the top right, NHS
  // blue low on the left, a lilac cast between them, all under white.
  nhs: {
    backgroundColor: '#eef3f6',
    layers: [
      'radial-gradient(circle at 78% 12%, rgba(196, 232, 226, 0.85) 0%, rgba(196, 232, 226, 0.45) 28%, rgba(196, 232, 226, 0.14) 52%, rgba(196, 232, 226, 0) 70%)',
      'radial-gradient(circle at 14% 84%, rgba(179, 202, 232, 0.8) 0%, rgba(179, 202, 232, 0.42) 26%, rgba(179, 202, 232, 0.13) 50%, rgba(179, 202, 232, 0) 68%)',
      'radial-gradient(circle at 88% 78%, rgba(206, 205, 236, 0.6) 0%, rgba(206, 205, 236, 0.3) 24%, rgba(206, 205, 236, 0.08) 46%, rgba(206, 205, 236, 0) 64%)',
      'radial-gradient(circle at 46% 40%, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0.7) 22%, rgba(255, 255, 255, 0.35) 42%, rgba(255, 255, 255, 0) 66%)',
    ],
    grain: 0.1,
  },
};

export default function GradientBackground({ className = '', style, tone = 'nhs', grain, drift = true, vignette = true }) {
  const recipe = TONES[tone] || TONES.nhs;
  const grainOpacity = grain == null ? recipe.grain : grain;
  // The filter id is per tone, so two backgrounds on one page cannot
  // borrow each other's noise.
  const filterId = 'riva-grain-' + tone;

  return (
    <div
      aria-hidden="true"
      className={className}
      style={Object.assign(
        { position: 'relative', overflow: 'hidden', width: '100%', height: '100%', containerType: 'size' },
        style,
      )}
    >
      {/* The gradient itself, drifting slowly under everything. It is
          scaled past the edges by the animation, so the blobs move
          without ever bringing a seam into view. */}
      <div
        className={drift ? 'riva-gradient-drift' : ''}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: recipe.backgroundColor,
          backgroundImage: [NOISE].concat(recipe.layers).join(', '),
          backgroundSize: '120px 120px, auto, auto, auto, auto',
          backgroundBlendMode: 'overlay, normal, normal, normal, normal',
        }}
      />

      {/* A wash of the page's own colour at the edges, so the gradient
          reads as light on the page rather than a picture placed behind
          it — and so text near the margins keeps its contrast. */}
      {vignette && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(125% 95% at 50% 42%, rgba(240,244,245,0) 38%, rgba(240,244,245,0.55) 74%, rgba(240,244,245,0.9) 100%)',
          }}
        />
      )}
      <svg
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: grainOpacity, mixBlendMode: 'overlay' }}
      >
        <filter id={filterId}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={'url(#' + filterId + ')'} />
      </svg>
    </div>
  );
}
