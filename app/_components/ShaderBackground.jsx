'use client';

import React from 'react';

/* ------------------------------------------------------------------ *
 * ShaderBackground — the light behind every page.
 *
 * One WebGL fragment shader, no dependencies, fixed behind the whole
 * shell. It is the app's equivalent of the sky Emergent puts behind its
 * opening screen: a slow mesh-drift of the practice's own colours —
 * NHS blue, NHS light blue, a touch of aqua, with a soft violet and a
 * warm pink for the Stitch-like spread of hue — over a tinted base, so
 * that dark text reads over it anywhere. It moves at the speed of
 * weather, never faster.
 *
 * Written in the idiom of the 21st.dev Shader Builder exports ("Mesh
 * drift"): a palette, domain-warped value noise, a film-grain pass.
 * Kept in the same shape so a builder export can replace it later by
 * swapping the palette and the fragment body.
 *
 * WHAT IT DOES WHEN IT CANNOT
 * ---------------------------
 * No WebGL, a reduced-motion setting, or a lost context: the element
 * keeps a CSS gradient of the same palette and simply does not move.
 * The page never depends on the canvas being there.
 *
 * A LOST CONTEXT COMES BACK
 * -------------------------
 * A GPU reset, a phone reclaiming memory, or a hot reload re-running
 * this effect on the same canvas all lose the context. The browser only
 * restores one if the loss is not treated as final (preventDefault on
 * the event), and the programme has to be built again afterwards; the
 * CSS behind shows in between. The cleanup does NOT lose the context on
 * purpose: the next run of this effect gets the same canvas element and
 * would get the same, now dead, context handed back — which is exactly
 * what happened, and which left the page on its pale fallback after the
 * first edit of the session.
 *
 * COST
 * ----
 * One quad, drawn at a third of the screen's resolution and stretched
 * — it is a blur, so nothing is lost — at thirty frames a second, and
 * paused whenever the tab is hidden. It is the only continuous animation
 * on the page, and it stops the moment the reader says they want less
 * motion.
 * ------------------------------------------------------------------ */

const PALETTE = {
  // Base, and five lights, as normalised RGB.
  base:  [0.925, 0.950, 0.972], // #ecf2f8 — the page, already a tint
  blue:  [0.000, 0.369, 0.722], // #005eb8 — NHS blue
  light: [0.255, 0.714, 0.902], // #41b6e6 — NHS light blue
  aqua:  [0.000, 0.643, 0.600], // #00a499 — NHS aqua green
  // Two tints rather than brand colours, so the blue stays the thing the
  // page is made of.
  violet: [0.560, 0.470, 0.960],
  pink:   [0.980, 0.600, 0.760],
};

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_base;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_c4;
uniform vec3 u_c5;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = u_time * 0.04;

  // Domain warp: the field is folded through itself once, which is what
  // turns plain noise into the soft, cloud-like drift.
  vec2 q = vec2(fbm(p * 1.1 + vec2(t, -t * 0.7)), fbm(p * 1.1 + vec2(-t * 0.6, t * 0.9) + 3.7));
  vec2 r = p + 0.9 * (q - 0.5);
  float n1 = fbm(r * 1.3 + vec2(t * 0.5, 0.0));
  float n2 = fbm(r * 1.7 + vec2(-t * 0.3, t * 0.4) + 11.0);
  float n3 = fbm(r * 0.9 + vec2(t * 0.2, -t * 0.5) + 23.0);
  float n4 = fbm(r * 1.2 + vec2(-t * 0.45, -t * 0.25) + 41.0);
  float n5 = fbm(r * 1.5 + vec2(t * 0.35, t * 0.3) + 57.0);

  // Each light is anchored to a corner and is always there; the noise
  // only breathes it. Windows on noise alone drifted in and out, and for
  // long stretches the screen was mostly the base — the page read as
  // white with a gradient that passed through now and then.
  vec2 a = vec2(uv.x * aspect, uv.y);
  float aLight  = 1.0 - smoothstep(0.0, 1.25 * aspect, distance(a, vec2(0.95 * aspect, 0.92)));
  float aViolet = 1.0 - smoothstep(0.0, 1.20 * aspect, distance(a, vec2(0.04 * aspect, 0.94)));
  float aBlue   = 1.0 - smoothstep(0.0, 1.10 * aspect, distance(a, vec2(0.06 * aspect, 0.06)));
  float aPink   = 1.0 - smoothstep(0.0, 1.05 * aspect, distance(a, vec2(0.94 * aspect, 0.08)));
  float wLight  = aLight  * (0.55 + 0.45 * smoothstep(0.25, 0.80, n1));
  float wViolet = aViolet * (0.55 + 0.45 * smoothstep(0.25, 0.80, n4));
  float wBlue   = aBlue   * (0.55 + 0.45 * smoothstep(0.30, 0.82, n2));
  float wPink   = aPink   * (0.55 + 0.45 * smoothstep(0.30, 0.82, n5));
  float wAqua   = smoothstep(0.45, 0.88, n3) * 0.6;

  // Three lights, not five: light blue, NHS blue and a soft violet. The
  // pink and the aqua were two more things moving on a page that already
  // had enough moving on it.
  vec3 col = u_base;
  col = mix(col, u_c2, wLight  * 0.70);
  col = mix(col, u_c4, wViolet * 0.42);
  col = mix(col, u_c1, wBlue   * 0.45);
  col = mix(col, u_c2, wPink   * 0.25);

  // A touch of the base at the foot, so the dock sits on something calm.
  float foot = smoothstep(0.0, 0.42, uv.y);
  col = mix(u_base, col, 0.94 + 0.06 * foot);

  // Film grain, the same pass every Shader Builder export carries.
  float g = hash(gl_FragCoord.xy + fract(u_time)) - 0.5;
  col += g * 0.018;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

// Builds the programme on a (fresh or restored) context. Returns the
// uniform locations the frame loop needs, or null if the GPU refused.
function build(gl) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  gl.uniform3fv(gl.getUniformLocation(prog, 'u_base'), PALETTE.base);
  gl.uniform3fv(gl.getUniformLocation(prog, 'u_c1'), PALETTE.blue);
  gl.uniform3fv(gl.getUniformLocation(prog, 'u_c2'), PALETTE.light);
  gl.uniform3fv(gl.getUniformLocation(prog, 'u_c3'), PALETTE.aqua);
  gl.uniform3fv(gl.getUniformLocation(prog, 'u_c4'), PALETTE.violet);
  gl.uniform3fv(gl.getUniformLocation(prog, 'u_c5'), PALETTE.pink);
  return {
    uRes: gl.getUniformLocation(prog, 'u_res'),
    uTime: gl.getUniformLocation(prog, 'u_time'),
  };
}

// The still version: for every reader and machine the canvas is not for,
// and for the moment between a context being lost and coming back.
const FALLBACK =
  'radial-gradient(60% 55% at 82% 8%, rgba(65,182,230,.75) 0%, rgba(65,182,230,0) 70%),' +
  'radial-gradient(50% 50% at 12% 14%, rgba(143,120,245,.55) 0%, rgba(143,120,245,0) 70%),' +
  'radial-gradient(55% 60% at 10% 90%, rgba(0,94,184,.48) 0%, rgba(0,94,184,0) 70%),' +
  'radial-gradient(50% 50% at 88% 86%, rgba(65,182,230,.35) 0%, rgba(65,182,230,0) 70%),' +
  '#ecf2f8';

export default function ShaderBackground() {
  const ref = React.useRef(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return undefined;
    // The restore handle has to be taken while the context is alive — a
    // lost one answers null to getExtension — and it is kept on the canvas
    // node itself, which is what survives a hot reload of this module.
    if (!gl.isContextLost()) canvas.__rivaLose = gl.getExtension('WEBGL_lose_context');

    let alive = true;
    let raf = 0;
    let last = 0;
    let u = null;
    const start = performance.now();

    function size() {
      // A third of the screen, and never more than 640 across: the
      // shader is soft by design, so the browser scaling it up is free
      // detail nobody can see and a third of the pixels to shade.
      const scale = Math.min(0.34, 640 / Math.max(1, canvas.clientWidth));
      const w = Math.max(160, Math.floor(canvas.clientWidth * scale));
      const h = Math.max(90, Math.floor(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(u.uRes, w, h);
    }

    function draw() {
      if (!u || gl.isContextLost()) return;
      size();
      gl.uniform1f(u.uTime, (performance.now() - start) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Thirty frames a second is more than a drift this slow can use.
    function loop(now) {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (now - last < 33) return;
      last = now;
      draw();
    }

    function run() {
      cancelAnimationFrame(raf);
      raf = 0;
      if (!reduced && !document.hidden) raf = requestAnimationFrame(loop);
    }

    // Paints once and shows the canvas, on a fresh context and again on a
    // restored one. Nothing is shown until a frame exists, so the page
    // never flashes the fallback and then the shader.
    function begin() {
      u = build(gl);
      if (!u) return false;
      draw();
      canvas.style.opacity = '1';
      run();
      return true;
    }

    function onLost(e) {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
      u = null;
      canvas.style.opacity = '0';
    }
    function onRestored() { begin(); }
    function visibility() {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (u) run();
    }

    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    window.addEventListener('resize', draw);
    document.addEventListener('visibilitychange', visibility);

    // A context handed back already lost (this effect re-run on the same
    // canvas) is asked to come back; the restored event then builds it.
    if (gl.isContextLost()) {
      if (canvas.__rivaLose) canvas.__rivaLose.restoreContext();
    } else {
      begin();
    }

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      window.removeEventListener('resize', draw);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  return (
    <div aria-hidden="true" className="riva-sky" style={{ background: FALLBACK }}>
      <canvas ref={ref} className="riva-sky-canvas" />
    </div>
  );
}
